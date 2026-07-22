import { forwardRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileQuestion, Brain, TrendingUp, AlertTriangle, Zap } from "lucide-react";

const BLIND_SPOTS = [
  { icon: FileQuestion, text: "Where forecasts were overconfident" },
  { icon: Brain, text: "Which signals actually predicted success" },
  { icon: TrendingUp, text: "Which types of decisions create the most value" },
];

const ANALYTICS_HIERARCHY = [
  { level: "Descriptive", question: '"What happened?"', tool: "Traditional BI", gap: true },
  { level: "Diagnostic", question: '"Why did it happen?"', tool: "Root Cause Analysis", gap: true },
  { level: "Predictive", question: '"What will happen?"', tool: "ML / Forecasting", gap: true },
  { level: "Prescriptive", question: '"What should we do?"', tool: "Decision Intelligence", gap: false },
];

const PainMirrorSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section ref={ref} className="py-20 sm:py-28 relative">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-12 sm:mb-16"
        >
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">The Analytics-Action Gap</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-5">
            An Estimated $3 Trillion+ Lost Annually to the{" "}
            <span className="gradient-text">Decision Quality Gap</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Organizations invest billions in data, yet only 24% describe themselves as data-driven
            <span className="text-muted-foreground/60 text-xs align-super ml-0.5">¹</span>. 
            The problem isn't data — it's the gap between knowing what happened and knowing what to do next.
          </p>
          <p className="text-[10px] text-muted-foreground/40 mt-3 max-w-lg mx-auto">
            ¹ NewVantage Partners / Wavestone, <em>Data and Analytics Leadership Annual Executive Survey</em>, 2024. 
            Decision quality gap estimate (~$3T) from McKinsey & Company research on strategic decision effectiveness, reported in USD.
          </p>
        </motion.div>

        {/* Analytics Hierarchy */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="max-w-2xl mx-auto mb-12"
        >
          <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-6">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 mb-4">
              The Analytics Hierarchy — Most companies stop at Level 1
            </p>
            <div className="space-y-2">
              {ANALYTICS_HIERARCHY.map((item, i) => (
                <div key={item.level} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    !item.gap 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </div>
                  <div className="flex-1 flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div>
                      <span className={`text-sm font-semibold ${!item.gap ? "text-primary" : ""}`}>{item.level}</span>
                      <span className="text-xs text-muted-foreground ml-2">{item.question}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground hidden sm:block">{item.tool}</span>
                  </div>
                  {item.gap && (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning/60 shrink-0" />
                  )}
                  {!item.gap && (
                    <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
              <p className="text-xs text-primary font-medium">
                Quantivis operates at all 4 levels — from data ingestion to prescriptive action.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Current workflow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="max-w-3xl mx-auto mb-12"
        >
          <div className="grid md:grid-cols-2 gap-4">
            {/* Without */}
            <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-6">
              <p className="text-[10px] uppercase tracking-widest text-destructive/60 font-bold mb-4">Without a Decision OS</p>
              <div className="space-y-2.5">
                {[
                  "Decisions made from opinion, not evidence",
                  "No record of prediction accuracy",
                  "Same mistakes repeated across cycles",
                  "No institutional learning from outcomes",
                  "Board prep takes days of manual work",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-destructive/60 text-xs mt-0.5">✗</span>
                    <span className="text-sm text-foreground/70">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* With */}
            <div className="rounded-xl border border-success/20 bg-success/[0.03] p-6">
              <p className="text-[10px] uppercase tracking-widest text-success/60 font-bold mb-4">With Quantivis</p>
              <div className="space-y-2.5">
                {[
                  "Every decision logged with confidence + context",
                  "Predicted vs actual compared automatically",
                  "Calibration corrects systematic overconfidence",
                  "System improves with every measured outcome",
                  "Board reports generated in one click",
                ].map(item => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-success/60 text-xs mt-0.5">✓</span>
                    <span className="text-sm text-foreground/70">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center text-sm sm:text-base text-muted-foreground max-w-xl mx-auto"
        >
          Quantivis creates a <span className="text-foreground font-medium">decision ledger</span> for your organization — 
          the anti-entropy mechanism that makes every strategic call measurable, reviewable, and improvable.
        </motion.p>
      </div>
    </section>
  );
});

PainMirrorSection.displayName = "PainMirrorSection";

export default PainMirrorSection;
