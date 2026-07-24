import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import {
  Shield, ShieldCheck, CheckCircle2, AlertTriangle, XCircle,
  Lock, Eye, Database, FileText, Users, Clock, Activity, Server,
} from "lucide-react";
import { motion } from "framer-motion";

interface ComplianceControl {
  id: string;
  category: string;
  name: string;
  description: string;
  status: "compliant" | "partial" | "non_compliant" | "not_applicable";
  evidence: string;
  framework: string[];
  lastAudit?: string;
  /**
   * live: checked against this organization's real data on every load.
   * platform: a structural guarantee (schema/RLS/infra) true for every
   *   tenant by construction — nothing per-org to query, so it's disclosed
   *   but excluded from the score.
   * external: depends on a real-world event (e.g. a third-party audit)
   *   that cannot be derived from platform data — attested manually,
   *   also excluded from the score.
   */
  checkType: "live" | "platform" | "external";
}

const Compliance = () => {
  const { currentOrgId, currentOrg } = useOrganization();
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrgId) computeControls();
  }, [currentOrgId]);

  const computeControls = async () => {
    setLoading(true);
    const orgId = currentOrgId as string;
    // sso_configs and audit_log are RLS-restricted to owner/admin — for any
    // other role those queries silently return zero rows, which would read
    // as a false "non-compliant" rather than "can't verify from this role".
    const canViewAdminData = currentOrg?.role === "owner" || currentOrg?.role === "admin";

    // --- Live checks: real queries against this organization's data ---

    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasMfa = (factors?.totp?.length ?? 0) > 0;

    const { count: retentionCount } = await supabase
      .from("data_retention_policies")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const { count: lineageCount } = await supabase
      .from("dataset_versions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const { count: syncCount } = await supabase
      .from("data_sync_jobs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);

    const { data: ssoConfig } = canViewAdminData
      ? await supabase
          .from("sso_configs")
          .select("is_active, provider_type")
          .eq("organization_id", orgId)
          .maybeSingle()
      : { data: null as { is_active: boolean; provider_type: string } | null };

    const { data: workspaceRows } = await supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", orgId);
    const workspaceIds = (workspaceRows ?? []).map((w) => w.id);
    const { data: quota } = workspaceIds.length
      ? await supabase
          .from("workspace_quotas")
          .select("max_api_calls_per_day")
          .in("workspace_id", workspaceIds)
          .limit(1)
          .maybeSingle()
      : { data: null as { max_api_calls_per_day: number } | null };

    const { count: auditCount, error: auditError } = canViewAdminData
      ? await supabase
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
      : { count: null as number | null, error: null as { message: string } | null };

    const assessedControls: ComplianceControl[] = [
      // Access Control
      {
        id: "AC-1", category: "Access Control", name: "Row-Level Security",
        description: "All data tables enforce organization-scoped RLS policies preventing cross-tenant access.",
        status: "compliant", evidence: "Structural guarantee — every data table ships with org_id-scoped RLS policies; not configurable per tenant.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4"], checkType: "platform",
      },
      {
        id: "AC-2", category: "Access Control", name: "Role-Based Access Control",
        description: "Separate user_roles table with SECURITY DEFINER functions for privilege checks.",
        status: "compliant", evidence: "Structural guarantee — roles stored in a dedicated table; no client-side role checks exist in the codebase.",
        framework: ["SOC 2 CC6.3", "ISO 27001 A.9.2"], checkType: "platform",
      },
      {
        id: "AC-3", category: "Access Control", name: "Multi-Factor Authentication",
        description: "MFA enrollment for the current user's account.",
        status: hasMfa ? "compliant" : "partial",
        evidence: hasMfa ? "TOTP MFA is enrolled and active for your account." : "TOTP MFA is available but not yet enrolled for your account.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4.2"], checkType: "live",
      },
      {
        id: "AC-4", category: "Access Control", name: "Session Management",
        description: "JWT-based sessions with automatic expiry and refresh token rotation.",
        status: "compliant", evidence: "Structural guarantee — auth sessions are managed by Supabase Auth with configurable TTL.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4.3"], checkType: "platform",
      },
      // Data Protection
      {
        id: "DP-1", category: "Data Protection", name: "Encryption at Rest",
        description: "All data encrypted using AES-256 at the storage layer.",
        status: "compliant", evidence: "Structural guarantee — Supabase-managed storage uses AES-256 for all stored data.",
        framework: ["SOC 2 CC6.7", "ISO 27001 A.10.1"], checkType: "platform",
      },
      {
        id: "DP-2", category: "Data Protection", name: "Encryption in Transit",
        description: "All connections use TLS for data in transit.",
        status: "compliant", evidence: "Structural guarantee — HTTPS/TLS 1.2+ enforced on all endpoints.",
        framework: ["SOC 2 CC6.7", "ISO 27001 A.13.1"], checkType: "platform",
      },
      {
        id: "DP-3", category: "Data Protection", name: "PII Redaction",
        description: "Automated PII stripping before AI model processing.",
        status: "compliant", evidence: "Structural guarantee — the AI redaction layer strips emails, phones, SSNs, and IBANs before every external model call.",
        framework: ["SOC 2 CC6.5", "ISO 27001 A.18.1", "GDPR Art. 25"], checkType: "platform",
      },
      {
        id: "DP-4", category: "Data Protection", name: "Data Retention Policy",
        description: "Configurable per-organization data retention with automated cleanup.",
        status: (retentionCount ?? 0) > 0 ? "compliant" : "non_compliant",
        evidence: (retentionCount ?? 0) > 0
          ? `${retentionCount} retention ${retentionCount === 1 ? "policy is" : "policies are"} configured for this organization.`
          : "No data retention policy has been configured for this organization yet.",
        framework: ["SOC 2 CC6.5", "ISO 27001 A.8.3", "GDPR Art. 17"], checkType: "live",
      },
      // Audit & Monitoring
      {
        id: "AU-1", category: "Audit & Monitoring", name: "Immutable Audit Trail",
        description: "Write-once audit log with DENY policies on UPDATE/DELETE.",
        status: !canViewAdminData ? "not_applicable" : auditError ? "non_compliant" : "compliant",
        evidence: !canViewAdminData
          ? "Requires owner or admin access to verify from your role."
          : auditError
          ? "Could not verify audit log access for this organization."
          : `Append-only log reachable — ${auditCount ?? 0} event${auditCount === 1 ? "" : "s"} recorded to date.`,
        framework: ["SOC 2 CC7.2", "ISO 27001 A.12.4"], checkType: "live",
      },
      {
        id: "AU-2", category: "Audit & Monitoring", name: "Data Lineage Tracking",
        description: "Source-to-decision data lineage via dataset versioning.",
        status: (lineageCount ?? 0) > 0 ? "compliant" : "partial",
        evidence: (lineageCount ?? 0) > 0
          ? `${lineageCount} dataset version${lineageCount === 1 ? "" : "s"} tracked for this organization.`
          : "The versioning mechanism is available, but no dataset versions exist for this organization yet.",
        framework: ["SOC 2 CC8.1", "ISO 27001 A.12.1"], checkType: "live",
      },
      {
        id: "AU-3", category: "Audit & Monitoring", name: "Pipeline Observability",
        description: "Sync job tracking for all data pipelines.",
        status: (syncCount ?? 0) > 0 ? "compliant" : "partial",
        evidence: (syncCount ?? 0) > 0
          ? `${syncCount} sync job${syncCount === 1 ? "" : "s"} tracked for this organization.`
          : "The sync-tracking mechanism is available, but no sync jobs have run for this organization yet.",
        framework: ["SOC 2 CC7.1", "ISO 27001 A.12.4"], checkType: "live",
      },
      // AI Governance
      {
        id: "AI-1", category: "AI Governance", name: "Confidence Governance",
        description: "AI confidence scores capped by evidence volume; never fabricated.",
        status: "compliant", evidence: "Structural guarantee — epistemic confidence caps (<12pts=60%, <30pts=75%, 30+=90%) are enforced server-side in every AI edge function via a shared cap utility.",
        framework: ["EU AI Act Art. 13", "NIST AI RMF"], checkType: "platform",
      },
      {
        id: "AI-2", category: "AI Governance", name: "Model Explainability",
        description: "All AI outputs include traceability with method, assumptions, and limitations.",
        status: "compliant", evidence: "Structural guarantee — outputs are classified into OBSERVED_FACT, STATISTICAL_INFERENCE, HEURISTIC_ESTIMATE, or AI_RECOMMENDATION.",
        framework: ["EU AI Act Art. 13", "NIST AI RMF"], checkType: "platform",
      },
      {
        id: "AI-3", category: "AI Governance", name: "Multi-Model Failover",
        description: "AI pipeline uses a model chain with automatic fallback on failure.",
        status: "compliant", evidence: "Structural guarantee — model failover chain with a validation layer that rejects hallucinated metrics.",
        framework: ["NIST AI RMF"], checkType: "platform",
      },
      {
        id: "AI-4", category: "AI Governance", name: "Non-Fiduciary Disclaimers",
        description: "Platform explicitly establishes non-fiduciary status with decision responsibility dialogs.",
        status: "compliant", evidence: "Structural guarantee — decision responsibility acknowledgment is required before approval on every strategic surface.",
        framework: ["SOC 2 CC2.2"], checkType: "platform",
      },
      // Infrastructure
      {
        id: "IN-1", category: "Infrastructure", name: "Tenant Isolation",
        description: "Workspace-level data isolation with SECURITY DEFINER membership checks.",
        status: "compliant", evidence: "Structural guarantee — workspace membership is checked at the database level for all strategic data access.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.13.1"], checkType: "platform",
      },
      {
        id: "IN-2", category: "Infrastructure", name: "Rate Limiting",
        description: "Per-workspace API and ingestion quotas.",
        status: quota ? "compliant" : "partial",
        evidence: quota
          ? `Configured — ${quota.max_api_calls_per_day.toLocaleString()} API calls/day for this workspace.`
          : "No quota row is configured for this workspace yet.",
        framework: ["SOC 2 CC6.6"], checkType: "live",
      },
      {
        id: "IN-3", category: "Infrastructure", name: "Input Validation",
        description: "Strict validation on all data inputs: ISO dates, finite numbers, bounded values.",
        status: "compliant", evidence: "Structural guarantee — every ingestion path validates date format, magnitude bounds, and finiteness before write.",
        framework: ["SOC 2 CC6.6", "OWASP"], checkType: "platform",
      },
      // Compliance Readiness
      {
        id: "CR-1", category: "Compliance Readiness", name: "SSO/SAML Integration",
        description: "Enterprise SSO support for identity federation.",
        status: !canViewAdminData
          ? "not_applicable"
          : ssoConfig?.is_active ? "compliant" : ssoConfig ? "partial" : "non_compliant",
        evidence: !canViewAdminData
          ? "Requires owner or admin access to verify from your role."
          : ssoConfig?.is_active
          ? `Active — ${ssoConfig.provider_type.toUpperCase()} configured for this organization.`
          : ssoConfig
          ? `${ssoConfig.provider_type.toUpperCase()} is configured but not yet activated.`
          : "No SSO provider has been configured for this organization.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4"], checkType: "live",
      },
      {
        id: "CR-2", category: "Compliance Readiness", name: "SOC 2 Type II Audit",
        description: "Formal third-party SOC 2 audit certification.",
        status: "partial", evidence: "Manually attested — pending a formal third-party audit; not derivable from platform data.",
        framework: ["SOC 2"], checkType: "external",
      },
    ];

    setControls(assessedControls);

    const scored = assessedControls.filter(c => c.checkType === "live" && c.status !== "not_applicable");
    const compliant = scored.filter(c => c.status === "compliant").length;
    setScore(scored.length ? Math.round((compliant / scored.length) * 100) : 0);
    setLoading(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "compliant": return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "partial": return <AlertTriangle className="w-4 h-4 text-accent-foreground" />;
      case "non_compliant": return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      compliant: "bg-primary/10 text-primary border-primary/20",
      partial: "bg-accent/20 text-accent-foreground border-accent/30",
      non_compliant: "bg-destructive/10 text-destructive border-destructive/20",
    };
    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {status.replace("_", " ")}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const categories = [...new Set(controls.map(c => c.category))];
  const categoryIcon: Record<string, React.ElementType> = {
    "Access Control": Lock,
    "Data Protection": Shield,
    "Audit & Monitoring": Eye,
    "AI Governance": Activity,
    "Infrastructure": Server,
    "Compliance Readiness": FileText,
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <SidebarMobileToggle />
        <div>
          <h1 className="text-2xl font-bold">Compliance & Governance</h1>
          <p className="text-sm text-muted-foreground">
            SOC 2 · ISO 27001 · EU AI Act · GDPR readiness assessment
          </p>
        </div>
      </div>

      {/* Score Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
                <span className="text-2xl font-bold">{score}%</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Compliance Score</p>
                <p className="text-sm text-muted-foreground">
                  {controls.filter(c => c.checkType === "live" && c.status === "compliant").length} of{" "}
                  {controls.filter(c => c.checkType === "live" && c.status !== "not_applicable").length} verified controls compliant
                </p>
                <div className="mt-2">
                  <Progress value={score} className="h-2" />
                </div>
                <p className="text-[10px] text-muted-foreground/70 mt-1.5 leading-relaxed max-w-md">
                  Computed only from controls checked live against this organization's data.{" "}
                  {controls.filter(c => c.checkType === "platform").length} platform guarantees and{" "}
                  {controls.filter(c => c.checkType === "external").length} externally-attested control
                  {controls.filter(c => c.checkType === "external").length === 1 ? "" : "s"} are shown below but excluded from the score.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {[
          { label: "SOC 2 Controls", count: controls.filter(c => c.framework.some(f => f.includes("SOC 2")) && c.status === "compliant").length, total: controls.filter(c => c.framework.some(f => f.includes("SOC 2"))).length, icon: ShieldCheck },
          { label: "ISO 27001 Controls", count: controls.filter(c => c.framework.some(f => f.includes("ISO")) && c.status === "compliant").length, total: controls.filter(c => c.framework.some(f => f.includes("ISO"))).length, icon: Shield },
        ].map(({ label, count, total, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Icon className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{count}/{total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls by Category */}
      <Tabs defaultValue={categories[0]}>
        <TabsList className="flex-wrap h-auto gap-1">
          {categories.map(cat => {
            const Icon = categoryIcon[cat] || Shield;
            return (
              <TabsTrigger key={cat} value={cat} className="gap-1.5 text-xs">
                <Icon className="w-3.5 h-3.5" /> {cat}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {categories.map(cat => (
          <TabsContent key={cat} value={cat} className="space-y-3">
            {controls.filter(c => c.category === cat).map(control => (
              <motion.div key={control.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        {statusIcon(control.status)}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{control.id}</span>
                            <span className="font-semibold text-sm">{control.name}</span>
                            {statusBadge(control.status)}
                            {control.checkType !== "live" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 text-muted-foreground">
                                {control.checkType === "platform" ? "Platform" : "External"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">{control.description}</p>
                          <div className="mt-2 p-2 rounded bg-muted/50 border border-border/30">
                            <p className="text-xs text-muted-foreground"><strong>Evidence:</strong> {control.evidence}</p>
                          </div>
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {control.framework.map(f => (
                              <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default Compliance;
