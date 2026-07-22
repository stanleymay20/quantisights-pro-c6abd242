import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Target, Brain, Shield, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const USE_CASES = [
  {
    role: "CFO",
    scenario: "Annual budget reforecast",
    challenge: "Leadership team consistently overestimated revenue growth by 8–12pp, leading to misallocated capital across 3 business units.",
    howQuantivis: "The calibration engine tracks forecast accuracy over time and adjusts confidence scores. After 90 days, the CFO sees exactly where overconfidence occurs — and by how much.",
    icon: Target,
  },
  {
    role: "CEO",
    scenario: "Market expansion decision",
    challenge: "Board asked for defensible evidence behind a €2M market entry. The strategy team had spreadsheets and opinions — no traceable decision trail.",
    howQuantivis: "Decision Ledger logs the call with confidence scores, Monte Carlo simulations, and causal inference. The board receives a governance-grade audit trail.",
    icon: Brain,
  },
  {
    role: "PE Portfolio Manager",
    scenario: "Cross-portfolio risk assessment",
    challenge: "Managing 12 portfolio companies with no unified view of strategic decision quality or systematic overconfidence patterns.",
    howQuantivis: "Portfolio-wide decision governance layer tracks predictions vs. outcomes across all companies, surfacing which management teams are well-calibrated.",
    icon: Shield,
  },
];

const PLATFORM_FACTS = [
  { value: "20+", label: "Decision science frameworks" },
  { value: "90 days", label: "Time to calibrated decisions" },
  { value: "<5 min", label: "Time to first strategic insight" },
  { value: "100%", label: "Logged decision traceability" },
];

const TestimonialSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section ref={ref} id="case-studies" className="py-24 relative">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Platform in Action</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            How Leaders Use <span className="gradient-text">Quantivis</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Representative scenarios showing how decision governance transforms strategic operations.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-14"
        >
          {PLATFORM_FACTS.map((m) => (
            <div key={m.label} className="glass-card p-5 text-center">
              <p className="text-2xl lg:text-3xl font-bold tracking-tight gradient-text">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
            </div>
          ))}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-5 mb-16">
          {USE_CASES.map((uc, i) => (
            <motion.div
              key={uc.role + uc.scenario}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12 }}
              className="glass-card-hover p-7 flex flex-col"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <uc.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{uc.role}</p>
                  <p className="text-[11px] text-muted-foreground">{uc.scenario}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1.5">The Challenge</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{uc.challenge}</p>
              </div>

              <div className="mt-auto pt-4 border-t border-border/40">
                <p className="text-[11px] uppercase tracking-widest text-primary/80 font-semibold mb-1.5">How Quantivis Helps</p>
                <p className="text-sm text-foreground/90 leading-relaxed">{uc.howQuantivis}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:underline"
          >
            See the platform in action <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </div>
    </section>
  );
});

TestimonialSection.displayName = "TestimonialSection";

export default TestimonialSection;
