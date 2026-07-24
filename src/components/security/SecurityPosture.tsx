import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import {
  Shield, Lock, Eye, Database, FileCheck, Activity,
  CheckCircle2, AlertTriangle, XCircle,
} from "lucide-react";

interface PostureItem {
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
  icon: React.ElementType;
  /** Live-checked against this organization's real data/config. Architectural
   *  items describe a platform-wide guarantee instead and are excluded from
   *  the score so the number never overstates what was actually verified. */
  verifiable: boolean;
}

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === "warning") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <XCircle className="w-4 h-4 text-destructive" />;
};

const SecurityPosture = () => {
  const { currentOrgId, currentOrg } = useOrganization();
  const [items, setItems] = useState<PostureItem[]>([]);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;

    const assess = async () => {
      setLoading(true);
      const checks: PostureItem[] = [];

      // 1–3. Platform-wide guarantees. These are true for every tenant by
      // construction (Supabase-managed storage encryption, enforced TLS,
      // and the RLS policies already shipped in the migration history) —
      // there is nothing per-organization to query, so they're disclosed
      // as architectural facts rather than counted as a "passing check".
      checks.push({
        label: "Row-Level Security",
        status: "pass",
        detail: "Platform-enforced — org-scoped RLS policies on every data table",
        icon: Database,
        verifiable: false,
      });
      checks.push({
        label: "Encryption at Rest",
        status: "pass",
        detail: "Platform-enforced — AES-256 on all storage volumes",
        icon: Lock,
        verifiable: false,
      });
      checks.push({
        label: "Encryption in Transit",
        status: "pass",
        detail: "Platform-enforced — TLS 1.2+ on all connections",
        icon: Lock,
        verifiable: false,
      });

      // 4. AI Data Boundary — live, from this org's real configuration.
      const aiEnabled = (currentOrg as any)?.ai_raw_text_enabled ?? false;
      checks.push({
        label: "AI Data Boundary",
        status: aiEnabled ? "warning" : "pass",
        detail: aiEnabled
          ? "Raw text enabled — PII may reach AI models"
          : "PII redacted by default before AI processing",
        icon: Eye,
        verifiable: true,
      });

      // 5. Audit Log Integrity — live: confirms the append-only log is
      // actually reachable and reports how many events this org has on
      // record, instead of asserting compliance regardless of reality.
      const { count: auditCount, error: auditError } = await supabase
        .from("audit_log")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", currentOrgId);
      checks.push({
        label: "Audit Log Integrity",
        status: auditError ? "fail" : "pass",
        detail: auditError
          ? "Could not verify audit log access"
          : `Append-only — ${auditCount ?? 0} event${auditCount === 1 ? "" : "s"} recorded to date`,
        icon: FileCheck,
        verifiable: true,
      });

      // 6. MFA check — live, from the current user's real auth factors.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const hasMfa = (factors?.totp?.length ?? 0) > 0;
      checks.push({
        label: "Multi-Factor Authentication",
        status: hasMfa ? "pass" : "warning",
        detail: hasMfa ? "TOTP MFA enrolled and active" : "MFA not enrolled — recommended for executives",
        icon: Shield,
        verifiable: true,
      });

      // 7. Rate Limiting — live: reads this org's actual configured quota
      // row instead of asserting a fixed limit that may not apply to it.
      const { data: workspaceRows } = await supabase
        .from("workspaces")
        .select("id")
        .eq("organization_id", currentOrgId);
      const workspaceIds = (workspaceRows ?? []).map((w) => w.id);
      const { data: quota } = workspaceIds.length
        ? await supabase
            .from("workspace_quotas")
            .select("max_api_calls_per_day, max_rows_per_day")
            .in("workspace_id", workspaceIds)
            .limit(1)
            .maybeSingle()
        : { data: null as { max_api_calls_per_day: number; max_rows_per_day: number } | null };
      checks.push({
        label: "Rate Limiting",
        status: quota ? "pass" : "warning",
        detail: quota
          ? `Configured — ${quota.max_api_calls_per_day.toLocaleString()} API calls/day, ${quota.max_rows_per_day.toLocaleString()} rows/day`
          : "No quota configured for this workspace",
        icon: Activity,
        verifiable: true,
      });

      setItems(checks);
      const verifiableChecks = checks.filter((c) => c.verifiable);
      const passCount = verifiableChecks.filter((c) => c.status === "pass").length;
      setScore(verifiableChecks.length ? Math.round((passCount / verifiableChecks.length) * 100) : 0);
      setLoading(false);
    };

    assess();
  }, [currentOrgId, currentOrg]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const scoreColor = score >= 90 ? "text-green-500" : score >= 70 ? "text-yellow-500" : "text-destructive";
  const scoreLabel = score >= 90 ? "Strong" : score >= 70 ? "Moderate" : "Needs Attention";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Security Posture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Score summary */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className={`text-4xl font-bold ${scoreColor}`}>{score}</p>
              <p className="text-xs text-muted-foreground mt-1">/ 100</p>
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Overall Posture</span>
                <Badge
                  variant="outline"
                  className={
                    score >= 90
                      ? "border-green-500/30 text-green-500"
                      : score >= 70
                      ? "border-yellow-500/30 text-yellow-500"
                      : "border-destructive/30 text-destructive"
                  }
                >
                  {scoreLabel}
                </Badge>
              </div>
              <Progress value={score} className="h-2" />
              <p className="text-[10px] text-muted-foreground">
                {items.filter((i) => i.verifiable && i.status === "pass").length} of{" "}
                {items.filter((i) => i.verifiable).length} verified controls passing
                {" · "}
                {items.filter((i) => !i.verifiable).length} platform controls not scored
              </p>
            </div>
          </div>

          {/* Individual checks */}
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-muted/20"
              >
                <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                  <item.icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <StatusIcon status={item.status} />
                    {!item.verifiable && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">
                        Platform
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            The score above is computed only from controls verified live against your organization's
            data (marked without a "Platform" tag). Items tagged "Platform" describe infrastructure
            guarantees (encryption, RLS) that apply to every tenant and cannot be disabled — they are
            disclosed for completeness but excluded from the score since there is nothing per-organization to check.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default SecurityPosture;
