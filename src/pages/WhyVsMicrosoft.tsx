import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, X, ArrowRight, Shield, Brain, GitCommitVertical, BarChart3, Users, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import logo from "@/assets/quantivis-logo.png";

const sections = [
  {
    icon: Brain,
    title: "Microsoft tells you what happened. Quantivis tells you if your response was right.",
    description:
      "Power BI, Excel, and Copilot are world-class at surfacing data. But no Microsoft product tracks whether the decisions you made based on that data actually worked — or builds an institutional memory to improve future judgment.",
  },
  {
    icon: GitCommitVertical,
    title: "The Decision → Outcome → Learning loop Microsoft doesn't have",
    description:
      "Quantivis creates an auditable ledger of every strategic call your leadership team makes, tracks outcomes against predictions, and calibrates your team's confidence accuracy over time. This is decision governance — a category Microsoft doesn't compete in.",
  },
  {
    icon: Shield,
    title: "Board defensibility, not just dashboards",
    description:
      'When a board asks "why did you make that call?", a Power BI chart isn\'t an answer. Quantivis provides a traceable decision trail with confidence scores, bias detection, evidence contracts, and outcome verification — the governance layer that makes every call board-defensible.',
  },
];

const comparisonRows = [
  { capability: "KPI dashboards & visualization", microsoft: true, quantivis: true },
  { capability: "AI-powered data summarization", microsoft: true, quantivis: true },
  { capability: "Decision ledger with audit trail", microsoft: false, quantivis: true },
  { capability: "Outcome tracking & prediction accuracy", microsoft: false, quantivis: true },
  { capability: "Cognitive bias detection", microsoft: false, quantivis: true },
  { capability: "Calibration scoring (Brier scores)", microsoft: false, quantivis: true },
  { capability: "Counterfactual analysis", microsoft: false, quantivis: true },
  { capability: "Board-ready decision reports", microsoft: false, quantivis: true },
  { capability: "Executive overconfidence correction", microsoft: false, quantivis: true },
  { capability: "Monte Carlo simulations", microsoft: "Excel add-in", quantivis: true },
  { capability: "Institutional decision memory", microsoft: false, quantivis: true },
  { capability: "Works with your Microsoft stack", microsoft: "N/A", quantivis: true },
];

const renderCell = (value: boolean | string) => {
  if (value === true) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === false) return <X className="w-4 h-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-[11px] text-muted-foreground">{value}</span>;
};

const WhyVsMicrosoft = () => (
  <div className="min-h-dvh bg-background flex flex-col">
    {/* Header */}
    <header className="border-b border-border/30 bg-background/80 backdrop-blur-sm sticky top-0 z-30">
      <div className="container mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/"><img src={logo} alt="Quantivis Global" className="h-8" /></Link>
        <Link to="/register">
          <Button size="sm" className="text-xs">Start Free</Button>
        </Link>
      </div>
    </header>

    <main className="flex-1 container mx-auto px-6 py-16 max-w-4xl">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
        <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-4">Quantivis vs. Microsoft</p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 leading-tight">
          You already have the data.<br />
          <span className="gradient-text">Who's governing the decisions?</span>
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Microsoft gives your team Power BI, Excel, Copilot, and Azure ML — best-in-class tools for seeing what's happening.
          Quantivis is the governance layer that tracks whether your leadership team's <em>response</em> to that data was the right call.
        </p>
      </motion.div>

      {/* Value Props */}
      <div className="space-y-6 mb-16">
        {sections.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * (i + 1) }}
            className="glass-card p-6 flex items-start gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <s.icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground mb-1.5">{s.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Comparison Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <h2 className="text-[16px] font-semibold tracking-tight tracking-tight text-center mb-6">
          Feature-by-Feature Comparison
        </h2>
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-5 text-muted-foreground font-medium">Capability</th>
                <th className="text-center py-4 px-4 font-semibold">
                  <div>Microsoft 365</div>
                  <div className="text-[10px] font-normal text-muted-foreground">BI + Productivity</div>
                </th>
                <th className="text-center py-4 px-4 font-semibold text-primary">
                  <div>Quantivis</div>
                  <div className="text-[10px] font-normal text-primary/70">Decision Governance</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.capability} className="border-b border-border/20 hover:bg-card/50 transition-colors">
                  <td className="py-3 px-5 text-xs font-medium">{row.capability}</td>
                  <td className="text-center py-3 px-4">{renderCell(row.microsoft)}</td>
                  <td className="text-center py-3 px-4 bg-primary/[0.02]">{renderCell(row.quantivis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* The Non-Competitive Angle */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-12 glass-card p-6 border-primary/20 bg-primary/5"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground mb-1.5">
              Not a replacement — the governance layer on top
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quantivis connects to your existing Microsoft stack via database connectors. Your data stays in Power BI and Azure —
              Quantivis adds the decision tracking, outcome measurement, and calibration correction that turns analytics into accountable governance.
              Think of it as the <strong>audit layer</strong> your CFO wishes Microsoft had built.
            </p>
          </div>
        </div>
      </motion.div>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="text-center mt-16"
      >
        <h3 className="text-lg font-bold tracking-tight mb-3">
          Ready to govern your decisions, not just visualize your data?
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Upload a dataset in 5 minutes. See your first calibrated insight in under 60 seconds.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/register">
            <Button className="gap-2">
              Start Free Trial <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link to="/demo">
            <Button variant="outline">See Live Demo</Button>
          </Link>
        </div>
      </motion.div>
    </main>
  </div>
);

export default WhyVsMicrosoft;
