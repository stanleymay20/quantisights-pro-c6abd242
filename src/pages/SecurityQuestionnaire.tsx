import { Link } from "react-router-dom";
import {
  Shield, CheckCircle2, ArrowRight, Database, Lock,
  Server, Users, Eye, ScrollText, AlertTriangle, Clock,
  FileCheck, KeyRound, Network
} from "lucide-react";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useSeoHead } from "@/lib/useSeoHead";

interface QAItem {
  id: string;
  question: string;
  answer: string;
}

const SECTIONS: { title: string; icon: React.ElementType; items: QAItem[] }[] = [
  {
    title: "Organization & Governance",
    icon: Users,
    items: [
      { id: "OG-1", question: "Does your organization have a formal information security program?", answer: "Yes. Quantivis maintains a formal information security program with documented policies covering access control, data classification, incident response, and secure development lifecycle. Controls are aligned with SOC 2 Type II criteria." },
      { id: "OG-2", question: "Do you have a designated security officer or team?", answer: "Yes. Security responsibilities are assigned to a dedicated team. Security architecture decisions are reviewed before deployment. Contact: security@quantivis.io." },
      { id: "OG-3", question: "Is there a risk management process in place?", answer: "Yes. Risks are identified, assessed, and mitigated through regular review cycles. Our architecture enforces least-privilege access, immutable audit trails, and database-level data isolation as structural risk controls." },
      { id: "OG-4", question: "What is your SOC 2 certification status?", answer: "Our infrastructure provider holds SOC 2 Type II certification. Quantivis has aligned its application-level controls to SOC 2 Trust Services Criteria (access control, audit logging, encryption, change management). A formal SOC 2 Type II audit for Quantivis as an entity is planned. If you need signed documents: DPA + Subprocessor Addendum are available on request." },
    ],
  },
  {
    title: "Data Protection & Privacy",
    icon: Lock,
    items: [
      { id: "DP-1", question: "How is data encrypted at rest and in transit?", answer: "All data is encrypted at rest using AES-256 via the managed PostgreSQL service. All data in transit is encrypted using TLS 1.2 minimum (TLS 1.3 where supported). No unencrypted channels are permitted." },
      { id: "DP-2", question: "Is customer data isolated between tenants?", answer: "Yes. Multi-tenant isolation is enforced at the database layer via Row-Level Security (RLS) policies on 100% of tables. Every query is scoped to organization_id. No cross-organization data access is architecturally possible." },
      { id: "DP-3", question: "Do you process data in compliance with GDPR?", answer: "Yes. We offer a Data Processing Agreement (DPA), support Subject Access Requests (SAR) via automated data export, and implement GDPR-compliant account deletion that purges data across 25+ tables. Our subprocessor list is publicly disclosed." },
      { id: "DP-4", question: "Where is customer data stored geographically?", answer: "Primary data storage (databases, file storage, backups) is located within the European Union (AWS EU-West-1, Ireland). Data transferred to subprocessors outside the EU is protected by Standard Contractual Clauses (SCCs)." },
      { id: "DP-5", question: "What is your data retention and deletion policy?", answer: "Configurable freshness policies are available per dataset. Account deletion triggers atomic purge across 25+ tables and removes the user from the authentication system. Database backups are encrypted and retained for 7 days on a rolling basis; deleted data may persist in backups until natural expiry." },
      { id: "DP-6", question: "Is customer data used to train AI/ML models?", answer: "No. Customer data is not used to train, fine-tune, or improve Quantivis models. AI features use third-party inference APIs (Google Gemini) in stateless, per-request mode — no data is retained by the provider after processing. Third-party processing is disclosed in the Subprocessor list." },
    ],
  },
  {
    title: "Access Control & Authentication",
    icon: KeyRound,
    items: [
      { id: "AC-1", question: "What authentication mechanisms are supported?", answer: "Email/password authentication with mandatory password strength validation (including HaveIBeenPwned breach database checking). JWT-based session management with automatic token refresh. No anonymous sign-ups are permitted." },
      { id: "AC-2", question: "Is multi-factor authentication (MFA) supported and enforced?", answer: "MFA is available when configured. Organizations can require AAL2 (Authenticator Assurance Level 2) for protected routes; enrolled users then complete a TOTP-based second-factor challenge before access. Enforcement evidence is tenant-specific and must be verified from organization settings and authentication logs." },
      { id: "AC-3", question: "How is role-based access control implemented?", answer: "Five roles are supported: Owner, Admin, Executive, Analyst, and Viewer. Roles are stored in a dedicated user_roles table (not on the profile). Access is enforced at the database layer via RLS policies using security-definer functions, preventing privilege escalation." },
      { id: "AC-4", question: "Are there least-privilege controls for sensitive data?", answer: "Yes. Strategic tables (decision_ledger, advisory_instances, decision_simulations, executive_modes, executive_briefs) use RESTRICTIVE RLS policies limiting access to Owner, Admin, and Executive roles. Viewers and Analysts cannot access strategic intelligence." },
    ],
  },
  {
    title: "Infrastructure & Network Security",
    icon: Server,
    items: [
      { id: "IN-1", question: "Where is your application hosted?", answer: "Quantivis is hosted on a managed cloud platform (AWS-backed infrastructure, Supabase). Database services run on managed PostgreSQL with SOC 2 Type II and ISO 27001 certified data centers, automated encrypted backups, and point-in-time recovery." },
      { id: "IN-2", question: "Are secrets and API keys managed securely?", answer: "Yes. All secrets (API keys, service role keys, webhook secrets) are stored in encrypted vault storage and injected as environment variables. Service role keys are not exposed to client-side code. The client bundle only contains the publishable anon key." },
      { id: "IN-3", question: "What DDoS and network-level protections are in place?", answer: "DDoS protection and network-level firewalling are provided by the infrastructure layer. Edge functions include code-level rate limiting for sensitive operations." },
      { id: "IN-4", question: "How are backups managed?", answer: "Automated encrypted backups are provided by the managed database service with point-in-time recovery. Backup retention follows the infrastructure provider's schedule." },
    ],
  },
  {
    title: "Audit & Monitoring",
    icon: ScrollText,
    items: [
      { id: "AM-1", question: "Do you maintain audit logs of user and system actions?", answer: "Yes. A comprehensive audit_log table records actor ID, actor type, action type, resource type, resource ID, payload, IP address, and timestamp for every significant action. The audit log is append-only — no UPDATE or DELETE RLS policies exist." },
      { id: "AM-2", question: "Can audit logs be tampered with?", answer: "No. The audit_log table has no UPDATE or DELETE RLS policies. Records are immutable by design. Even administrators cannot alter or remove audit entries through the application." },
      { id: "AM-3", question: "Is there a decision audit trail?", answer: "Yes. The decision_ledger tracks the full lifecycle: predict → decide → execute → measure. Each decision records confidence scores, chosen actions, outcomes, calibration errors, and attribution data. This is restricted to leadership roles." },
      { id: "AM-4", question: "Are AI outputs auditable?", answer: "Yes. AI explanations are stored with full feature attribution, confidence breakdowns, and model identification. An intelligence_audit_trail table records input data, output data, model used, processing time, and confidence scores for every AI operation." },
    ],
  },
  {
    title: "Incident Response & Business Continuity",
    icon: AlertTriangle,
    items: [
      { id: "IR-1", question: "Do you have a documented incident response process?", answer: "Yes. Our incident response process includes: (1) detection and containment, (2) forensic investigation, (3) customer notification within 72 hours where required by applicable law, and (4) post-incident review with remediation." },
      { id: "IR-2", question: "How are customers notified in the event of a breach?", answer: "We notify affected customers without undue delay where required by applicable law. Under GDPR Article 33, this means within 72 hours of confirmed detection. Notification includes the nature of the breach, data affected, and remediation steps taken." },
      { id: "IR-3", question: "What is your disaster recovery strategy?", answer: "Daily encrypted backups with 7-day rolling retention. Target RPO: 24 hours (best effort). Target RTO: 4 hours (best effort) — may vary during major incidents. Infrastructure runs on managed services with built-in redundancy. Application logic is stateless and can be redeployed immediately." },
    ],
  },
  {
    title: "Third-Party & Subprocessor Management",
    icon: Network,
    items: [
      { id: "TP-1", question: "Who are your subprocessors?", answer: "AWS (EU infrastructure), Stripe (payments, PCI DSS Level 1), Google (AI inference, stateless), and Resend (transactional email). Full list with purposes, regions, and safeguards is published at /subprocessors." },
      { id: "TP-2", question: "How are subprocessors evaluated?", answer: "Subprocessors are selected based on security certifications (SOC 2, PCI DSS, ISO 27001), data residency options, and contractual data protection obligations. We provide 30 days' advance notice before adding or replacing a subprocessor." },
      { id: "TP-3", question: "Is a DPA available?", answer: "Yes. A GDPR-compliant Data Processing Agreement is available for all customers at /dpa. It covers data processing purposes, security measures, subprocessor obligations, and data subject rights." },
    ],
  },
  {
    title: "AI Governance & Explainability",
    icon: Eye,
    items: [
      { id: "AI-1", question: "How do you ensure AI transparency?", answer: "All AI outputs include confidence scores and feature attribution explanations. Counterfactual analysis shows what would need to change for a different recommendation. Cognitive bias detection monitors recommendation quality." },
      { id: "AI-2", question: "Is there cross-organization learning?", answer: "No. AI insights are generated per-request using only the requesting organization's data. No customer data is shared across organizations. Third-party processing is disclosed in the Subprocessor list." },
      { id: "AI-3", question: "How are AI confidence scores calibrated?", answer: "Confidence scores are capped using a data-quality-aware system that accounts for sample size, data freshness, and variance. Calibration assessments track overconfidence and underconfidence over time. Historical calibration errors are recorded and used to adjust future outputs." },
    ],
  },
];

