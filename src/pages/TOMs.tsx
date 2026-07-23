import { Shield, Lock, Eye, Database, Server, Users, FileCheck, Activity, KeyRound, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CONTACT } from "@/lib/contact-config";

interface Measure {
  icon: React.ElementType;
  title: string;
  artRef: string;
  controls: string[];
}

const measures: Measure[] = [
  {
    icon: Lock,
    title: "Confidentiality",
    artRef: "Art. 32 (1) (b)",
    controls: [
      "AES-256 encryption at rest on all storage volumes (AWS KMS).",
      "TLS 1.2+ enforced on all client and inter-service connections; HSTS preload.",
      "Row-Level Security on 100% of public-schema tables, scoped by organization_id.",
      "PII redaction layer applied before any LLM call unless raw text is explicitly enabled.",
      "Role-based access control (Owner / Admin / Member / Viewer) with least-privilege defaults.",
    ],
  },
  {
    icon: Database,
    title: "Integrity",
    artRef: "Art. 32 (1) (b)",
    controls: [
      "Append-only audit log (audit_log) with DENY policies on UPDATE and DELETE at database level.",
      "Immutable Decision Ledger with versioned approvals, rationale, and actor identity.",
      "Cryptographic content hashing on ingested signals (content_hash) for tamper detection.",
      "Schema migrations under version control; every change traceable to a commit.",
    ],
  },
  {
    icon: Activity,
    title: "Availability & Resilience",
    artRef: "Art. 32 (1) (b) & (c)",
    controls: [
      "Automated daily backups with point-in-time recovery (7-day window, configurable).",
      "Multi-AZ database replication within the EU processing region.",
      "Three-state circuit breaker on external connector calls; exponential backoff with jitter.",
      "Disaster recovery runbook with documented RTO (4h) and RPO (1h) targets.",
      "Real-time SLO probes on /system-health; cron health log retained for forensic review.",
    ],
  },
  {
    icon: KeyRound,
    title: "Authentication & Access",
    artRef: "Art. 32 (1) (b)",
    controls: [
      "Multi-factor authentication (TOTP, WebAuthn/Passkeys) available to all users.",
      "SAML 2.0 / OIDC SSO with enforced domain-level SSO policy option.",
      "Step-Up authentication required for privileged operations (deletion, role change, exports).",
      "Session management with configurable timeout and concurrent session limits.",
      "Adaptive auth throttling (useAuthThrottle) to mitigate brute-force attacks.",
    ],
  },
  {
    icon: Eye,
    title: "Monitoring & Logging",
    artRef: "Art. 32 (1) (d)",
    controls: [
      "Centralized structured logging with correlation_id across all edge functions.",
      "Login anomaly detection with audit trail (AuthEventLog).",
      "Rate limiting on copilot, export, deletion, and authentication endpoints.",
      "Sentry-based error capture with PII scrubbing.",
    ],
  },
  {
    icon: Users,
    title: "Personnel & Process",
    artRef: "Art. 32 (4)",
    controls: [
      "All personnel under written confidentiality obligations (NDA / employment contract).",
      "Background checks for staff with production access.",
      "Documented incident response playbook; on-call rotation for severity-1 events.",
      "Regular security awareness training; annual review of access permissions.",
    ],
  },
  {
    icon: Server,
    title: "Sub-processor Governance",
    artRef: "Art. 28 & 32",
    controls: [
      "Public sub-processor registry maintained at /subprocessors.",
      "Written sub-processor agreements (Art. 28 DPAs) on file for all listed processors.",
      "EU/EEA processing region for all primary data stores; no transfer to third countries without SCCs.",
      "30-day advance notice for material sub-processor changes.",
    ],
  },
  {
    icon: RefreshCw,
    title: "Data Lifecycle & Erasure",
    artRef: "Art. 17 & 32",
    controls: [
      "Configurable retention policies per data category with automated cleanup (daily cron).",
      "Self-service export and deletion via PrivacyDashboard.",
      "Hard-delete cascades respect immutable audit log requirements (Art. 30 record-keeping).",
      "Vault-backed credential isolation for all connector tokens; rotation supported.",
    ],
  },
  {
    icon: FileCheck,
    title: "Testing & Assurance",
    artRef: "Art. 32 (1) (d)",
    controls: [
      "Continuous automated security scanning on every migration.",
      "End-to-end test suite covering auth, navigation, and accessibility (WCAG).",
      "Annual penetration test by independent third party (on request for enterprise customers).",
      "Vulnerability disclosure policy published at /.well-known/security.txt.",
    ],
  },
];

const TOMs = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">
              Technical &amp; Organizational Measures
            </h1>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-3xl">
            This document describes the technical and organizational measures (TOMs) implemented
            by {CONTACT.companyLegal} in accordance with Article 32 of the EU General Data
            Protection Regulation (GDPR / DSGVO). It forms a binding annex to our Data
            Processing Agreement (AVV).
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">GDPR Art. 32</Badge>
            <Badge variant="outline">DSGVO-konform</Badge>
            <Badge variant="outline">EU Data Region</Badge>
            <Badge variant="outline">Version 2026.1</Badge>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          {measures.map((m) => (
            <Card key={m.title} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <m.icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{m.title}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{m.artRef}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  {m.controls.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="text-primary/50 mt-1 shrink-0">•</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-2">Auditor &amp; Procurement Contact</h2>
            <p className="text-sm text-muted-foreground mb-3">
              For signed PDF copies, customer-specific TOMs annexes, or evidence packs
              (penetration test summaries, SOC-aligned control mappings, sub-processor DPAs),
              contact our security team directly.
            </p>
            <div className="text-sm space-y-1">
              <div>Security: <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">{CONTACT.email.security}</a></div>
              <div>Data Protection Officer: <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a></div>
              <div>Legal: <a href={`mailto:${CONTACT.email.legal}`} className="text-primary hover:underline">{CONTACT.email.legal}</a></div>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Last reviewed: May 2026. Measures are reviewed at least annually and after any
          material change in processing activities. Controls listed here reflect the platform
          state at the time of review and may evolve as standards change.
        </p>
      </div>
    </div>
  );
};

export default TOMs;
