import { forwardRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Monitor, Smartphone, ArrowRight, Play, Shield, Brain, TrendingUp, Zap, BarChart3, Network } from "lucide-react";
import { Link } from "react-router-dom";
import { CONTACT } from "@/lib/contact-config";

const PREVIEW_FEATURES = [
  {
    icon: Shield,
    title: "Executive Risk Index",
    desc: "Real-time composite risk scoring across CEO, CFO, CMO, COO perspectives",
    metric: "Score: 72/100",
    status: "tension",
  },
  {
    icon: Brain,
    title: "Decision Memory",
    desc: "Every strategic call is recorded with confidence, outcome, and calibration correction — the system learns",
    metric: "12 decisions tracked",
    status: "active",
  },
  {
    icon: Network,
    title: "Causal Inference DAG",
    desc: "True causation mapping — not just correlation — for your KPI movements",
    metric: "6 causal links found",
    status: "active",
  },
  {
    icon: TrendingUp,
    title: "Calibration Engine",
    desc: "Bayesian model compares past predictions to actual outcomes and auto-corrects future confidence scores",
    metric: "Accuracy: +8pp",
    status: "positive",
  },
];

const MOCK_KPIS = [
  { label: "ARR", value: "€4.2M", change: "+12.3%", positive: true },
  { label: "Customers", value: "420", change: "+8.1%", positive: true },
  { label: "Conversion", value: "2.8%", change: "-1.2%", positive: false },
  { label: "Churn", value: "4.1%", change: "+0.6%", positive: false },
];

const ProductPreview = forwardRef<HTMLElement>((_, ref) => {
  const [minutesAgo, setMinutesAgo] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutesAgo(prev => (prev >= 4 ? 0 : prev + 1));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const lastUpdatedLabel = minutesAgo === 0 ? "Just now" : `${minutesAgo} min ago`;

  return (
    <section className="py-16 relative overflow-hidden -mt-8">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-primary/[0.04] rounded-full blur-[150px]" />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">See It In Action</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            Revenue Leakage Detection, <span className="gradient-text">Live</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Scenario: B2B SaaS company at €4.2M ARR — conversion declining, churn rising. The system identifies root cause, recommends action, and tracks the outcome.
          </p>
        </motion.div>

        {/* Mock Dashboard Preview */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-5xl mx-auto"
        >
          {/* Browser chrome */}
          <div className="rounded-t-2xl border border-b-0 border-border bg-card/80 backdrop-blur-sm p-3 flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-destructive/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 rounded-md bg-muted/50 text-[11px] text-muted-foreground font-mono flex items-center gap-2">
                <Monitor className="w-3 h-3" />
                app.quantivis.io/dashboard
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-muted-foreground/40" />
            </div>
          </div>

          {/* Dashboard content mock */}
          <div className="rounded-b-2xl border border-border bg-background/95 overflow-hidden">
            {/* Status bar mock */}
            <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 border-b border-border/50 bg-card/40 overflow-x-auto scrollbar-hide gap-2">
              <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-semibold text-success">INTELLIGENCE ACTIVE</span>
                </div>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] text-muted-foreground">47 decisions tracked · 12 outcomes measured · 3 recalibrations</span>
              </div>
              <span className="text-[10px] text-muted-foreground">Last updated: {lastUpdatedLabel}</span>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border/30">
              {MOCK_KPIS.map((kpi, i) => (
                <motion.div
                  key={kpi.label}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="bg-background p-5 text-center"
                >
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-1">{kpi.label}</p>
                  <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
                  <p className={`text-xs font-semibold mt-1 ${kpi.positive ? "text-success" : "text-destructive"}`}>
                    {kpi.change}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Intelligence preview cards */}
            <div className="grid md:grid-cols-2 gap-px bg-border/30">
              {PREVIEW_FEATURES.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                  className="bg-background p-5 group"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <feature.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold truncate">{feature.title}</h4>
                        <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${
                          feature.status === "tension"
                            ? "bg-warning/10 text-warning"
                            : feature.status === "positive"
                            ? "bg-success/10 text-success"
                            : "bg-primary/10 text-primary"
                        }`}>
                          {feature.metric}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Bottom CTA bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-border/50 bg-primary/[0.02]">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">3 advisory signals</span> require executive review
                </span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <a
                  href={`mailto:${CONTACT.email.general}?subject=Demo%20Request`}
                  className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-4 py-2 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  Request Demo
                </a>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-1.5 flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 transition-all"
                >
                  <Play className="w-3 h-3" />
                  Try It Free
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Trust signals beneath preview */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="flex flex-wrap justify-center gap-6 mt-10"
        >
          {[
            "GDPR Ready",
            "SOC 2 Audit In Progress",
            "256-bit Encryption",
            "Full Audit Trail",
            "99.9% Uptime SLA",
          ].map((badge) => (
            <span key={badge} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-medium">
              <Shield className="w-3 h-3" />
              {badge}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
});

ProductPreview.displayName = "ProductPreview";

export default ProductPreview;
