import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSeoHead } from "@/lib/useSeoHead";

const CAPABILITIES: Array<{
  capability: string;
  aiActCategory: "Minimal" | "Limited" | "High" | "Prohibited" | "Not in scope";
  oversight: string;
  explainability: string;
  logging: string;
  dataGovernance: string;
  notes: string;
}> = [
  {
    capability: "Statistical diagnostics (Welch's t-test, ARIMA, Holt's)",
    aiActCategory: "Not in scope",
    oversight: "Deterministic; no AI",
    explainability: "Formula + p-value",
    logging: "Insight write to insights table with evidence_sources",
    dataGovernance: "Source dataset_id required",
    notes: "Pure-function ml-engine.ts; outside EU AI Act scope.",
  },
  {
    capability: "AI-generated narratives (briefs, summaries)",
    aiActCategory: "Limited",
    oversight: "Human approval before publication",
    explainability: "Bullet-level evidence anchors + confidence",
    logging: "Inference logged via correlation_id",
    dataGovernance: "PII redacted before LLM call",
    notes: "Transparency obligations (Art. 50). User-visible disclaimer present.",
  },
  {
    capability: "Decision recommendations (advisory)",
    aiActCategory: "Limited",
    oversight: "Named approver required at 'approved' state",
    explainability: "7-layer explainability + counterfactuals",
    logging: "Full decision_ledger trail (immutable)",
    dataGovernance: "evidence_sources NOT NULL",
    notes: "Recommendation only; no automated decision making per Art. 22 GDPR.",
  },
  {
    capability: "Autonomous interventions (intervention engine)",
    aiActCategory: "Limited",
    oversight: "Auto-triggered, human-resolvable; intervention_learning writeback",
    explainability: "Trigger rule + evidence snapshot stored on intervention",
    logging: "execution_interventions + audit_log",
    dataGovernance: "Scoped to organization; severity gating",
    notes: "Action surface only — does not bypass downstream approval.",
  },
  {
    capability: "Fairness & drift monitoring",
    aiActCategory: "Limited",
    oversight: "Drift snapshots reviewed in /fairness",
    explainability: "disparate_impact_ratio + sample sizes",
    logging: "fairness_drift_snapshots (append-only)",
    dataGovernance: "Sensitive attributes never exfiltrated",
    notes: "Required by Art. 10 (data governance) and Art. 15 (accuracy & robustness).",
  },
  {
    capability: "Biometric identification / categorisation",
    aiActCategory: "Prohibited",
    oversight: "—",
    explainability: "—",
    logging: "—",
    dataGovernance: "—",
    notes: "Not implemented. Out of product scope by policy.",
  },
  {
    capability: "Emotion recognition / social scoring",
    aiActCategory: "Prohibited",
    oversight: "—",
    explainability: "—",
    logging: "—",
    dataGovernance: "—",
    notes: "Not implemented. Out of product scope by policy.",
  },
];

const catColor = (c: string) =>
  c === "Prohibited" ? "border-red-500/30 text-red-500"
    : c === "High" ? "border-orange-500/30 text-orange-500"
    : c === "Limited" ? "border-yellow-500/30 text-yellow-500"
    : c === "Minimal" ? "border-blue-500/30 text-blue-500"
    : "border-green-500/30 text-green-500";

const AISystemClassification = () => {
  useSeoHead({
    title: "AI System Classification — EU AI Act Risk Tiers | Quantivis",
    description: "How Quantivis classifies each platform capability under the EU AI Act: oversight, explainability, logging, and data governance per Article 9/13/14/50.",
    canonicalPath: "/ai-system-classification",
    ogType: "article",
  });
  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-12 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">EU AI Act — System Classification Matrix</h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
          Per-capability mapping of Quantivis against EU AI Act risk categories with the corresponding governance,
          oversight, explainability, logging, and data-governance controls.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="outline" className="border-green-500/30 text-green-500">Aggregate classification: Limited-Risk</Badge>
          <Badge variant="outline">No high-risk Annex III use cases</Badge>
          <Badge variant="outline">No prohibited practices</Badge>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <thead>
              <tr className="border-b border-border/30 text-left">
                <th className="py-2 px-2 font-semibold">Capability</th>
                <th className="py-2 px-2 font-semibold">AI Act</th>
                <th className="py-2 px-2 font-semibold">Human Oversight</th>
                <th className="py-2 px-2 font-semibold">Explainability</th>
                <th className="py-2 px-2 font-semibold">Logging</th>
                <th className="py-2 px-2 font-semibold">Data Governance</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.capability} className="border-b border-border/20 hover:bg-muted/20 align-top">
                  <td className="py-3 px-2">
                    <div className="font-medium">{c.capability}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{c.notes}</div>
                  </td>
                  <td className="py-3 px-2"><Badge variant="outline" className={`text-[10px] ${catColor(c.aiActCategory)}`}>{c.aiActCategory}</Badge></td>
                  <td className="py-3 px-2 text-muted-foreground">{c.oversight}</td>
                  <td className="py-3 px-2 text-muted-foreground">{c.explainability}</td>
                  <td className="py-3 px-2 text-muted-foreground">{c.logging}</td>
                  <td className="py-3 px-2 text-muted-foreground">{c.dataGovernance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <section className="text-sm text-muted-foreground space-y-2">
        <h2 className="text-base font-semibold text-foreground">References</h2>
        <p>Regulation (EU) 2024/1689 (AI Act) · GDPR Art. 22 · Art. 5(1)(a) GDPR · ISO/IEC 42001 AI management.</p>
      </section>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border/30">
        Related: <Link to="/ai-governance" className="text-primary hover:underline">AI Governance</Link> ·{" "}
        <Link to="/how-ai-is-used" className="text-primary hover:underline">How AI Is Used</Link> ·{" "}
        <Link to="/fairness" className="text-primary hover:underline">Fairness Observability</Link>
      </p>
    </main>
  </div>
  );
};

export default AISystemClassification;
