import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Printer, ArrowLeft } from "lucide-react";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

/**
 * Procurement Pack — single-page aggregator of every procurement document.
 * Optimized for print-to-PDF: clean typography, page breaks between sections,
 * no nav chrome when printing.
 *
 * The browser's native "Save as PDF" produces a signed-by-domain PDF that
 * procurement teams accept. This is the most reliable, dependency-free path.
 */

const VERSION = "2026.2";
const REVIEWED = "May 26, 2026";

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="print:break-before-page space-y-3">
    <h2 className="text-[18px] font-semibold tracking-tight border-b border-border/40 pb-2">{title}</h2>
    <div className="text-sm text-foreground/90 leading-relaxed space-y-3">{children}</div>
  </section>
);

const BulletList = ({ items }: { items: string[] }) => (
  <ul className="space-y-1.5 ml-1">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2">
        <span className="text-primary/60 shrink-0">•</span>
        <span>{it}</span>
      </li>
    ))}
  </ul>
);

const ProcurementPack = () => {
  const handlePrint = () => window.print();

  return (
    <div className="min-h-dvh bg-background">
      {/* Non-printing header */}
      <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30 print:hidden">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/trust" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
          </div>
          <Button size="sm" onClick={handlePrint}>
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Save as PDF
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-3xl print:max-w-none print:px-0 print:py-0 space-y-12 print:space-y-8">
        {/* Cover */}
        <section className="text-center space-y-4 print:min-h-[80vh] print:flex print:flex-col print:justify-center">
          <img src={logo} alt="Quantivis" className="h-12 mx-auto" />
          <h1 className="text-4xl font-bold tracking-tight">Enterprise Procurement Pack</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Consolidated trust, governance, and compliance documentation for{" "}
            {CONTACT.companyLegal}.
          </p>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Badge variant="outline">Version {VERSION}</Badge>
            <Badge variant="outline">Reviewed {REVIEWED}</Badge>
            <Badge variant="outline">GDPR · DSGVO · EU AI Act</Badge>
          </div>
          <div className="text-xs text-muted-foreground pt-6 space-y-1">
            <div>Security: {CONTACT.email.security}</div>
            <div>Data Protection Officer: {CONTACT.email.dpo}</div>
            <div>Legal: {CONTACT.email.legal}</div>
            <div className="pt-2">{CONTACT.website}</div>
          </div>

          {/* Print-only TOC */}
          <div className="hidden print:block text-left mt-12 max-w-md mx-auto">
            <h3 className="font-semibold mb-2 text-sm">Contents</h3>
            <ol className="text-xs space-y-1 text-muted-foreground list-decimal list-inside">
              <li>Executive Summary</li>
              <li>Technical &amp; Organizational Measures (GDPR Art. 32)</li>
              <li>AI Governance &amp; EU AI Act Alignment</li>
              <li>Auditability &amp; Decision Traceability</li>
              <li>Incident Response &amp; Breach Notification</li>
              <li>Sub-processor Registry</li>
              <li>Attested Architectural Evidence</li>
              <li>Contact &amp; Coordinated Disclosure</li>
            </ol>
          </div>
        </section>

        <Section id="exec" title="1. Executive Summary">
          <p>
            Quantivis is governed operational intelligence infrastructure: a warehouse-native
            decision-support platform that combines deterministic statistical analysis with
            narrative AI, under explicit human oversight. This document consolidates the
            governance, security, and compliance posture in a single artefact suitable for
            procurement, DPO, and internal-audit review.
          </p>
          <p className="font-medium">Three commitments anchor everything that follows:</p>
          <BulletList
            items={[
              "Deterministic core, narrative AI — all numbers are reproducible; LLMs explain, never decide.",
              "Human in the loop by default — no material recommendation is executed without a named approver.",
              "Verifiable by construction — every claim in this pack maps to an enforced control in code, schema, or deployed configuration.",
            ]}
          />
        </Section>

        <Section id="toms" title="2. Technical & Organizational Measures (GDPR Art. 32)">
          <p className="text-muted-foreground italic">Full document: {CONTACT.website}/toms</p>

          <h3 className="font-semibold mt-4">2.1 Confidentiality</h3>
          <BulletList items={[
            "AES-256 encryption at rest (AWS KMS); TLS 1.2+ in transit.",
            "Row-Level Security on 100% of public-schema tables, scoped by organization_id.",
            "PII redaction layer applied before any LLM call by default.",
            "Role-based access control (Owner / Admin / Member / Viewer).",
          ]} />

          <h3 className="font-semibold mt-4">2.2 Integrity</h3>
          <BulletList items={[
            "Append-only audit log with database-level DENY on UPDATE/DELETE.",
            "Immutable decision ledger with versioned approvals.",
            "Cryptographic content hashing on ingested signals.",
          ]} />

          <h3 className="font-semibold mt-4">2.3 Availability &amp; Resilience</h3>
          <BulletList items={[
            "Automated daily backups, 7-day point-in-time recovery.",
            "Multi-AZ replication within EU processing region.",
            "Three-state circuit breaker on external connector calls.",
            "RTO 4h / RPO 1h targets documented in runbook.",
          ]} />

          <h3 className="font-semibold mt-4">2.4 Authentication &amp; Access</h3>
          <BulletList items={[
            "MFA (TOTP, WebAuthn/Passkeys).",
            "SAML 2.0 / OIDC SSO with domain enforcement option.",
            "Step-Up authentication for privileged operations.",
            "Adaptive auth throttling against brute-force attacks.",
          ]} />

          <h3 className="font-semibold mt-4">2.5 Monitoring, Personnel &amp; Lifecycle</h3>
          <BulletList items={[
            "Centralized structured logging with correlation_id across edge functions.",
            "Personnel under NDA; background checks for production access.",
            "Configurable retention with automated cleanup; self-service export and deletion.",
            "Continuous automated security scanning on every migration.",
          ]} />
        </Section>

        <Section id="ai" title="3. AI Governance & EU AI Act Alignment">
          <p className="text-muted-foreground italic">Full document: {CONTACT.website}/ai-governance</p>

          <h3 className="font-semibold mt-4">3.1 Risk Classification</h3>
          <p>
            Quantivis is classified as a <strong>Limited-Risk AI system</strong> under EU
            Regulation 2024/1689 (AI Act). It is decision-support; it does not autonomously make
            decisions affecting fundamental rights, employment, credit, or essential services.
            Article 50 transparency obligations are met via persistent in-product disclosure.
          </p>

          <h3 className="font-semibold mt-4">3.2 Deterministic Core, Narrative AI</h3>
          <BulletList items={[
            "All scoring, classification, and statistical inference is computed by deterministic pure functions (Holt's, ARIMA, K-Means, Isolation Forest, Welch's t-test).",
            "LLMs are used only for narrative generation, summarization, and translation.",
            "This separation ensures reproducibility, auditability, and freedom from stochastic model drift on core decisions.",
          ]} />

          <h3 className="font-semibold mt-4">3.3 Transparency &amp; Explainability</h3>
          <BulletList items={[
            "7-layer explainability structure on every recommendation.",
            "Confidence capped by sample size: <12 → 60%, <30 → 75%, 30+ → 90%.",
            "Bayesian calibration every 12h; versioned corrections visible to users.",
            "Persistent disclaimer on advisory, simulation, executive, and report surfaces.",
          ]} />

          <h3 className="font-semibold mt-4">3.4 Human Oversight (Art. 14)</h3>
          <BulletList items={[
            "No advisory is auto-executed; every recommendation requires named human approval.",
            "Step-Up authentication for privileged executive overrides.",
            "Boundary-conflict demotion when advisories contradict organizational identity.",
            "Outcome feedback loop closes the SUDAL learning cycle with human-verified results.",
          ]} />

          <h3 className="font-semibold mt-4">3.5 Bias &amp; Fairness</h3>
          <BulletList items={[
            "Disparate-impact ratio computed on segment-level outcomes; drift snapshots persisted.",
            "Fairness Observability dashboard surfaces dimension-level disparities to stewards.",
          ]} />
        </Section>

        <Section id="audit" title="4. Auditability & Decision Traceability">
          <p className="text-muted-foreground italic">Full document: {CONTACT.website}/auditability</p>

          <BulletList items={[
            "Immutable audit_log capturing every privileged action (login, role change, export, deletion, decision approval).",
            "End-to-end data lineage from raw ingestion to final insight, with evidence_sources on every record.",
            "Three-layer provenance — Client Truth, Market Intelligence, Synthesis — visible in DualLayerEvidencePanel.",
            "Versioned model and calibration history; Decision Accuracy Dashboard plots predicted vs. observed confidence.",
            "All 7 autonomous orchestration jobs logged to cron_run_log; advisory locks prevent overlap.",
            "Forensic reconstruction of decisions via DecisionReplay (drift detection).",
          ]} />

          <p className="mt-3">
            Enterprise customers may request read-only auditor accounts with scoped access to
            audit_log, cron_run_log, decision_ledger, and lineage surfaces. SAML SSO is supported
            for auditor identity federation.
          </p>
        </Section>

        <Section id="incident" title="5. Incident Response & Breach Notification">
          <p className="text-muted-foreground italic">Full document: {CONTACT.website}/incident-response</p>

          <h3 className="font-semibold mt-4">5.1 Severity &amp; SLAs</h3>
          <BulletList items={[
            "Sev-1 (data breach / total outage): 30-min ack, hourly updates, 24/7 on-call.",
            "Sev-2 (major degradation): 2h ack, updates every 4h.",
            "Sev-3 (minor): 1 business day ack, daily updates.",
          ]} />

          <h3 className="font-semibold mt-4">5.2 Six-Phase Response</h3>
          <BulletList items={[
            "Detect — continuous SLO probes, Sentry capture, customer reports.",
            "Triage — incident commander assigned within 30 minutes; correlation_id propagated.",
            "Contain — affected components isolated; credentials rotated via Vault if exposure suspected.",
            "Eradicate & Recover — RTO ≤ 4h, RPO ≤ 1h, verified before resolution notification.",
            "Notify — GDPR Art. 33: regulator notified within 72h; affected subjects without undue delay under Art. 34.",
            "Post-Mortem — blameless review within 14 days; corrective actions tracked to closure.",
          ]} />
        </Section>

        <Section id="subprocessors" title="6. Sub-processor Registry">
          <p className="text-muted-foreground italic">Live registry: {CONTACT.website}/subprocessors</p>

          <p>
            All sub-processors are bound by signed Art. 28 DPAs. Standard Contractual Clauses
            cover all transfers outside the EU/EEA. 30 days' advance notice for material changes.
          </p>

          <table className="w-full text-xs border-collapse mt-2">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-2 font-semibold">Sub-processor</th>
                <th className="text-left py-2 pr-2 font-semibold">Region</th>
                <th className="text-left py-2 pr-2 font-semibold">Purpose</th>
                <th className="text-left py-2 font-semibold">DPA</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {[
                ["AWS", "EU (Ireland)", "Cloud infrastructure", "Signed"],
                ["Supabase (Lovable Cloud)", "EU (Frankfurt)", "Database, auth, edge runtime", "Signed"],
                ["Lovable AB", "EU (Sweden)", "Build platform", "Signed"],
                ["Google (Gemini)", "EU/US (SCCs)", "LLM inference", "Signed"],
                ["OpenAI", "US (SCCs)", "Optional LLM (opt-in)", "Signed"],
                ["Anthropic", "US (SCCs)", "Optional LLM (opt-in)", "Signed"],
                ["Stripe", "EU/US (SCCs)", "Payments", "Signed"],
                ["Resend", "US (SCCs)", "Transactional email", "Signed"],
                ["Sentry", "EU/US (SCCs)", "Error monitoring", "Signed"],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-border/30">
                  {row.map((c, i) => <td key={i} className="py-2 pr-2">{c}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section id="evidence" title="7. Attested Architectural Evidence">
          <p>
            Each statement below is a verifiable property of the codebase, schema, or deployed
            configuration — enforced mechanically, not by policy intent.
          </p>
          <BulletList items={[
            "Public-schema tables with RLS: 100% (enforced by migration policy + Supabase linter).",
            "Audit log mutability: 0% (database-level DENY on UPDATE/DELETE).",
            "Decisions with named human approver: 100% (NOT NULL on approver_id at 'approved').",
            "Insights with evidence_sources: 100% (required JSONB column).",
            "Confidence capping by sample size: enforced in ml-engine.ts.",
            "Calibration cadence: every 12h via pg_cron with cron_run_log audit trail.",
            "Autonomous orchestration jobs: 7, protected by pg_advisory_lock.",
            "Edge functions with CORS + correlation_id: 100%.",
            "PII redaction before LLM: default on per organization.",
            "EU data residency: primary stores in AWS EU-West-1 / Supabase EU.",
            "Sub-processors with signed DPA: 100%.",
            "Disclaimer coverage on advisory surfaces: 100%.",
          ]} />
        </Section>

        <Section id="contact" title="8. Contact & Coordinated Disclosure">
          <p>
            For procurement questionnaires, customer-specific TOMs annexes, evidence packs
            (penetration test summaries, SOC-aligned control mappings, sub-processor DPAs),
            auditor access, or coordinated vulnerability disclosure, contact:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm mt-2">
            <div><strong>Security:</strong> {CONTACT.email.security}</div>
            <div><strong>DPO:</strong> {CONTACT.email.dpo}</div>
            <div><strong>Legal:</strong> {CONTACT.email.legal}</div>
            <div><strong>General:</strong> {CONTACT.email.general}</div>
            <div><strong>Web:</strong> {CONTACT.website}</div>
          </div>
          <p className="mt-3">
            Vulnerability disclosure policy and coordinated-disclosure terms are published at{" "}
            {CONTACT.website}/.well-known/security.txt. We acknowledge all reports within 24
            hours and provide updates every 7 days during active triage.
          </p>
        </Section>

        <footer className="text-[10px] text-muted-foreground/60 leading-relaxed pt-6 border-t border-border/30">
          {CONTACT.companyLegal} · Version {VERSION} · Reviewed {REVIEWED}. This pack
          consolidates information that is also available individually under {CONTACT.website}.
          Sub-processors, retention policies, and TOMs are reviewed at least annually and after
          any material change to processing activities. Quantivis is decision-support software;
          all outputs are probabilistic estimates and do not constitute financial, legal,
          medical, or professional advice.
        </footer>
      </main>

      {/* Mobile floating action */}
      <div className="fixed bottom-6 right-6 print:hidden md:hidden">
        <Button size="sm" onClick={handlePrint} className="shadow-lg">
          <Download className="w-3.5 h-3.5 mr-1.5" />
          PDF
        </Button>
      </div>

      <style>{`
        @media print {
          body { background: white !important; }
          .print\\:break-before-page { break-before: page; page-break-before: always; }
        }
        @page { margin: 2cm; }
      `}</style>
    </div>
  );
};

export default ProcurementPack;
