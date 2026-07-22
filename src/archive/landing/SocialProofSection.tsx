import { forwardRef } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Clock, DollarSign, ShieldCheck, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const ROI_METRICS = [
  { icon: TrendingDown, value: "7–12pp", label: "Calibration improvement", detail: "Typical overconfidence reduction via adaptive scoring" },
  { icon: Clock, value: "90 days", label: "Time to calibrated decisions", detail: "From Decision Ledger to Calibration Active" },
  { icon: DollarSign, value: "From €99/mo", label: "vs. €50K+ consulting projects", detail: "If this prevents a 5% revenue leak, the system pays for itself in one decision" },
  { icon: ShieldCheck, value: "100%", label: "Logged decision traceability", detail: "Every recorded decision is fully auditable" },
];

const CASE_STUDIES = [
  {
    industry: "SaaS",
    company: "Series B · 120 employees",
    challenge: "Leadership team was consistently overestimating product-market expansion probabilities by ~11pp, leading to over-investment in low-ROI initiatives.",
    result: "Adaptive calibration flagged the systematic bias within 8 weeks. Re-calibrated capital allocation saved an estimated €340K in avoidable downside exposure.",
    metrics: ["11pp bias corrected", "€340K downside avoided", "4 C-suite roles aligned"],
  },
  {
    industry: "Manufacturing",
    company: "Mid-market · 800 employees",
    challenge: "No unified view of strategic risk across ERP, CRM, and BI tools. CFO could not defend capital decisions to the board with traceable evidence.",
    result: "Single intelligence layer with corrected confidence scores. Strategic Risk Index flagged supply chain disruption 6 weeks before impact — with full audit trail.",
    metrics: ["6-week early warning", "Board-defensible output", "Convergence Index: 87"],
  },
  {
    industry: "Financial Services",
    company: "Enterprise · 2,400 employees",
    challenge: "Compliance reporting consumed 30% of analyst capacity. Strategic recommendations had no provenance trail for regulators.",
    result: "Fully traceable advisory engine with self-correcting confidence scoring. Every recommendation linked to evidence, sample size, and historical accuracy.",
    metrics: ["30% capacity freed", "100% traceability", "Regulator-ready"],
  },
];

const SocialProofSection = forwardRef<HTMLDivElement>((_, ref) => {
  return (
    <div ref={ref}>
      <section className="py-24 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">Measurable Impact</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
              The ROI of <span className="gradient-text">Better Decisions</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Quantivis doesn't just show you data — it measures how accurate your strategic calls are and makes them better over time.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ROI_METRICS.map((metric, i) => (
              <motion.div
                key={metric.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-7 text-center"
              >
                <metric.icon className="w-7 h-7 text-primary mx-auto mb-4" />
                <p className="text-3xl font-bold tracking-tight gradient-text mb-1">{metric.value}</p>
                <p className="text-sm font-semibold mb-1">{metric.label}</p>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="decision-impact" className="py-24 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">Representative Scenarios</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
              How Leaders <span className="gradient-text">Protect Their Decisions</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Composite scenarios showing how self-correcting intelligence transforms strategic operations and reduces costly overconfidence.
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-2 max-w-md mx-auto">
              These are representative scenarios based on platform modeling — not claims from specific client engagements.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-5">
            {CASE_STUDIES.map((study, i) => (
              <motion.div
                key={study.industry}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12 }}
                className="glass-card-hover p-7 flex flex-col"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">{study.industry}</span>
                  <span className="text-xs text-muted-foreground">{study.company}</span>
                </div>

                <div className="mb-4">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1.5">The Risk</p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{study.challenge}</p>
                </div>

                <div className="mb-5">
                  <p className="text-[11px] uppercase tracking-widest text-primary/80 font-semibold mb-1.5">The Protection</p>
                  <p className="text-sm text-foreground/90 leading-relaxed">{study.result}</p>
                </div>

                <div className="mt-auto pt-4 border-t border-border/40 flex flex-wrap gap-2">
                  {study.metrics.map((m) => (
                    <span key={m} className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-primary/5 text-primary/90">{m}</span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-10"
          >
            <Link
              to="/register"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
            >
              Start protecting your strategic calls <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
});

SocialProofSection.displayName = "SocialProofSection";

export default SocialProofSection;
