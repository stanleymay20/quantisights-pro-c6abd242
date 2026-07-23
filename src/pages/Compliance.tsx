import { useState, useEffect, useCallback } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import {
  Shield, ShieldCheck, CheckCircle2, AlertTriangle, XCircle,
  Lock, Eye, Database, FileText, Users, Clock, Activity, Server, Download, Globe, Info,
} from "lucide-react";
import { motion } from "framer-motion";

interface ComplianceControl {
  id: string;
  category: string;
  name: string;
  description: string;
  status: "implemented" | "partial" | "not_verified" | "not_applicable";
  evidence: string;
  framework: string[];
  lastAudit?: string;
}

interface SystemEvidence {
  rlsEnabled: boolean;
  auditLogExists: boolean;
  retentionPoliciesCount: number;
  ssoConfigured: boolean;
  qualityChecksCount: number;
  mfaAvailable: boolean;
}

const Compliance = () => {
  const { currentOrgId } = useOrganization();
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [score, setScore] = useState(0);
  const [evidence, setEvidence] = useState<SystemEvidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentOrgId) computeControls();
  }, [currentOrgId]);

  const computeControls = async () => {
    if (!currentOrgId) return;
    setLoading(true);

    // Query real system state to derive evidence
    const [retentionRes, ssoRes, qualityRes, auditRes] = await Promise.all([
      supabase.from("data_retention_policies").select("id").eq("organization_id", currentOrgId).limit(1),
      supabase.from("sso_configs").select("id, is_active").eq("organization_id", currentOrgId).eq("is_active", true).limit(1),
      supabase.from("data_quality_checks").select("id").eq("organization_id", currentOrgId).limit(1),
      supabase.from("audit_log").select("id").eq("organization_id", currentOrgId).limit(1),
    ]);

    const sysEvidence: SystemEvidence = {
      rlsEnabled: true, // Architectural invariant — enforced by migrations
      auditLogExists: (auditRes.data?.length ?? 0) > 0,
      retentionPoliciesCount: retentionRes.data?.length ?? 0,
      ssoConfigured: (ssoRes.data?.length ?? 0) > 0,
      qualityChecksCount: qualityRes.data?.length ?? 0,
      mfaAvailable: true, // Platform capability — always available
    };
    setEvidence(sysEvidence);

    // Controls derived from real system state + architectural invariants
    const assessedControls: ComplianceControl[] = [
      // Access Control
      {
        id: "AC-1", category: "Access Control", name: "Row-Level Security",
        description: "All data tables enforce organization-scoped RLS policies preventing cross-tenant access.",
        status: "implemented",
        evidence: "Architectural invariant: 100% of data tables have RLS enabled with org_id scoping via migrations.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4"],
      },
      {
        id: "AC-2", category: "Access Control", name: "Role-Based Access Control",
        description: "Separate user_roles table with SECURITY DEFINER functions for privilege checks.",
        status: "implemented",
        evidence: "Roles stored in dedicated table; has_role() and has_permission() are SECURITY DEFINER functions.",
        framework: ["SOC 2 CC6.3", "ISO 27001 A.9.2"],
      },
      {
        id: "AC-3", category: "Access Control", name: "Multi-Factor Authentication",
        description: "MFA enrollment available for all user accounts.",
        status: "implemented",
        evidence: "TOTP-based MFA via auth provider with enrollment UI. Passkey/WebAuthn support available.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4.2"],
      },
      {
        id: "AC-4", category: "Access Control", name: "Session Management",
        description: "JWT-based sessions with automatic expiry and refresh token rotation.",
        status: "implemented",
        evidence: "Auth sessions managed by infrastructure with configurable TTL. Session listing and remote revocation available.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4.3"],
      },
      // Data Protection
      {
        id: "DP-1", category: "Data Protection", name: "Encryption at Rest",
        description: "Storage-layer encryption inherited from hosting platform (AES-256).",
        status: "not_verified",
        evidence: "Encryption at rest is provided by the hosting platform infrastructure. Quantivis does not independently verify or manage encryption keys. Status reflects inherited control, not a Quantivis-implemented capability.",
        framework: ["SOC 2 CC6.7", "ISO 27001 A.10.1"],
      },
      {
        id: "DP-2", category: "Data Protection", name: "Encryption in Transit",
        description: "TLS encryption inherited from hosting platform for all connections.",
        status: "not_verified",
        evidence: "HTTPS and TLS are enforced by the hosting platform infrastructure. Quantivis does not independently verify TLS versions or certificate management. Status reflects inherited control, not a Quantivis-implemented capability.",
        framework: ["SOC 2 CC6.7", "ISO 27001 A.13.1"],
      },
      {
        id: "DP-3", category: "Data Protection", name: "PII Redaction",
        description: "Automated PII stripping before AI model processing.",
        status: "implemented",
        evidence: "AI redaction layer (ai-redaction.ts) strips emails, phones, SSNs, IBANs before external API calls.",
        framework: ["SOC 2 CC6.5", "ISO 27001 A.18.1", "GDPR Art. 25"],
      },
      {
        id: "DP-4", category: "Data Protection", name: "Data Retention Policy",
        description: "Configurable per-organization data retention with automated cleanup.",
        status: sysEvidence.retentionPoliciesCount > 0 ? "implemented" : "partial",
        evidence: sysEvidence.retentionPoliciesCount > 0
          ? `${sysEvidence.retentionPoliciesCount} retention policy(s) configured for this organization.`
          : "Retention policy infrastructure exists but no policies configured for this organization yet.",
        framework: ["SOC 2 CC6.5", "ISO 27001 A.8.3", "GDPR Art. 17"],
      },
      // Audit & Monitoring
      {
        id: "AU-1", category: "Audit & Monitoring", name: "Immutable Audit Trail",
        description: "Write-once audit log with DENY policies on UPDATE/DELETE.",
        status: sysEvidence.auditLogExists ? "implemented" : "partial",
        evidence: sysEvidence.auditLogExists
          ? "audit_log table is INSERT-only with DB-level DENY on UPDATE/DELETE. Entries found for this organization."
          : "audit_log infrastructure exists with INSERT-only policies. No entries recorded yet for this organization.",
        framework: ["SOC 2 CC7.2", "ISO 27001 A.12.4"],
      },
      {
        id: "AU-2", category: "Audit & Monitoring", name: "Data Lineage Tracking",
        description: "Full source-to-decision data lineage with dataset versioning.",
        status: "implemented",
        evidence: "dataset_versions table tracks all changes; data_lineage table records transformation chains.",
        framework: ["SOC 2 CC8.1", "ISO 27001 A.12.1"],
      },
      {
        id: "AU-3", category: "Audit & Monitoring", name: "Pipeline Observability",
        description: "Structured logging and sync job tracking for all data pipelines.",
        status: "implemented",
        evidence: "data_sync_jobs tracks every sync; cron_run_log records scheduled operations. Structured JSON logging in edge functions.",
        framework: ["SOC 2 CC7.1", "ISO 27001 A.12.4"],
      },
      // AI Governance
      {
        id: "AI-1", category: "AI Governance", name: "Confidence Governance",
        description: "AI confidence scores capped by evidence volume; never fabricated.",
        status: "implemented",
        evidence: "Epistemic confidence caps enforced: <12pts=60%, <30pts=75%, 30+=90%. Adaptive calibration from historical decisions.",
        framework: ["EU AI Act Art. 13", "NIST AI RMF"],
      },
      {
        id: "AI-2", category: "AI Governance", name: "Model Explainability",
        description: "All AI outputs include traceability panel with method, assumptions, and limitations.",
        status: "implemented",
        evidence: "Evidence Contract enforces 4-layer classification: OBSERVED_FACT, STATISTICAL_INFERENCE, HEURISTIC_ESTIMATE, AI_RECOMMENDATION.",
        framework: ["EU AI Act Art. 13", "NIST AI RMF"],
      },
      {
        id: "AI-3", category: "AI Governance", name: "Non-Fiduciary Disclaimers",
        description: "Platform explicitly establishes non-fiduciary status with decision responsibility dialogs.",
        status: "implemented",
        evidence: "DecisionResponsibilityDialog enforces acknowledgment before approval. IntelligenceDisclaimer on all strategic surfaces.",
        framework: ["SOC 2 CC2.2"],
      },
      // Infrastructure
      {
        id: "IN-1", category: "Infrastructure", name: "Tenant Isolation",
        description: "Workspace-level data isolation with SECURITY DEFINER membership checks.",
        status: "implemented",
        evidence: "is_workspace_member() and is_org_member() SECURITY DEFINER functions gate all strategic data access at DB level.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.13.1"],
      },
      {
        id: "IN-2", category: "Infrastructure", name: "Rate Limiting",
        description: "API rate limits on ingestion and AI endpoints.",
        status: "implemented",
        evidence: "rate-guard.ts enforces tiered limits: Intelligence 20/min, Simulation 10/min, Export 5/hr. Per-org quotas via workspace_quotas.",
        framework: ["SOC 2 CC6.6"],
      },
      {
        id: "IN-3", category: "Infrastructure", name: "Input Validation",
        description: "Strict validation on all data inputs: ISO dates, finite numbers, bounded values.",
        status: "implemented",
        evidence: "input-validation.ts enforces: ISO date format, |value| < 1T, date age < 5 years, finite numbers only.",
        framework: ["SOC 2 CC6.6", "OWASP"],
      },
      // Compliance Readiness (not yet verified)
      {
        id: "CR-1", category: "Compliance Readiness", name: "SSO/SAML Integration",
        description: "Enterprise SSO support for identity federation.",
        status: sysEvidence.ssoConfigured ? "implemented" : "partial",
        evidence: sysEvidence.ssoConfigured
          ? "SSO is configured and active for this organization."
          : "SSO configuration UI available. No active SSO provider configured for this organization.",
        framework: ["SOC 2 CC6.1", "ISO 27001 A.9.4"],
      },
      {
        id: "CR-2", category: "Compliance Readiness", name: "SOC 2 Type II Certification",
        description: "Formal third-party SOC 2 audit certification.",
        status: "not_verified",
        evidence: "Technical controls are implemented. Formal third-party audit has not been conducted. This is a readiness self-assessment only.",
        framework: ["SOC 2"],
      },
      {
        id: "CR-3", category: "Compliance Readiness", name: "Data Quality Monitoring",
        description: "Automated data quality checks and statistical profiling.",
        status: sysEvidence.qualityChecksCount > 0 ? "implemented" : "partial",
        evidence: sysEvidence.qualityChecksCount > 0
          ? "Data quality checks have been executed for datasets in this organization."
          : "Data profiler infrastructure exists. No quality checks executed yet for this organization.",
        framework: ["SOC 2 CC8.1", "ISO 27001 A.14.1"],
      },
    ];

    setControls(assessedControls);

    const implemented = assessedControls.filter(c => c.status === "implemented").length;
    const total = assessedControls.filter(c => c.status !== "not_applicable").length;
    setScore(Math.round((implemented / total) * 100));
    setLoading(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "implemented": return <CheckCircle2 className="w-4 h-4 text-primary" />;
      case "partial": return <AlertTriangle className="w-4 h-4 text-accent-foreground" />;
      case "not_verified": return <Clock className="w-4 h-4 text-muted-foreground" />;
      default: return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      implemented: "Implemented",
      partial: "Partially Implemented",
      not_verified: "Not Verified",
      not_applicable: "N/A",
    };
    return labels[status] || status;
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      implemented: "bg-primary/10 text-primary border-primary/20",
      partial: "bg-accent/20 text-accent-foreground border-accent/30",
      not_verified: "bg-muted text-muted-foreground border-border",
    };
    return (
      <Badge variant="outline" className={variants[status] || ""}>
        {statusLabel(status)}
      </Badge>
    );
  };

  const categories = [...new Set(controls.map(c => c.category))];
  const categoryIcon: Record<string, React.ElementType> = {
    "Access Control": Lock,
    "Data Protection": Shield,
    "Audit & Monitoring": Eye,
    "AI Governance": Activity,
    "Infrastructure": Server,
    "Compliance Readiness": FileText,
  };

  const downloadCompliancePack = useCallback(() => {
    const lines = [
      "QUANTIVIS — COMPLIANCE READINESS SELF-ASSESSMENT",
      `Generated: ${new Date().toISOString().split("T")[0]}`,
      `Implementation Score: ${score}%`,
      "",
      "IMPORTANT: This is a self-assessment of implemented technical controls.",
      "It does NOT constitute formal compliance certification.",
      "For SOC 2 Type II or ISO 27001 certification, engage an accredited auditor.",
      "",
      "=" .repeat(60),
      "",
    ];
    controls.forEach((c) => {
      lines.push(`[${c.id}] ${c.name} — ${statusLabel(c.status).toUpperCase()}`);
      lines.push(`  Category: ${c.category}`);
      lines.push(`  ${c.description}`);
      lines.push(`  Evidence: ${c.evidence}`);
      lines.push(`  Frameworks: ${c.framework.join(", ")}`);
      lines.push("");
    });
    lines.push("=" .repeat(60));
    lines.push("This report is auto-generated from platform control self-assessment.");

    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Quantivis-Compliance-SelfAssessment-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [controls, score]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Assessing compliance readiness…</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Compliance Readiness Assessment</h1>
            <p className="text-sm text-muted-foreground">
              Self-assessment of implemented controls mapped to SOC 2, ISO 27001, EU AI Act, and GDPR frameworks
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={downloadCompliancePack}>
          <Download className="w-4 h-4" /> Download Self-Assessment
        </Button>
      </div>

      {/* Disclaimer */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-accent-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Self-Assessment — Not a Certification</p>
            <p className="text-xs text-muted-foreground mt-1">
              This page reports on implemented technical controls based on platform architecture and live system queries.
              Status reflects what is implemented in code — not a formal audit finding. "Implemented" means the control
              exists in the codebase; "Not Verified" means no independent audit has confirmed effectiveness.
              For formal SOC 2 or ISO 27001 certification, engage an accredited third-party auditor.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Score Overview */}
      <SectionErrorBoundary sectionName="Compliance Score">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-4 border-primary flex items-center justify-center">
                  <span className="text-[18px] font-semibold tracking-tight">{score}%</span>
                </div>
                <div>
                  <p className="text-lg font-semibold">Implementation Score</p>
                  <p className="text-sm text-muted-foreground">
                    {controls.filter(c => c.status === "implemented").length} of {controls.length} controls implemented
                  </p>
                  <div className="mt-2">
                    <Progress value={score} className="h-2" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {[
            { label: "SOC 2 Controls", count: controls.filter(c => c.framework.some(f => f.includes("SOC 2")) && c.status === "implemented").length, total: controls.filter(c => c.framework.some(f => f.includes("SOC 2"))).length, icon: ShieldCheck },
            { label: "ISO 27001 Controls", count: controls.filter(c => c.framework.some(f => f.includes("ISO")) && c.status === "implemented").length, total: controls.filter(c => c.framework.some(f => f.includes("ISO"))).length, icon: Shield },
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
      </SectionErrorBoundary>

      {/* Controls by Category */}
      <SectionErrorBoundary sectionName="Compliance Controls">
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
      </SectionErrorBoundary>
    </div>
  );
};

export default Compliance;
