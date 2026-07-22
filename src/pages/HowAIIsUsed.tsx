import { Link } from "react-router-dom";
import logo from "@/assets/quantivis-logo.png";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useSeoHead } from "@/lib/useSeoHead";

type Layer = {
  key: string;
  title: string;
  badge: string;
  badgeClass: string;
  autonomy: "None" | "Bounded" | "Human-approved" | "Autonomous (logged)";
  examples: string[];
  guarantees: string[];
};

const LAYERS: Layer[] = [
  {
    key: "deterministic",
    title: "Deterministic Systems",
    badge: "Deterministic",
    badgeClass: "border-green-500/30 text-green-500",
    autonomy: "None",
    examples: [
      "Holt's exponential smoothing for forecasts",
      "ARIMA for time-series modelling",
      "K-Means and Isolation Forest in ml-engine.ts",
      "Formula evaluation via custom recursive-descent parser (never eval)",
    ],
    guarantees: ["Same inputs → same outputs", "No LLM dependency", "Verifiable in tests"],
  },
  {
    key: "statistical",
    title: "Statistical Systems",
    badge: "Statistical",
    badgeClass: "border-blue-500/30 text-blue-500",
    autonomy: "None",
    examples: [
      "Welch's t-test for cohort comparisons",
      "Bayesian calibration every 12h",
      "Fairness drift via disparate_impact_ratio",
      "Anomaly detection with confidence intervals",
    ],
    guarantees: [
      "All claims anchored to p-values or sample sizes",
      "Confidence capped by sample size (<12 → 60%, <30 → 75%, 30+ → 90%)",
      "No synthetic trends for <8 data points",
    ],
  },
  {
    key: "ai-narrative",
    title: "AI Narrative Systems",
    badge: "AI (LLM)",
    badgeClass: "border-purple-500/30 text-purple-500",
    autonomy: "Bounded",
    examples: [
      "Natural-language summaries of statistical findings",
      "Ask Quantivis copilot (SSE-streamed)",
      "Executive briefs and board-report prose",
    ],
    guarantees: [
      "LLM never performs math or scoring",
      "PII redacted before inference (default on)",
      "Failover chain: Gemini → GPT → Claude",
      "Outputs labelled with confidence and evidence anchors",
    ],
  },
  {
    key: "human-controlled",
    title: "Human-Controlled Systems",
    badge: "Human Approval",
    badgeClass: "border-amber-500/30 text-amber-500",
    autonomy: "Human-approved",
    examples: [
      "Decision approval (named approver required at 'approved' state)",
      "Destructive overrides (Step-up auth dialog)",
      "Subprocessor changes (30-day notice)",
    ],
    guarantees: [
      "No autonomous state transition past 'pending'",
      "Approver_id NOT NULL constraint at 'approved'",
      "All overrides logged to audit_log",
    ],
  },
  {
    key: "autonomous",
    title: "Autonomous Systems",
    badge: "Autonomous · Logged",
    badgeClass: "border-cyan-500/30 text-cyan-500",
    autonomy: "Autonomous (logged)",
    examples: [
      "7 cron jobs: outcome eval, calibration, retention, briefs, convergence, health, alerts",
      "Auto-creation of pending decisions from AICIS recommendations",
      "Intervention writeback to intervention_learning",
    ],
    guarantees: [
      "Advisory-lock protected (pg_advisory_lock)",
      "Every run logged to cron_run_log with duration + status",
      "All autonomous outputs land in human-reviewable surfaces (Inbox, Ledger)",
      "No autonomous external action without an approval upstream",
    ],
  },
];

const HowAIIsUsed = () => {
  useSeoHead({
    title: "How AI Is Used — Layered Autonomy & Guarantees | Quantivis",
    description: "Quantivis uses deterministic, statistical, and human-approved AI layers — never autonomous decisioning. Full transparency on models, oversight, and verifiable guarantees.",
    canonicalPath: "/how-ai-is-used",
    ogType: "article",
  });
  return (
  <div className="min-h-dvh bg-background flex flex-col">
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
      </div>
    </header>
    <main className="flex-1 container mx-auto px-6 py-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">How AI Is Used</h1>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
          Quantivis is an operational intelligence platform, not an LLM wrapper. This page makes the autonomy boundary
          explicit so procurement and risk teams know exactly where AI is — and is not — in the loop.
        </p>
      </div>

      {/* Boundary diagram (ASCII-style flow) */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-6">
          <h2 className="text-base font-semibold mb-3">Operational AI Boundary</h2>
          <pre className="text-[10px] sm:text-xs leading-relaxed text-muted-foreground bg-background/40 p-3 rounded border border-border/40 overflow-x-auto">
{`  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │ Deterministic│ →  │ Statistical  │ →  │ AI Narrative │ →  │   Human      │ →  │  Autonomous  │
  │   (ml-eng)   │    │  (calibrate) │    │   (LLM gen)  │    │  (Approver)  │    │  (cron+log)  │
  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
        scores           significance         language          named owner         pg_advisory_lock
        no LLM           p-values             never math        audit_log row        cron_run_log
`}
          </pre>
          <p className="text-[11px] text-muted-foreground mt-2">
            Read left-to-right: numbers are computed deterministically, validated statistically, narrated by an LLM,
            approved by a human, then executed by audited autonomous jobs. The LLM never sits upstream of a number.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {LAYERS.map((l) => (
          <Card key={l.key} className="border-border/50">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <h3 className="font-semibold text-sm">{l.title}</h3>
                <Badge variant="outline" className={`text-[10px] ${l.badgeClass}`}>{l.badge}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mb-2">Autonomy: <strong className="text-foreground">{l.autonomy}</strong></div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 mb-1">Examples</div>
              <ul className="space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
                {l.examples.map((e) => <li key={e}>{e}</li>)}
              </ul>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-2 mb-1">Guarantees</div>
              <ul className="space-y-0.5 text-xs text-muted-foreground list-disc pl-4">
                {l.guarantees.map((g) => <li key={g}>{g}</li>)}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground pt-4 border-t border-border/30">
        Related: <Link to="/ai-governance" className="text-primary hover:underline">AI Governance</Link> ·{" "}
        <Link to="/ai-system-classification" className="text-primary hover:underline">EU AI Act Classification</Link> ·{" "}
        <Link to="/decision-accuracy" className="text-primary hover:underline">Decision Accuracy</Link>
      </p>
    </main>
  </div>
  );
};

export default HowAIIsUsed;
