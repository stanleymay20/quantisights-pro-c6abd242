import { forwardRef } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp } from "lucide-react";

const CALIBRATION_DATA = [
  { label: "Pricing decisions", forecast: "+12%", actual: "+4%", gap: "−8pp", direction: "over" },
  { label: "Expansion projects", forecast: "+18%", actual: "+7%", gap: "−11pp", direction: "over" },
  { label: "Product launches", forecast: "+15%", actual: "+6%", gap: "−9pp", direction: "over" },
  { label: "Retention initiatives", forecast: "+5%", actual: "+11%", gap: "+6pp", direction: "under" },
];

const INSIGHTS = [
  "Pricing decisions are consistently overestimated by 8pp.",
  "Expansion project forecasts are too optimistic by 11pp.",
  "Retention initiatives outperform projections by 6pp.",
];

const CalibrationProofSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section className="py-20 sm:py-28 relative">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-12 sm:mb-16"
        >
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">The calibration engine</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-5">
            Most Leadership Teams Overestimate Strategic Outcomes
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Across industries, leadership teams systematically overestimate the impact of strategic decisions.
            Quantivis measures this bias and continuously calibrates confidence levels.
          </p>
        </motion.div>

        {/* Calibration table */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="max-w-2xl mx-auto mb-12"
        >
          <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-4 gap-2 px-5 py-3 border-b border-border bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground/50">
              <span>Decision type</span>
              <span className="text-center">Forecasted</span>
              <span className="text-center">Actual</span>
              <span className="text-right">Gap</span>
            </div>

            {/* Rows */}
            {CALIBRATION_DATA.map((row, i) => (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.07 }}
                className="grid grid-cols-4 gap-2 px-5 py-3.5 border-b border-border/50 last:border-b-0 items-center"
              >
                <span className="text-sm font-medium text-foreground">{row.label}</span>
                <span className="text-sm text-center text-muted-foreground">{row.forecast}</span>
                <span className="text-sm text-center text-muted-foreground">{row.actual}</span>
                <div className="flex items-center justify-end gap-1.5">
                  {row.direction === "over" ? (
                    <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-success" />
                  )}
                  <span className={`text-sm font-semibold ${row.direction === "over" ? "text-destructive" : "text-success"}`}>
                    {row.gap}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Pattern insights */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.35 }}
          className="max-w-xl mx-auto"
        >
          <p className="text-xs text-muted-foreground/60 text-center mb-3">Over time, organizations see patterns like:</p>
          <div className="space-y-2">
            {INSIGHTS.map((insight) => (
              <div key={insight} className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg border border-primary/10 bg-primary/[0.03]">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <span className="text-sm text-foreground/80 italic">"{insight}"</span>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground mt-6">
            The result: a leadership team that makes <span className="text-foreground font-medium">increasingly accurate strategic calls</span>.
          </p>
        </motion.div>
      </div>
    </section>
  );
});

CalibrationProofSection.displayName = "CalibrationProofSection";

export default CalibrationProofSection;
