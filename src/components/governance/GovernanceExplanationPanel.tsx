/**
 * Phase 6A.1 — Governance Explanation Panel
 *
 * Procurement-grade "Configuration Snapshot Used" view of the governance
 * configuration that influenced a specific decision / advisory /
 * intervention / insight.
 *
 * Reads from public.context_governance_audit (append-only). Label: value
 * format only — no generated prose.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Info, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type GovernanceSubjectType = "decision" | "intervention" | "advisory" | "insight";

interface Props {
  subjectType: GovernanceSubjectType;
  subjectId: string;
  organizationId?: string;
  compact?: boolean;
}

interface AuditRow {
  governance_model: string;
  risk_profile: string;
  governance_profile_version: number | null;
  context_pack: string | null;
  engine_version: string | null;
  thresholds_applied: Record<string, number> | null;
  approval_rules_applied: Record<string, unknown> | null;
  decision_path: Record<string, unknown> | null;
  created_at: string;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[180px,1fr] gap-3 py-1.5 text-sm border-b border-border/30 last:border-0">
    <div className="text-muted-foreground">{label}</div>
    <div className="text-foreground/90 break-words">{value ?? "—"}</div>
  </div>
);

const GovernanceExplanationPanel = ({ subjectType, subjectId, organizationId, compact }: Props) => {
  const [row, setRow] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("context_governance_audit")
        .select("governance_model, risk_profile, governance_profile_version, context_pack, engine_version, thresholds_applied, approval_rules_applied, decision_path, created_at")
        .eq("subject_type", subjectType)
        .eq("subject_id", subjectId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (organizationId) q = q.eq("organization_id", organizationId);
      const { data } = await q.maybeSingle();
      if (!cancelled) {
        setRow((data as AuditRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [subjectType, subjectId, organizationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading governance context…
      </div>
    );
  }

  if (!row) {
    return (
      <div className="text-xs text-muted-foreground p-3 flex items-center gap-2">
        <Info className="w-3 h-3" /> No governance context recorded for this {subjectType}.
      </div>
    );
  }

  const approvals = (row.approval_rules_applied ?? {}) as { required_approvals?: number; chain?: Array<{ approval_stage: string }> };
  const chain = approvals.chain?.map((s) => s.approval_stage).join(" → ");
  const thresholds = row.thresholds_applied ?? {};

  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Why did I receive this?
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">Configuration Snapshot Used</Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Row label="Governance Model" value={row.governance_model} />
        <Row label="Risk Appetite" value={row.risk_profile} />
        <Row label="Context Pack" value={row.context_pack ?? "—"} />
        <Row label="Required Approvals" value={approvals.required_approvals ?? "—"} />
        {chain && <Row label="Approval Chain" value={chain} />}
        <Row label="Governance Profile Version" value={row.governance_profile_version != null ? `v${row.governance_profile_version}` : "—"} />
        <Row label="Engine Version" value={row.engine_version ?? "—"} />
        {!compact && Object.entries(thresholds).map(([k, v]) => (
          <Row key={k} label={`Threshold: ${k}`} value={String(v)} />
        ))}
        <Row label="Recorded At" value={new Date(row.created_at).toLocaleString()} />
      </CardContent>
    </Card>
  );
};

export default GovernanceExplanationPanel;
