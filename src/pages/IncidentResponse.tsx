import { AlertTriangle, Clock, Phone, FileCheck, Bell, Shield, Users, RotateCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CONTACT } from "@/lib/contact-config";

const phases = [
  {
    icon: Bell,
    phase: "1. Detect",
    sla: "Continuous",
    items: [
      "Real-time SLO probes on /system-health (5-minute cron).",
      "Sentry error capture with severity classification and on-call paging.",
      "Login anomaly detection and rate-limit alerts.",
      "Customer-reported incidents via security@ and in-app support.",
    ],
  },
  {
    icon: AlertTriangle,
    phase: "2. Triage",
    sla: "≤ 30 min",
    items: [
      "On-call engineer acknowledges within 30 minutes (24/7 for severity 1).",
      "Severity classified: Sev-1 (data breach / total outage), Sev-2 (major degradation), Sev-3 (minor).",
      "Incident commander assigned; correlation_id propagated through logs.",
    ],
  },
  {
    icon: Shield,
    phase: "3. Contain",
    sla: "≤ 1 hour (Sev-1)",
    items: [
      "Affected components isolated; circuit breakers tripped on compromised connectors.",
      "Credentials rotated via Vault if exposure suspected.",
      "Customer-affecting endpoints rate-limited or temporarily disabled.",
    ],
  },
  {
    icon: RotateCw,
    phase: "4. Eradicate & Recover",
    sla: "RTO ≤ 4h, RPO ≤ 1h",
    items: [
      "Root cause patched; verified in staging before production rollout.",
      "Point-in-time recovery from automated backups if data integrity affected.",
      "System Health and Decision Accuracy dashboards verified green before customer notification of resolution.",
    ],
  },
  {
    icon: FileCheck,
    phase: "5. Notify",
    sla: "≤ 72h (GDPR Art. 33)",
    items: [
      "Personal data breaches notified to supervisory authority within 72 hours (DSGVO Art. 33).",
      "Affected data subjects notified without undue delay when high risk to rights and freedoms (Art. 34).",
      "Customer notification includes: nature, categories of data, approximate volume, likely consequences, measures taken.",
      "Public incident updates posted to /status throughout the event.",
    ],
  },
  {
    icon: Users,
    phase: "6. Post-Mortem",
    sla: "≤ 14 days",
    items: [
      "Blameless post-mortem with timeline, root cause, contributing factors, and corrective actions.",
      "Corrective actions tracked to closure; verified by independent reviewer.",
      "Findings shared with affected customers; aggregate trends reviewed quarterly.",
      "Incident playbook updated; tabletop exercise scheduled if novel failure mode.",
    ],
  },
];

const severities = [
  { level: "Sev-1", color: "destructive", ack: "30 min", update: "Hourly", description: "Data breach, total outage, or customer data integrity compromised." },
  { level: "Sev-2", color: "yellow", ack: "2 hours", update: "Every 4h", description: "Major feature degradation, partial outage, or significant performance impact." },
  { level: "Sev-3", color: "muted", ack: "1 business day", update: "Daily", description: "Minor bug, single-customer issue, or cosmetic defect." },
];

const IncidentResponse = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">Incident Response</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-3xl">
            How {CONTACT.companyLegal} detects, contains, and communicates security and
            availability incidents. Aligned with GDPR Art. 33–34 notification obligations and
            ISO 27035 incident management practice.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">24/7 On-Call (Sev-1)</Badge>
            <Badge variant="outline">72h Regulator Notification</Badge>
            <Badge variant="outline">RTO 4h / RPO 1h</Badge>
            <Badge variant="outline">ISO 27035-aligned</Badge>
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-3">Severity Classification</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {severities.map((s) => (
              <Card key={s.level} className="border-border/50">
                <CardContent className="pt-4 pb-4">
                  <Badge variant="outline" className="mb-2 text-[10px]">{s.level}</Badge>
                  <div className="text-xs text-muted-foreground space-y-1 mt-1">
                    <div><span className="font-medium text-foreground">Ack:</span> {s.ack}</div>
                    <div><span className="font-medium text-foreground">Updates:</span> {s.update}</div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{s.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Separator />

        <div>
          <h2 className="text-lg font-semibold mb-3">Response Phases</h2>
          <div className="space-y-3">
            {phases.map((p) => (
              <Card key={p.phase} className="border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <p.icon className="w-5 h-5 text-primary" />
                      <CardTitle className="text-base">{p.phase}</CardTitle>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      <Clock className="w-3 h-3 mr-1" />
                      {p.sla}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2">
                    {p.items.map((it, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                        <span className="text-primary/50 mt-1 shrink-0">•</span>
                        {it}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-2 flex items-center gap-2">
              <Phone className="w-4 h-4 text-destructive" />
              Report a Security Incident
            </h2>
            <p className="text-sm text-muted-foreground mb-3">
              If you believe you have discovered a vulnerability or are experiencing a security
              incident affecting your data, contact us immediately. We acknowledge all reports
              within 24 hours and provide regular updates throughout the investigation.
            </p>
            <div className="text-sm space-y-1">
              <div>Security: <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">{CONTACT.email.security}</a></div>
              <div>Emergency contact (business hours): <a href={`mailto:${CONTACT.email.security}`} className="text-primary hover:underline">{CONTACT.email.security}</a></div>
              <div>Coordinated disclosure policy: <a href="/.well-known/security.txt" className="text-primary hover:underline">/.well-known/security.txt</a></div>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Last reviewed: May 2026. The full disaster-recovery runbook and incident-response
          playbook are available to enterprise customers under NDA on request.
        </p>
      </div>
    </div>
  );
};

export default IncidentResponse;
