import { Shield, Brain, Database, Eye, Lock, GitBranch, CheckCircle2, FileText, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import AttestedEvidence from "@/components/security/AttestedEvidence";
import LiveTrustMetrics from "@/components/security/LiveTrustMetrics";
import ProcurementReadinessChecklist from "@/components/security/ProcurementReadinessChecklist";
import DownloadProcurementPack from "@/components/security/DownloadProcurementPack";
import SecurityHeaderStatus from "@/components/security/SecurityHeaderStatus";
import { useSeoHead } from "@/lib/useSeoHead";

const reasoningPrinciples: { label: string; value: string }[] = [
  { label: "Deterministic reasoning", value: "All scoring, propagation, and classification run through pure-function engines. LLMs never compute numbers." },
  { label: "Confidence decomposition", value: "Every composite confidence is a sum of five named contributors: evidence strength, relationship stability, cross-source consistency, topology reliability, historical accuracy." },
  { label: "Causal restrictions", value: "Edges declare 'deterministic', 'statistical', 'heuristic', or 'correlation_only'. We never promote correlation into causation without governance approval." },
  { label: "Suppression transparency", value: "Every node, edge, or narrative suppressed by the engine is logged with reason, threshold, and actor in an append-only governance log." },
  { label: "Evidence lineage", value: "Every executive surface traces back to raw signals through documented hops. No claim exists without a chain of evidence_refs." },
  { label: "No hallucinated topology", value: "Edges are only created from observed co-occurrence, declared dependencies, or governance-approved patterns. The graph never invents relationships." },
  { label: "Confidence cap", value: "Composite confidence is hard-capped at 0.85. Reaching 1.0 would imply certainty we cannot honestly claim." },
  { label: "Append-only audit", value: "Decision ledger, narrative audit log, and graph governance events are DENIED UPDATE/DELETE at the database level." },
];

const sections = [
  {
    icon: Brain,
    title: "How Quantivis Makes Decisions",
    badge: "Deterministic + AI",
    content: [
      "Every recommendation follows a three-layer architecture: statistical analysis first, heuristic scoring second, AI narrative generation third.",
      "The statistical layer uses pure-function implementations (K-Means clustering, Isolation Forest anomaly detection, Holt's exponential smoothing) — no stochastic model dependency.",
      "AI (LLM) is used only for natural language generation — never for core scoring or classification. All numbers are deterministic.",
      "Confidence scores are capped by data volume: <12 data points → max 60%, <30 → max 75%, 30+ → max 90%. This prevents overconfidence from small samples.",
    ],
  },
  {
    icon: Eye,
    title: "Auditability & Traceability",
    badge: "Full Lineage",
    content: [
      "Every insight, advisory, and decision is assigned an Evidence Classification: OBSERVED_FACT, STATISTICAL_INFERENCE, HEURISTIC_ESTIMATE, or AI_RECOMMENDATION.",
      "The Decision Ledger uses an append-only audit-log design; approvals, dismissals, and modifications are timestamped with actor identity and rationale.",
      "Data lineage tracks every metric from raw ingestion → transformation → aggregation → insight, viewable in the Lineage Explorer.",
      "The audit_log table is write-once with database-level DENY policies on UPDATE and DELETE — ensuring untamperable records.",
    ],
  },
  {
    icon: GitBranch,
    title: "Model Transparency",
    badge: "Open Box",
    content: [
      "Bayesian calibration runs every 12 hours, comparing predicted confidence against actual outcomes across confidence bands.",
      "Calibration corrections are versioned (model_version) with full band-level sample sizes, corrections, and bias direction recorded.",
      "The Calibration Curve and Decision Accuracy Dashboard provide visual proof of prediction quality over time.",
      "All AI-generated narratives include a Confidence Honesty layer — tooltips detailing what drives and limits each score.",
    ],
  },
  {
    icon: Database,
    title: "Data Handling & Isolation",
    badge: "GDPR-oriented controls",
    content: [
      "Organization-scoped Row Level Security controls are implemented; current control evidence is available to enterprise reviewers under NDA.",
      "Encryption in transit and at rest is provided by the configured hosting stack. Region and transfer details are documented for each enterprise deployment during procurement.",
      "AI redaction is available — sensitive fields can be excluded from LLM context before generation.",
      "Data retention policies are configurable per category with automated cleanup cycles.",
    ],
  },
  {
    icon: Lock,
    title: "Security Posture",
    badge: "Enterprise controls",
    content: [
      "Multi-factor authentication (MFA) with TOTP and WebAuthn/Passkey support, available when configured.",
      "SSO integration via SAML 2.0 with domain-level enforcement available when configured.",
      "Session management with configurable timeout, concurrent session limits, and login anomaly detection.",
      "Rate limiting and abuse controls protect privileged and public API paths according to endpoint risk.",
    ],
  },
  {
    icon: CheckCircle2,
    title: "Operational Integrity",
    badge: "Governed automation",
    content: [
      "Scheduled workflows are represented on the public status and internal health surfaces only after successful-run telemetry is recorded.",
      "Scheduled jobs use concurrency controls where required to prevent overlapping execution.",
      "Job runs record status, duration, errors, and operational metadata for observability and audit.",
      "The System Health dashboard provides visibility into pipeline status, closed-loop rates, and job health.",
    ],
  },
];

const SecurityTrustCenter = () => {
  useSeoHead({
    title: "Trust Center | Quantivis",
    description: "Review Quantivis security controls, certification roadmap, compliance evidence, data residency, and procurement resources.",
    canonicalPath: "/trust",
  });

  const navigate = useNavigate();

  return (
    <SectionErrorBoundary sectionName="Trust Center">
      <div className="space-y-8 max-w-4xl">
        <SecurityHeaderStatus />
        <div className="border border-border/30 rounded-lg p-5 bg-muted/20">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">Third-party assurance</p>
              <h2 className="text-[15px] font-semibold tracking-tight">Certification claims are evidence-gated</h2>
            </div>
            <span className="text-[11px] text-muted-foreground/50 italic">Current status disclosed during procurement</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { cert: "SOC 2 Type II", status: "Not claimed", detail: "Quantivis does not represent SOC 2 certification unless a current third-party report is available for customer review." },
              { cert: "ISO 27001", status: "Not claimed", detail: "Quantivis does not represent ISO 27001 certification unless a valid certificate and scope statement are available." },
              { cert: "BSI C5 / TISAX", status: "Not claimed", detail: "Sector-specific attestations are not presented as completed controls without verifiable third-party evidence." },
              { cert: "Customer assurance", status: "Evidence-based", detail: "Procurement review is supported with current technical controls, architecture, data-processing terms, and available test evidence." },
            ].map(({ cert, status, detail }) => (
              <div key={cert} className="border border-border/30 rounded-md p-4 bg-background">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <span className="text-[13px] font-semibold text-foreground">{cert}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{status}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{detail}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-3">We prefer a smaller truthful claim backed by evidence over a broader certification or compliance claim that cannot be independently verified.</p>

          <div className="mt-6 border border-border/30 rounded-lg p-4 bg-background">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-3">Engineering assurance</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Release provenance", note: "Production builds expose the exact release SHA and are verified before and after promotion." },
                { label: "Tenant isolation", note: "Organization boundaries are enforced through database policies and exact-SHA acceptance checks." },
                { label: "Governed execution", note: "Consequential outbound actions require an approved executable decision and fail closed when governance context is missing." },
                { label: "Retry safety", note: "Outbound execution uses durable idempotency receipts so transport retries do not silently duplicate side effects." },
              ].map(({ label, note }) => (
                <div key={label} className="border border-border/20 rounded-md p-3">
                  <div className="text-[12px] font-semibold text-foreground">{label}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{note}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/40 mt-4">Operational claims are intended to stay tied to current controls and release evidence rather than static code-count metrics.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Authentication", value: "Configurable", sub: "MFA + WebAuthn when enabled", ok: true },
            { label: "Governance", value: "Evidence-derived", sub: "See live controls below", ok: true },
            { label: "Evidence Coverage", value: "Measured", sub: "Current snapshot required", ok: true },
            { label: "Audit Trail", value: "Append-only", sub: "Database policy control", ok: true },
            { label: "Data Residency", value: "Configuration-specific", sub: "Verified during procurement", ok: true },
            { label: "Compliance", value: "Controls mapped", sub: "No unverified certifications", ok: true },
          ].map(({ label, value, sub, ok }) => (
            <div key={label} className="border border-border/30 rounded-lg px-4 py-3 bg-background">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">{label}</div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className={`text-[11px] font-bold ${ok ? "text-[#16a34a]" : "text-destructive"}`}>✓</span>
                <span className="text-[13px] font-semibold text-foreground">{value}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Trust Center</h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            Quantivis is built for enterprises that require provable, auditable intelligence. Public claims on this page are intended to remain anchored to operational evidence; where verification depends on customer configuration or third-party assurance, that limitation is stated explicitly.
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <h2 className="text-base font-semibold mb-1">Sovereign AI Governance</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  Quantivis supports governed, auditable decision workflows designed to support transparency and human oversight. Hosting region, third-party AI routing, transfer safeguards, and regulatory applicability depend on each customer's deployment and use case and are documented during procurement. Audit records use an append-only design, while additional deployment models remain part of the enterprise roadmap.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Human oversight", "Evidence traceability", "GDPR-oriented controls", "Region disclosure", "sha256 audit evidence"].map(tag => (
                    <Badge key={tag} variant="outline" className="text-[10px] border-primary/30 text-primary bg-primary/5">{tag}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <LiveTrustMetrics />
        <ProcurementReadinessChecklist />

        <Card className="border-border/50">
          <CardContent className="pt-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-base font-semibold">Procurement Pack</h2>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                Versioned ZIP bundle — DPA, TOMs, AI Governance, Incident Response, Auditability, Security Overview,
                Sub-processor Registry, AI Usage Transparency, and the current Trust Snapshot. Includes sha256 manifest
                and bundle integrity ID.
              </p>
            </div>
            <DownloadProcurementPack />
          </CardContent>
        </Card>

        <Separator />

        <Card className="border-primary/30 bg-primary/[0.02]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-primary" />
                <CardTitle className="text-base">Contextual Governance</CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px]">Governance controls</Badge>
            </div>
            <p className="text-xs text-muted-foreground pt-1 max-w-2xl leading-relaxed">
              Organizations define their own governance model, risk appetite, and approval requirements. Quantivis executes those rules — it does not impose a universal decision model. The same operational signal can produce different thresholds, escalation, and approval chains depending on each organization's configuration.
            </p>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map(({ icon: Icon, title, badge, content }) => (
            <Card key={title} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <CardTitle className="text-sm">{title}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{badge}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {content.map((item) => (
                  <div key={item} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <AttestedEvidence />

        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm">Need procurement or security evidence?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/documentation")}>Review documentation</Button>
            <Button size="sm" onClick={() => navigate("/contact")}>Contact Quantivis</Button>
          </CardContent>
        </Card>
      </div>
    </SectionErrorBoundary>
  );
};

export default SecurityTrustCenter;