const SecurityQuestionnaire = () => {
  useSeoHead({
    title: "Security Questionnaire | Quantivis",
    description: "Pre-answered Quantivis security questionnaire covering governance, data protection, access controls, infrastructure, audit logging, incident response, and AI governance.",
    canonicalPath: "/security-questionnaire",
  });

  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30 print:hidden">
      <div className="container mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
        <div className="flex items-center gap-4">
          <Link to="/security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Security Overview
          </Link>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            Print / Save PDF
          </button>
        </div>
      </div>
    </header>

    <SectionErrorBoundary sectionName="Security Questionnaire">
        <main className="flex-1 container mx-auto px-6 py-16 max-w-4xl">
      {/* Header */}
      <div className="mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-4">
          <Shield className="w-3.5 h-3.5" />
          Enterprise Security Questionnaire
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3 tracking-tight">
          Security Questionnaire Responses
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl">
          Pre-answered responses to standard enterprise security questionnaire topics
          (SIG Lite / CAIQ aligned). Designed for procurement, InfoSec, and compliance review teams.
          If you need signed documents: DPA + Subprocessor Addendum available on request.
        </p>
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Last reviewed: March 3, 2026</span>
          <span className="flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5" /> {SECTIONS.reduce((sum, s) => sum + s.items.length, 0)} questions answered</span>
        </div>
      </div>

      {/* Scope & Overview */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6 mb-12 space-y-6">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Scope</h2>
          <p className="text-sm text-foreground/90 leading-relaxed">
            This questionnaire applies to the Quantivis production environment and all customer data processed within it.
            It does not cover customer-managed systems, devices, or third-party integrations configured by the customer.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Hosting & Data Location</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Hosted on</span><span className="font-medium">Supabase (AWS-backed)</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Primary region</span><span className="font-medium">EU-West-1 (Ireland)</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Data residency options</span><span className="font-medium">EU only (default)</span></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Encryption</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">In transit</span><span className="font-medium">TLS 1.2 minimum / 1.3</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">At rest</span><span className="font-medium">AES-256</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Key management</span><span className="font-medium">Platform-managed (AWS KMS)</span></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Backups & Recovery</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Backup frequency</span><span className="font-medium">Daily, encrypted</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Retention</span><span className="font-medium">7 days rolling</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Target RPO</span><span className="font-medium">24 hours (best effort)</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Target RTO</span><span className="font-medium">4 hours (best effort)</span></li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Vulnerability Management</h3>
            <ul className="space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Patching cadence</span><span className="font-medium">Managed by platform</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Penetration testing</span><span className="font-medium">Planned; annual once active</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Bug reporting</span><span className="font-medium">security@quantivis.io</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/50 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Shared Responsibility</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Quantivis is responsible for platform security, data isolation, encryption, access control enforcement, and incident response.
            Customers are responsible for managing their user accounts, device security, organizational access policies, and the accuracy of data they upload.
          </p>
        </div>
      </div>

      {/* Table of Contents */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-6 mb-12">
        <h2 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">Contents</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.title}
              href={`#${section.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors py-1"
            >
              <section.icon className="w-4 h-4 text-primary shrink-0" />
              <span>{section.title}</span>
              <span className="text-xs text-muted-foreground ml-auto">{section.items.length} items</span>
            </a>
          ))}
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-16">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            id={section.title.toLowerCase().replace(/[^a-z]+/g, "-")}
            className="scroll-mt-20"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <section.icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <h2 className="text-[16px] font-semibold tracking-tight tracking-tight">{section.title}</h2>
            </div>

            <div className="space-y-4">
              {section.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/50 bg-card/50 p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0 mt-0.5">
                      {item.id}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold mb-2">{item.question}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.answer}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Related Documents */}
      <div className="mt-16 rounded-xl border border-primary/20 bg-primary/5 p-8">
        <h2 className="text-lg font-bold tracking-tight mb-2">Supporting Documentation</h2>
        <p className="text-sm text-muted-foreground mb-6">
          The following documents are publicly available and supplement this questionnaire.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { label: "Security Overview", href: "/security" },
            { label: "Privacy Policy", href: "/privacy" },
            { label: "Data Processing Agreement (DPA)", href: "/dpa" },
            { label: "Data Retention Policy", href: "/data-retention" },
            { label: "Subprocessor List", href: "/subprocessors" },
            { label: "Terms of Service", href: "/terms" },
            { label: "Cookie Policy", href: "/cookies" },
            { label: "Vulnerability Disclosure (security.txt)", href: "/.well-known/security.txt" },
          ].map((doc) => (
            <Link
              key={doc.label}
              to={doc.href}
              className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
            >
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>{doc.label}</span>
              <ArrowRight className="w-3.5 h-3.5 ml-auto text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>
          Need a custom response or additional documentation?{" "}
          <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">
            {CONTACT.email.security}
          </a>
        </p>
      </div>
    </main>
        </SectionErrorBoundary>

    <footer className="border-t border-border/30 py-8 mt-16 print:hidden">
      <div className="container mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Quantivis Global. All rights reserved.</p>
        <div className="flex items-center gap-6">
          <Link to="/security" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Security</Link>
          <Link to="/privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/dpa" className="text-xs text-muted-foreground hover:text-foreground transition-colors">DPA</Link>
          <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Home</Link>
        </div>
      </div>
    </footer>
  </div>
  );
};

export default SecurityQuestionnaire;
