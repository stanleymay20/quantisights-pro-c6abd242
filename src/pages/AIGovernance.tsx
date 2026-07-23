import { Brain, Scale, Eye, AlertTriangle, FileCheck, Users, GitBranch, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CONTACT } from "@/lib/contact-config";

const principles = [
  {
    icon: Brain,
    title: "Deterministic Core, Narrative AI",
    badge: "Architecture",
    points: [
      "All scoring, classification, and statistical inference is computed by deterministic pure functions (Holt's exponential smoothing, ARIMA, K-Means, Isolation Forest, Welch's t-test).",
      "LLMs are used only for natural-language explanation, summarization, and translation — never for the underlying numbers.",
      "This separation ensures reproducibility, auditability, and freedom from stochastic model drift on core decisions.",
    ],
  },
  {
    icon: Scale,
    title: "EU AI Act Risk Classification",
    badge: "Risk: Limited",
    points: [
      "Quantivis is classified internally as a Limited-Risk AI system under the EU AI Act (Regulation (EU) 2024/1689).",
      "It is a decision-support system; it does not make autonomous decisions affecting fundamental rights, employment, credit, or essential services without human approval.",
      "All advisories require explicit human approval in the Decision Ledger before execution; no recommendation is auto-actioned in privileged domains.",
      "Transparency obligations under Art. 50 are met via persistent disclosure of AI-generated content.",
    ],
  },
  {
    icon: Eye,
    title: "Transparency & Explainability",
    badge: "Open Box",
    points: [
      "Every recommendation carries a 7-layer explainability structure (evidence → statistics → heuristics → precedents → confidence → caveats → caller).",
      "Confidence scores are capped by sample size to prevent overconfidence: <12 points → max 60%, <30 → max 75%, 30+ → max 90%.",
      "Bayesian calibration runs every 12h, comparing predicted confidence vs. observed outcomes; calibration corrections are versioned and visible to users.",
      "Persistent IntelligenceDisclaimer on all advisory, simulation, executive, and report surfaces.",
    ],
  },
  {
    icon: AlertTriangle,
    title: "Bias, Fairness & Human Oversight",
    badge: "Art. 14",
    points: [
      "Disparate-impact ratio computed on segment-level outcomes; drift snapshots persisted for audit.",
      "Fairness Observability dashboard surfaces dimension-level disparities to data stewards.",
      "Every decision in the Ledger has a named human approver — no AI-only execution path exists for material decisions.",
      "Step-Up authentication required for privileged overrides; full audit trail of executive overrides.",
    ],
  },
  {
    icon: GitBranch,
    title: "Data Lineage & Provenance",
    badge: "Traceable",
    points: [
      "Every metric is traceable from raw ingestion → transformation → aggregation → insight via the Lineage Explorer.",
      "Each insight carries an evidence_sources JSONB array citing exact source rows, vendor, and timestamp.",
      "Three-layer provenance (Client Truth / Market Intelligence / Synthesis) is surfaced in DualLayerEvidencePanel.",
      "Information Quality framework scores every source on 7 dimensions (accuracy, completeness, consistency, timeliness, relevance, accessibility, believability).",
    ],
  },
  {
    icon: FileCheck,
    title: "Model Governance",
    badge: "Versioned",
    points: [
      "Every model output is tagged with model_version; calibration corrections are append-only.",
      "Decision Rules Engine uses Fact-Rule-Action JSON with shadow deployment before promotion.",
      "Concept association mining (TF-IDF over decisions/advisories) runs as a transparent pipeline, not a black-box embedding.",
      "Institutional memory uses TF-IDF (FNV-1a) fallback when embeddings are unavailable — no silent degradation.",
    ],
  },
  {
    icon: Users,
    title: "Human-in-the-Loop by Default",
    badge: "Art. 14",
    points: [
      "No advisory is auto-executed. Every recommendation enters the Decision Ledger as 'pending' and requires named approval.",
      "DecisionResponsibilityDialog confirms human accountability on each privileged action.",
      "Outcome feedback loop (effectiveness 0-100) closes the SUDAL learning cycle with human-verified results.",
      "Boundary conflict demotion: when an advisory contradicts the organization's mission/identity, the advisory is automatically demoted pending human review.",
    ],
  },
  {
    icon: Shield,
    title: "Liability & Disclaimers",
    badge: "Legal",
    points: [
      "Quantivis is a decision-support platform. All outputs are probabilistic estimates and do not constitute financial, legal, medical, or professional advice.",
      "Executive judgment remains authoritative; the platform supports decisions, it does not replace decision-makers.",
      "Persistent disclaimer banners on advisory, simulation, executive, and report surfaces (non-dismissible on strategic contexts).",
      "Confidence Honesty layer: every score links to a tooltip explaining what drives and limits it.",
    ],
  },
];

const AIGovernance = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Brain className="w-7 h-7 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">AI Governance</h1>
          </div>
          <p className="text-muted-foreground leading-relaxed max-w-3xl">
            How Quantivis aligns with the EU AI Act, GDPR Art. 22 (automated decision-making),
            and emerging European norms for trustworthy AI. This page is intended for procurement,
            compliance, and DPO review.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            <Badge variant="outline">EU AI Act</Badge>
            <Badge variant="outline">GDPR Art. 22</Badge>
            <Badge variant="outline">Limited-Risk</Badge>
            <Badge variant="outline">Human Oversight</Badge>
            <Badge variant="outline">Version 2026.1</Badge>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          {principles.map((p) => (
            <Card key={p.title} className="border-border/50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <p.icon className="w-5 h-5 text-primary" />
                    <CardTitle className="text-base">{p.title}</CardTitle>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{p.badge}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2">
                  {p.points.map((pt, i) => (
                    <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-relaxed">
                      <span className="text-primary/50 mt-1 shrink-0">•</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <h2 className="font-semibold mb-2">Compliance Contact</h2>
            <p className="text-sm text-muted-foreground mb-3">
              For AI Act conformity questionnaires, model cards, or human-oversight protocols,
              contact our compliance team.
            </p>
            <div className="text-sm space-y-1">
              <div>Compliance: <a href={`mailto:${CONTACT.email.legal}`} className="text-primary hover:underline">{CONTACT.email.legal}</a></div>
              <div>DPO: <a href={`mailto:${CONTACT.email.dpo}`} className="text-primary hover:underline">{CONTACT.email.dpo}</a></div>
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
          Last reviewed: May 2026. This document will be updated as the EU AI Act implementing
          acts and harmonized standards are published. Quantivis tracks the AI Act timeline and
          will provide customers with at least 60 days' notice of any material conformity change.
        </p>
      </div>
    </div>
  );
};

export default AIGovernance;
