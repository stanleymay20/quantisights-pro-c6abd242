import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Check, X, ArrowRight } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { useSeoHead } from "@/lib/useSeoHead";

interface CompetitorRow {
  feature: string;
  quantivis: boolean | string;
  competitor: boolean | string;
}

interface CompetitorPage {
  name: string;
  tagline: string;
  description: string;
  rows: CompetitorRow[];
}

const COMPETITORS: CompetitorPage[] = [
  {
    name: "Spreadsheets & BI Tools",
    tagline: "From static dashboards to a self-correcting decision system",
    description: "Tableau, Power BI, and Looker show you what happened. Quantivis tells you what to do about it — and whether it worked.",
    rows: [
      { feature: "Tracks decision outcomes", quantivis: true, competitor: false },
      { feature: "Bayesian confidence calibration", quantivis: true, competitor: false },
      { feature: "Cognitive bias detection", quantivis: true, competitor: false },
      { feature: "Board-ready reports", quantivis: true, competitor: "Manual" },
      { feature: "Data visualization", quantivis: true, competitor: true },
      { feature: "Self-correcting forecasts", quantivis: true, competitor: false },
      { feature: "Decision audit trail", quantivis: true, competitor: false },
      { feature: "Setup time", quantivis: "5 minutes", competitor: "Weeks" },
    ],
  },
  {
    name: "Strategy Consultants",
    tagline: "Always-on intelligence vs. one-time engagements",
    description: "McKinsey, BCG, and Bain deliver a report and leave. Quantivis stays, learns, and improves continuously.",
    rows: [
      { feature: "Continuous monitoring", quantivis: true, competitor: false },
      { feature: "Outcome tracking", quantivis: true, competitor: false },
      { feature: "Real-time alerts", quantivis: true, competitor: false },
      { feature: "Strategic frameworks", quantivis: true, competitor: true },
      { feature: "Human expertise", quantivis: "AI + Human", competitor: true },
      { feature: "Cost per year", quantivis: "€2,400", competitor: "€200K+" },
      { feature: "Time to first insight", quantivis: "Minutes", competitor: "Weeks" },
      { feature: "Scales with org", quantivis: true, competitor: false },
    ],
  },
  {
    name: "Snowfire.ai",
    tagline: "Revenue intelligence vs. decision intelligence",
    description: "Snowfire focuses on revenue optimization. Quantivis covers the full decision lifecycle — from signal to measured outcome.",
    rows: [
      { feature: "Decision ledger & history", quantivis: true, competitor: false },
      { feature: "Bayesian calibration", quantivis: true, competitor: false },
      { feature: "Counterfactual analysis", quantivis: true, competitor: false },
      { feature: "Multi-armed bandits", quantivis: true, competitor: false },
      { feature: "Fairness & bias monitoring", quantivis: true, competitor: false },
      { feature: "Revenue analytics", quantivis: true, competitor: true },
      { feature: "700+ connectors", quantivis: "Growing", competitor: true },
      { feature: "Closed-loop learning", quantivis: true, competitor: false },
    ],
  },
];

const CellValue = ({ value }: { value: boolean | string }) => {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  return value ? (
    <Check className="w-5 h-5 text-primary" />
  ) : (
    <X className="w-5 h-5 text-muted-foreground/40" />
  );
};

const Compare = forwardRef<HTMLDivElement>((_, ref) => {
  useSeoHead({
    title: "Compare Quantivis vs BI, Consultants & DI Platforms",
    description: "Honest, side-by-side comparison of Quantivis against Tableau, Power BI, strategy consultants, and other Decision Intelligence platforms — outcome tracking, calibration, audit trail.",
    canonicalPath: "/compare",
  });
  return (
    <div ref={ref} className="min-h-dvh bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 pt-20 pb-16">
        <div className="container mx-auto px-5 sm:px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto text-center mb-12 sm:mb-16"
          >
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
              Why Teams Switch to{" "}
              <span className="gradient-text">Quantivis</span>
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              See how we compare to the tools you're already using.
            </p>
          </motion.div>

          {/* Competitor sections */}
          <div className="space-y-12 sm:space-y-16 max-w-3xl mx-auto">
            {COMPETITORS.map((comp, idx) => (
              <motion.section
                key={comp.name}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="border border-border/60 rounded-2xl overflow-hidden bg-card/40"
              >
                <div className="p-5 sm:p-8 border-b border-border/40">
                  <h2 className="text-xl sm:text-[18px] font-semibold tracking-tight mb-2">
                    Quantivis vs. {comp.name}
                  </h2>
                  <p className="text-sm text-primary font-semibold mb-1">{comp.tagline}</p>
                  <p className="text-sm text-muted-foreground">{comp.description}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                          Feature
                        </th>
                        <th className="text-center text-xs font-semibold text-primary uppercase tracking-wider px-4 py-3 w-28">
                          Quantivis
                        </th>
                        <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 w-28">
                          {comp.name.split(" ")[0]}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp.rows.map((row, i) => (
                        <tr
                          key={row.feature}
                          className={i % 2 === 0 ? "bg-muted/20" : ""}
                        >
                          <td className="text-sm text-foreground px-5 py-3">{row.feature}</td>
                          <td className="text-center px-4 py-3">
                            <div className="flex justify-center">
                              <CellValue value={row.quantivis} />
                            </div>
                          </td>
                          <td className="text-center px-4 py-3">
                            <div className="flex justify-center">
                              <CellValue value={row.competitor} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.section>
            ))}
          </div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-lg mx-auto text-center mt-12 sm:mt-16"
          >
            <h3 className="text-xl sm:text-[18px] font-semibold tracking-tight mb-4">Ready to upgrade your decision stack?</h3>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/20"
            >
              Start Free <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
});

Compare.displayName = "Compare";

export default Compare;
