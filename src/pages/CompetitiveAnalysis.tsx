import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight, Trophy, Shield, Zap, GitBranch, Target } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

interface MatrixRow {
  capability: string;
  category: "decision" | "data" | "governance" | "scale" | "experience";
  quantivis: boolean | string;
  palantir: boolean | string;
  anaplan: boolean | string;
  aera: boolean | string;
  snowfire: boolean | string;
  tableau: boolean | string;
}

const MATRIX: MatrixRow[] = [
  // Decision Intelligence
  { capability: "Decision ledger w/ outcome tracking", category: "decision", quantivis: true, palantir: "Partial", anaplan: false, aera: true, snowfire: false, tableau: false },
  { capability: "Bayesian confidence calibration", category: "decision", quantivis: true, palantir: false, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Cognitive bias detection", category: "decision", quantivis: true, palantir: false, anaplan: false, aera: false, snowfire: false, tableau: false },
  { capability: "Counterfactual / causal inference", category: "decision", quantivis: true, palantir: true, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Multi-armed bandit optimization", category: "decision", quantivis: true, palantir: false, anaplan: false, aera: true, snowfire: "Partial", tableau: false },
  { capability: "Decision replay & simulation", category: "decision", quantivis: true, palantir: "Partial", anaplan: true, aera: true, snowfire: false, tableau: false },

  // Data & Blending
  { capability: "Client + internal + external blending w/ provenance", category: "data", quantivis: true, palantir: true, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Strict real-data-only policy (no fabrication)", category: "data", quantivis: true, palantir: "Partial", anaplan: "Partial", aera: false, snowfire: "Partial", tableau: true },
  { capability: "Industry benchmark hub (org-scoped)", category: "data", quantivis: true, palantir: "Custom build", anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Macro signal auto-ingestion (IMF/World Bank)", category: "data", quantivis: true, palantir: false, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Data lineage + freshness policy", category: "data", quantivis: true, palantir: true, anaplan: "Partial", aera: true, snowfire: false, tableau: "Partial" },

  // Governance & Trust
  { capability: "Fairness & model observability", category: "governance", quantivis: true, palantir: true, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Forensic audit trail (every decision)", category: "governance", quantivis: true, palantir: true, anaplan: "Partial", aera: "Partial", snowfire: false, tableau: false },
  { capability: "Evidence Contract on AI outputs", category: "governance", quantivis: true, palantir: false, anaplan: false, aera: false, snowfire: false, tableau: false },
  { capability: "RBAC + SAML/OIDC SSO", category: "governance", quantivis: true, palantir: true, anaplan: true, aera: true, snowfire: "Partial", tableau: true },
  { capability: "DSGVO/GDPR-ready w/ EU residency", category: "governance", quantivis: true, palantir: true, anaplan: true, aera: true, snowfire: "Partial", tableau: true },
  { capability: "SOC 2 / ISO 27001 posture", category: "governance", quantivis: "In progress", palantir: true, anaplan: true, aera: true, snowfire: true, tableau: true },

  // Scale & Cost
  { capability: "Time to first insight", category: "scale", quantivis: "Minutes", palantir: "Months", anaplan: "Weeks", aera: "Months", snowfire: "Days", tableau: "Days" },
  { capability: "Implementation cost", category: "scale", quantivis: "€0 setup", palantir: "$1M+", anaplan: "$200K+", aera: "$500K+", snowfire: "$25K+", tableau: "$50K+" },
  { capability: "Annual cost (mid-market)", category: "scale", quantivis: "€2,400+", palantir: "$500K+", anaplan: "$100K+", aera: "$250K+", snowfire: "$30K+", tableau: "$15K+" },
  { capability: "Self-serve onboarding", category: "scale", quantivis: true, palantir: false, anaplan: false, aera: false, snowfire: true, tableau: "Partial" },
  { capability: "Multi-tenant SaaS architecture", category: "scale", quantivis: true, palantir: "Hybrid", anaplan: true, aera: true, snowfire: true, tableau: true },

  // Executive Experience
  { capability: "Boardroom-ready briefs (auto)", category: "experience", quantivis: true, palantir: false, anaplan: false, aera: false, snowfire: false, tableau: false },
  { capability: "Executive AI Copilot (Ask)", category: "experience", quantivis: true, palantir: "Partial", anaplan: false, aera: "Partial", snowfire: true, tableau: "Partial" },
  { capability: "Closed-loop SUDAL framework", category: "experience", quantivis: true, palantir: false, anaplan: false, aera: "Partial", snowfire: false, tableau: false },
  { capability: "Auto-generated PPTX/PDF reports", category: "experience", quantivis: true, palantir: false, anaplan: false, aera: false, snowfire: "Partial", tableau: "Partial" },
];

const CATEGORY_META: Record<MatrixRow["category"], { label: string; icon: typeof Trophy; tone: string }> = {
  decision: { label: "Decision Intelligence", icon: Target, tone: "text-primary" },
  data: { label: "Data & Blending", icon: GitBranch, tone: "text-primary" },
  governance: { label: "Governance & Trust", icon: Shield, tone: "text-primary" },
  scale: { label: "Scale & Cost", icon: Zap, tone: "text-primary" },
  experience: { label: "Executive Experience", icon: Trophy, tone: "text-primary" },
};

const COMPETITORS = [
  { key: "quantivis", label: "Quantivis", positioning: "Decision Intelligence Platform" },
  { key: "palantir", label: "Palantir", positioning: "Foundry / AIP" },
  { key: "anaplan", label: "Anaplan", positioning: "Connected Planning" },
  { key: "aera", label: "Aera", positioning: "Decision Cloud" },
  { key: "snowfire", label: "Snowfire", positioning: "Revenue AI" },
  { key: "tableau", label: "Tableau", positioning: "BI / Dashboards" },
] as const;

const Cell = ({ value, primary }: { value: boolean | string; primary?: boolean }) => {
  if (typeof value === "string") {
    return <span className={`text-xs font-medium ${primary ? "text-primary" : "text-foreground"}`}>{value}</span>;
  }
  return value ? (
    <Check className={`w-4 h-4 ${primary ? "text-primary" : "text-foreground/70"}`} />
  ) : (
    <X className="w-4 h-4 text-muted-foreground/30" />
  );
};

const SCORES = COMPETITORS.map((c) => {
  const total = MATRIX.length;
  const score = MATRIX.reduce((acc, row) => {
    const v = row[c.key as keyof MatrixRow];
    if (v === true) return acc + 1;
    if (typeof v === "string" && v.toLowerCase().includes("partial")) return acc + 0.5;
    return acc;
  }, 0);
  return { key: c.key, label: c.label, positioning: c.positioning, score, total, pct: Math.round((score / total) * 100) };
});

const CompetitiveAnalysis = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref} className="min-h-dvh bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-20 pb-16">
        <div className="container mx-auto px-5 sm:px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto text-center mb-12 sm:mb-16"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
              <Trophy className="w-3.5 h-3.5" />
              Competitive Gap Analysis
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Where <span className="gradient-text">Quantivis</span> wins — and where the rest fall short
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              A capability-by-capability comparison across the modern decision-intelligence landscape.
              Scored against Palantir Foundry/AIP, Anaplan, Aera Decision Cloud, Snowfire, and Tableau.
            </p>
          </motion.div>

          {/* Scoreboard */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-12"
          >
            {SCORES.sort((a, b) => b.pct - a.pct).map((s, idx) => (
              <div
                key={s.key}
                className={`p-4 rounded-xl border ${s.key === "quantivis" ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card/40"}`}
              >
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{s.positioning}</div>
                <div className="font-bold text-base mb-2">{s.label}</div>
                <div className={`text-2xl font-bold ${s.key === "quantivis" ? "text-primary" : "text-foreground/80"}`}>
                  {s.pct}%
                </div>
                <div className="text-xs text-muted-foreground">{s.score.toFixed(1)} / {s.total} capabilities</div>
                {idx === 0 && <div className="mt-2 text-xs font-semibold text-primary flex items-center gap-1"><Trophy className="w-3 h-3" /> Leader</div>}
              </div>
            ))}
          </motion.div>

          {/* Matrix by category */}
          <div className="space-y-10">
            {(Object.keys(CATEGORY_META) as MatrixRow["category"][]).map((cat, ci) => {
              const Icon = CATEGORY_META[cat].icon;
              const rows = MATRIX.filter((r) => r.category === cat);
              return (
                <motion.section
                  key={cat}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + ci * 0.05 }}
                  className="border border-border/60 rounded-2xl overflow-hidden bg-card/40"
                >
                  <div className="p-5 border-b border-border/40 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className={`w-4.5 h-4.5 ${CATEGORY_META[cat].tone}`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">{CATEGORY_META[cat].label}</h2>
                      <p className="text-xs text-muted-foreground">{rows.length} capabilities</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[800px]">
                      <thead>
                        <tr className="border-b border-border/40 bg-muted/20">
                          <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Capability</th>
                          {COMPETITORS.map((c) => (
                            <th
                              key={c.key}
                              className={`text-center px-3 py-3 font-semibold text-xs uppercase tracking-wider w-[110px] ${c.key === "quantivis" ? "text-primary" : "text-muted-foreground"}`}
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={row.capability} className={i % 2 === 0 ? "bg-muted/10" : ""}>
                            <td className="px-4 py-2.5 text-foreground">{row.capability}</td>
                            {COMPETITORS.map((c) => (
                              <td key={c.key} className={`text-center px-3 py-2.5 ${c.key === "quantivis" ? "bg-primary/5" : ""}`}>
                                <div className="flex justify-center">
                                  <Cell value={row[c.key as keyof MatrixRow] as boolean | string} primary={c.key === "quantivis"} />
                                </div>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.section>
              );
            })}
          </div>

          {/* Strategic narrative */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {[
              {
                title: "Where Palantir wins",
                body: "Defense-grade ontology and bespoke Foundry deployments. Quantivis matches the rigor without the 9-month, $1M implementation.",
              },
              {
                title: "Where Anaplan wins",
                body: "Connected planning across finance and ops. Quantivis adds outcome tracking and bias detection — Anaplan's planning model has no learning loop.",
              },
              {
                title: "Where Aera wins",
                body: "Supply-chain decision automation in Fortune 500. Quantivis is the broader, lighter-weight alternative covering the full decision lifecycle.",
              },
            ].map((p) => (
              <div key={p.title} className="p-5 rounded-xl border border-border/40 bg-card/40">
                <h3 className="font-bold text-sm mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
              </div>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="max-w-xl mx-auto text-center mt-12 sm:mt-16"
          >
            <h3 className="text-xl sm:text-[18px] font-semibold tracking-tight mb-3">See the matrix in action</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Stand up a closed-loop decision OS in minutes — no IT lift, no consulting engagement.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
              >
                Start free <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/compare"
                className="inline-flex items-center gap-2 px-7 py-3 rounded-xl border border-border font-semibold hover:bg-muted/30 transition-all"
              >
                View 1:1 comparisons
              </Link>
            </div>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
});

CompetitiveAnalysis.displayName = "CompetitiveAnalysis";
export default CompetitiveAnalysis;
