import { FileSearch, Database, GitBranch, Lock, Eye, Clock, FileCheck, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CONTACT } from "@/lib/contact-config";

const layers = [
  {
    icon: Database,
    title: "Immutable Audit Log",
    badge: "Append-only",
    points: [
      "Every privileged action (login, role change, export, deletion, decision approval) is written to audit_log.",
      "Database-level DENY policies on UPDATE and DELETE — no user, including administrators, can rewrite history.",
      "Each entry captures: actor identity, action type, resource, timestamp, payload, and correlation_id.",
      "Retention is independent of business data retention; audit records are preserved for the legally required period.",
    ],
  },
  {
    icon: GitBranch,
    title: "Data Lineage",
    badge: "End-to-end",
    points: [
      "Every metric is traceable from raw ingestion → cleaning → aggregation → insight via the Lineage Explorer.",
      "Source rows, vendor, and timestamp are persisted in evidence_sources JSONB on every insight.",
      "Three-layer provenance is visible: Client Truth (your data), Market Intelligence (external), Synthesis (combined).",
      "Information Quality scores (7 dimensions) accompany every source so auditors can assess input reliability.",
    ],
  },
  {
    icon: FileCheck,
    title: "Decision Ledger",
    badge: "Versioned",
    points: [
      "Every decision has a versioned lifecycle: pending → approved/dismissed → executed → measured.",
      "Each state transition is timestamped with actor identity and free-text rationale.",
      "Drift detection compares predicted vs. observed outcomes; effectiveness scores (0-100) close the loop.",
      "DecisionReplay reconstructs the exact evidence state at the moment of approval.",
    ],
  },
  {
    icon: Eye,
    title: "Model & Calibration History",
    badge: "Transparent",
    points: [
      "Bayesian calibration runs every 12h; every correction is versioned (model_version) and visible to users.",
      "Confidence bands, sample sizes, and bias direction are recorded per calibration cycle.",
      "Decision Accuracy Dashboard plots predicted vs. observed confidence over time as visual proof of quality.",
      "Concept association mining (TF-IDF, support/confidence/lift) is fully introspectable — no black-box embeddings on core scoring.",
    ],
  },
  {
    icon: Clock,
    title: "Operational Job History",
    badge: "Observable",
    points: [
      "All 7 autonomous orchestration jobs log to cron_run_log with status, duration, errors, and metadata.",
      "Advisory locks (pg_advisory_lock) prevent concurrent execution overlap; lock acquisition is logged.",
      "Pipeline run history is queryable for any incident or compliance review.",
      "System Health surface provides real-time visibility into pipeline status, closed-loop rates, and job health.",
    ],
  },
  {
    icon: Lock,
    title: "Access & Authentication Trail",
    badge: "Forensic",
    points: [
      "Every login, MFA challenge, SSO assertion, and session is logged with IP, user agent, and outcome.",
      "Step-Up authentication events are logged separately for privileged operations.",
      "Login anomalies (impossible travel, unusual device) raise alerts and are persisted.",
      "Session and MFA state is reviewable per-user via the AuthEventLog component.",
    ],
  },
];

const Auditability = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <FileSearch className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Auditability</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-3xl">
            Quantivis is built so that every number, every recommendation, and every
            administrative action can be reconstructed and verified after the fact. This page
            documents the audit surfaces available to internal auditors, external assessors,
            and regulators.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">Immutable Logs</Badge>
            <Badge variant="outline">Full Lineage</Badge>
            <Badge variant="outline">Reproducible Decisions</Badge>
            <Badge variant="outline">GDPR Art. 30</Badge>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "Tables with RLS", value: "100%", desc: "Org-scoped" },
            { label: "Audit Mutability", value: "0%", desc: "No UPDATE/DELETE" },
            { label: "Lineage Coverage", value: "Full", desc: "Source → insight" },
          ].map((s) => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-xs font-medium mt-1">{s.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.desc}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-3">
          {layers.map((l) => (
            <Card key={l.title} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <l.icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{l.title}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{l.badge}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  {l.points.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="text-primary/50 mt-1 shrink-0">•</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/system-health")}>
            <History className="w-3.5 h-3.5 mr-1.5" /> System Health
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/decision-accuracy")}>
            <Eye className="w-3.5 h-3.5 mr-1.5" /> Decision Accuracy
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/lineage")}>
            <GitBranch className="w-3.5 h-3.5 mr-1.5" /> Data Lineage
          </Button>
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-2">Auditor Access</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Enterprise customers can request read-only auditor accounts with scoped access
              to audit_log, cron_run_log, decision_ledger, and lineage surfaces. We support
              SAML SSO for auditor identity federation.
            </p>
            <div className="text-sm space-y-1">
              <div>Audit access: <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">{CONTACT.email.security}</a></div>
              <div>Legal: <a href={`mailto:${CONTACT.email.legal}`} className="text-primary hover:underline">{CONTACT.email.legal}</a></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auditability;
