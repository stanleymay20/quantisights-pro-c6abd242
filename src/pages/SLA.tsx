import { Link } from "react-router-dom";
import { Shield, Clock, AlertTriangle, CheckCircle2, ArrowLeft, Phone, Mail, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const SLA = () => {
  const lastUpdated = "March 2026";

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src={logo} alt="Quantivis" className="h-7" />
            </Link>
            <span className="text-sm text-muted-foreground font-medium">/ Service Level Agreement</span>
          </div>
          <Link to="/" className="text-xs text-primary hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Home
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Service Level Agreement</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
          <p className="text-muted-foreground mt-3">
            This SLA defines the operational guarantees, incident response commitments, and disaster recovery
            procedures for the Quantivis Decision Governance Platform.
          </p>
        </div>

        {/* Uptime Guarantee */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" /> Uptime Guarantee
          </h2>
          <Card className="border border-border/50">
            <CardContent className="py-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Platform Availability Target</span>
                <Badge className="bg-success/10 text-success border-success/20 text-lg px-3 py-1">99.9% target</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                A 99.9% monthly availability target is contractually committed for eligible enterprise customers
                only when incorporated into the applicable Order Form. Measurement covers the platform API and
                dashboard under the terms and exclusions below.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "Monthly Allowed Downtime", value: "≤ 43 minutes" },
                  { label: "Quarterly Target", value: "99.95%" },
                  { label: "Measurement Interval", value: "1-minute checks" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-muted/30 p-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">{label}</div>
                    <div className="text-sm font-bold text-foreground">{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-base">Exclusions</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>The following are excluded from uptime calculations:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Scheduled maintenance (communicated 48+ hours in advance)</li>
                <li>Third-party infrastructure outages beyond our control</li>
                <li>Customer-caused issues (misconfigured integrations, API abuse)</li>
                <li>Force majeure events</li>
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Incident Response */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" /> Incident Response Plan
          </h2>

          <div className="space-y-3">
            {[
              {
                severity: "P0 — Critical",
                badge: "destructive" as const,
                description: "Platform unavailable, data loss risk, or security breach",
                response: "15 minutes",
                resolution: "4 hours",
                communication: "Every 30 minutes via email + status page",
                actions: [
                  "Automated alerting triggers on-call engineer",
                  "War room opened immediately",
                  "Status page updated within 15 minutes",
                  "Post-incident review within 24 hours",
                ],
              },
              {
                severity: "P1 — High",
                badge: "default" as const,
                description: "Core feature degraded (decision loop, calibration, advisory pipeline)",
                response: "30 minutes",
                resolution: "8 hours",
                communication: "Every 1 hour via email",
                actions: [
                  "On-call engineer notified",
                  "Root cause investigation begins",
                  "Workaround communicated if available",
                  "Fix deployed within business hours",
                ],
              },
              {
                severity: "P2 — Medium",
                badge: "secondary" as const,
                description: "Non-critical feature issue, performance degradation, UI bugs",
                response: "4 hours",
                resolution: "48 hours",
                communication: "Daily updates if active",
                actions: [
                  "Logged and triaged during business hours",
                  "Scheduled for next release if non-urgent",
                  "Customer notified of resolution plan",
                ],
              },
              {
                severity: "P3 — Low",
                badge: "outline" as const,
                description: "Cosmetic issues, feature requests, minor UX improvements",
                response: "1 business day",
                resolution: "Next release cycle",
                communication: "On resolution",
                actions: [
                  "Added to product backlog",
                  "Prioritized in regular sprint planning",
                ],
              },
            ].map((tier) => (
              <Card key={tier.severity} className="border border-border/50">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant={tier.badge}>{tier.severity}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{tier.description}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
                    <div className="bg-muted/20 rounded p-2">
                      <div className="text-[11px] text-muted-foreground">Response</div>
                      <div className="text-sm font-semibold">{tier.response}</div>
                    </div>
                    <div className="bg-muted/20 rounded p-2">
                      <div className="text-[11px] text-muted-foreground">Resolution</div>
                      <div className="text-sm font-semibold">{tier.resolution}</div>
                    </div>
                    <div className="bg-muted/20 rounded p-2 col-span-2 sm:col-span-1">
                      <div className="text-[11px] text-muted-foreground">Updates</div>
                      <div className="text-sm font-semibold">{tier.communication}</div>
                    </div>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {tier.actions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <CheckCircle2 className="w-3 h-3 text-success mt-0.5 shrink-0" />
                        {a}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Disaster Recovery */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Disaster Recovery & Rollback
          </h2>
          <Card className="border border-border/50">
            <CardContent className="py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Recovery Point Objective (RPO)", value: "≤ 1 hour", desc: "Maximum data loss in worst-case scenario" },
                  { label: "Recovery Time Objective (RTO)", value: "≤ 4 hours", desc: "Maximum time to restore full service" },
                  { label: "Backup Frequency", value: "Continuous + Daily", desc: "Point-in-time recovery with daily full snapshots" },
                  { label: "Backup Retention", value: "30 days", desc: "Full backups retained for 30 days minimum" },
                ].map(({ label, value, desc }) => (
                  <div key={label} className="border border-border/30 rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-lg font-bold text-foreground">{value}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border/30 pt-4">
                <h3 className="text-sm font-semibold mb-2">Rollback Strategy</h3>
                <ul className="text-sm text-muted-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    <span><strong>Database rollback:</strong> Point-in-time recovery to any second within RPO window</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    <span><strong>Application rollback:</strong> Instant revert to previous deployment via immutable builds</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    <span><strong>Edge function rollback:</strong> Previous function versions retained and deployable within minutes</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    <span><strong>Dataset versioning:</strong> All dataset uploads are versioned — rollback to any prior version</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Monitoring */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Monitoring & Observability
          </h2>
          <Card className="border border-border/50">
            <CardContent className="py-5">
              <ul className="text-sm text-muted-foreground space-y-3">
                {[
                  "Automated cron job health checks with success/failure logging",
                  "Advisory lock-based overlap protection for scheduled jobs",
                  "Structured JSON logging with request correlation IDs",
                  "Real-time system status page at /status",
                  "Client-side error boundary with structured error capture",
                  "Database-level audit trail for all decision mutations",
                  "Idempotent pipeline execution with retry safety",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        {/* Contact */}
        <section className="space-y-4">
          <h2 className="text-[16px] font-semibold">Incident Reporting</h2>
          <Card className="border border-border/50">
            <CardContent className="py-5">
              <p className="text-sm text-muted-foreground mb-4">
                To report an incident or request support, contact us through any of these channels:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-primary" />
                  <a href={`mailto:${CONTACT.email.general}`} className="text-primary hover:underline">{CONTACT.email.general}</a>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4 text-primary" />
                  <Link to="/status" className="text-primary hover:underline">System Status Page</Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border/30">
          <div className="flex items-center justify-center gap-4">
            <Link to="/security" className="text-xs text-primary hover:underline">Security</Link>
            <Link to="/status" className="text-xs text-primary hover:underline">System Status</Link>
            <Link to="/privacy" className="text-xs text-primary hover:underline">Privacy</Link>
            <Link to="/terms" className="text-xs text-primary hover:underline">Terms</Link>
          </div>
          <p className="text-xs text-muted-foreground mt-3">© {new Date().getFullYear()} Quantivis Global. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
};

export default SLA;
