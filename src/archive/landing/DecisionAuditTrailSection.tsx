import { forwardRef } from "react";
import { motion } from "framer-motion";
import { User, BarChart3, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

const DecisionAuditTrailSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <section className="py-20 sm:py-28 relative bg-muted/30">
      <div className="container mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center mb-12 sm:mb-16"
        >
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-4">The credibility layer</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-5">
            Every Decision Becomes Board-Defensible
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            Instead of relying on memory, every strategic decision is recorded with signals, confidence, expected outcome, and actual result — creating an institutional audit trail.
          </p>
        </motion.div>

        {/* Sample decision record */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
          className="max-w-2xl mx-auto"
        >
          <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border bg-muted/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 mb-1">Decision Record</p>
                  <h3 className="text-base sm:text-[14px] font-semibold">Expand EU Distribution Network</h3>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="w-3.5 h-3.5" />
                  <span>CFO · March 2026</span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Confidence */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Confidence at decision:</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: "72%" }} />
                  </div>
                  <span className="text-sm font-semibold text-primary">72%</span>
                </div>
              </div>

              {/* Signals */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Signals used</p>
                <div className="space-y-1.5">
                  {[
                    { icon: TrendingUp, label: "Demand growth forecast", value: "+14%" },
                    { icon: BarChart3, label: "Supply chain stability index", value: "81" },
                    { icon: TrendingUp, label: "Customer acquisition trend", value: "+9%" },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-sm">
                      <s.icon className="w-3.5 h-3.5 text-primary/60" />
                      <span className="text-foreground/70">{s.label}</span>
                      <span className="ml-auto font-medium text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expected vs actual */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 mb-1">Expected impact</p>
                  <p className="text-lg font-bold text-foreground">$38M</p>
                  <p className="text-xs text-muted-foreground">Revenue increase in 18 months</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 mb-1">Actual outcome</p>
                  <p className="text-lg font-bold text-foreground">$24M</p>
                  <p className="text-xs text-muted-foreground">Recorded 18 months later</p>
                </div>
              </div>

              {/* Calibration result */}
              <div className="flex items-start gap-3 p-3 rounded-lg border border-warning/20 bg-warning/5">
                <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Calibration result</p>
                  <p className="text-xs text-muted-foreground">
                    Forecast overestimated by <span className="font-semibold text-warning">14pp</span>. Future forecasts adjusted automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-muted-foreground">Full audit trail preserved · Explainable confidence · Board-ready</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
});

DecisionAuditTrailSection.displayName = "DecisionAuditTrailSection";

export default DecisionAuditTrailSection;
