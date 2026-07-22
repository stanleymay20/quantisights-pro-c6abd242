import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Risk = { name: string; likelihood: 1 | 2 | 3 | 4 | 5; severity: 1 | 2 | 3 | 4 | 5; mitigation: string };

const risks: Risk[] = [
  { name: "Re-identification of pseudonymised data", likelihood: 2, severity: 4, mitigation: "PII redaction layer before LLM, organization_id scoping, AES-256 at rest" },
  { name: "Unauthorised access to customer data", likelihood: 2, severity: 5, mitigation: "RLS on 100% of tables, RBAC, MFA, WebAuthn, audit-log DENY UPDATE/DELETE" },
  { name: "Model bias / disparate impact", likelihood: 3, severity: 3, mitigation: "/fairness drift snapshots, confidence cap 0.85, human approval required" },
  { name: "Vendor lock-in / sub-processor change", likelihood: 2, severity: 2, mitigation: "30-day advance notice, right to object, export endpoints, /subprocessors registry" },
  { name: "Cross-border transfer breach (Chapter V)", likelihood: 2, severity: 4, mitigation: "SCCs (EU 2021/914 Modules 2/3), TIA, supplementary measures, EU-resident primary storage" },
  { name: "AI hallucination influencing decision", likelihood: 3, severity: 3, mitigation: "Deterministic ml-engine for all numbers; LLM only for narrative; evidence anchors mandatory" },
  { name: "Data retention beyond purpose", likelihood: 2, severity: 2, mitigation: "Automated cleanup, /data-retention policy, 7-day dataset purge on account closure" },
];

const heatColor = (l: number, s: number) => {
  const score = l * s;
  if (score >= 16) return "bg-red-500/15 text-red-500 border-red-500/30";
  if (score >= 9) return "bg-orange-500/15 text-orange-500 border-orange-500/30";
  if (score >= 4) return "bg-yellow-500/15 text-yellow-500 border-yellow-500/30";
  return "bg-green-500/15 text-green-500 border-green-500/30";
};

const DPIA = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>

    <main className="flex-1 container mx-auto px-6 py-12 max-w-4xl">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck className="w-7 h-7 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Data Protection Impact Assessment (DPIA)</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-2 max-w-2xl">
        Summary DPIA per GDPR Art. 35 covering Quantivis's operational reasoning platform. This page is a
        living summary — the signed, dated full DPIA template is available on request to procurement
        reviewers under NDA.
      </p>
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        <Badge variant="outline" className="text-[10px]">Version 1.0</Badge>
        <Badge variant="outline" className="text-[10px]">Effective: 30 May 2026</Badge>
        <Badge variant="outline" className="text-[10px]">Review cadence: annual</Badge>
      </div>

      {/* ── Executive summary ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-2">Executive Summary</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Quantivis processes operational business signals to produce diagnostic insights, decision
            recommendations, and governance evidence. All quantitative outputs are deterministic; LLMs
            are confined to narrative generation. Personal data is minimised (employees, clients, end-user
            identifiers tied to operational metrics). Net residual risk is assessed as <strong>Low–Moderate</strong>,
            with no high-risk processing per Annex III of the EU AI Act in the platform's default configuration.
          </p>
        </CardContent>
      </Card>

      {/* ── Scope & necessity ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-2">Scope &amp; Necessity Test (Art. 35 (7))</h2>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            <li><strong>Nature:</strong> SaaS processing of operational metrics, decisions, audit events.</li>
            <li><strong>Scope:</strong> Per-organization tenancy; data scoped by <code>organization_id</code>.</li>
            <li><strong>Context:</strong> B2B; controllers are the customers; data subjects are their employees and end users.</li>
            <li><strong>Purpose:</strong> Operational reasoning, governance evidence, decision support.</li>
            <li><strong>Necessity:</strong> Processing minimised to fields required to compute metrics; PII redacted before any LLM call.</li>
            <li><strong>Proportionality:</strong> Retention limits and cleanup enforced at the database layer.</li>
          </ul>
        </CardContent>
      </Card>

      {/* ── Risk matrix ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold">Risk Assessment Matrix (5 × 5)</h2>
          </div>
          <div className="rounded-md border border-border/40 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b border-border/30">
                  <th className="text-left py-2 px-3 font-semibold">Risk</th>
                  <th className="text-left py-2 px-3 font-semibold">Likelihood</th>
                  <th className="text-left py-2 px-3 font-semibold">Severity</th>
                  <th className="text-left py-2 px-3 font-semibold">Score</th>
                  <th className="text-left py-2 px-3 font-semibold">Mitigation</th>
                </tr>
              </thead>
              <tbody>
                {risks.map((r) => (
                  <tr key={r.name} className="border-b border-border/20">
                    <td className="py-2.5 px-3 font-medium">{r.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.likelihood}/5</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{r.severity}/5</td>
                    <td className="py-2.5 px-3">
                      <Badge variant="outline" className={`text-[10px] ${heatColor(r.likelihood, r.severity)}`}>
                        {r.likelihood * r.severity}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground max-w-md">{r.mitigation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Scoring: Likelihood × Severity. Green ≤ 3 · Yellow 4–8 · Orange 9–15 · Red 16+.
          </p>
        </CardContent>
      </Card>

      {/* ── AI governance mapping ── */}
      <Card className="border-border/50 mb-6">
        <CardContent className="pt-5">
          <h2 className="text-base font-semibold mb-2">AI Governance Mapping (EU AI Act)</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">
            EU AI Act classification is <strong>deployment-context dependent</strong>. Quantivis provides transparency,
            governance, explainability, and human-oversight controls. Final classification remains the responsibility
            of the deploying organization and legal review.
          </p>
          <p className="text-sm text-muted-foreground">
            Capability-level matrix: <Link to="/ai-system-classification" className="text-primary hover:underline">/ai-system-classification</Link>.
            Reasoning commitments and oversight controls: <Link to="/how-ai-is-used" className="text-primary hover:underline">/how-ai-is-used</Link>.
          </p>
        </CardContent>
      </Card>

      {/* ── Download / contact ── */}
      <Card className="border-primary/30 bg-primary/[0.02]">
        <CardContent className="pt-5 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold mb-1">Full Signed DPIA Template</h2>
            <p className="text-xs text-muted-foreground max-w-md">
              The complete DPIA document (signed, dated, with TIA and stakeholder consultation log) is
              shared with procurement reviewers under NDA. Request via the DPO.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href="mailto:dpo@quantivis.io?subject=DPIA%20Request">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Request DPIA
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  </div>
);

export default DPIA;
