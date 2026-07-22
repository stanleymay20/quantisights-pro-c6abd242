import { forwardRef } from "react";
import { motion } from "framer-motion";
import {
  Brain, Zap, Shield, TrendingUp, FileText, Users,
  ArrowRight, ShieldCheck, AlertTriangle, Eye,
  BarChart3, Target, Sparkles, Bell,
} from "lucide-react";

const HOW_IT_WORKS = [
  { step: "01", title: "Log", desc: "Record a strategic decision in 3 clicks — confidence level, expected outcome, time horizon. That's all the system needs." },
  { step: "02", title: "Measure", desc: "When outcomes arrive, the system compares what you predicted vs what actually happened — revealing systematic accuracy patterns." },
  { step: "03", title: "Correct", desc: "Bayesian calibration learns from your outcomes and automatically adjusts future confidence scores across the platform. Every decision makes the next one better." },
  { step: "04", title: "Defend", desc: "Board-ready reports show corrected probabilities, full decision trails, and governance-grade evidence chains. No prep needed." },
];

const TOP_DIFFERENTIATORS = [
  {
    icon: AlertTriangle,
    title: "Overconfidence Detection",
    description: "Automatically identifies when your team systematically overestimates success on mid-range strategic bets — the most expensive blind spot in executive decision-making.",
    tag: "Core",
    category: "Protection",
  },
  {
    icon: ShieldCheck,
    title: "Self-Correcting Confidence",
    description: "Every probability in the system is automatically corrected based on your organization's actual historical accuracy. The more you use it, the more accurate it becomes.",
    tag: "Unique",
    category: "Protection",
  },
  {
    icon: Eye,
    title: "Decision Audit Trail",
    description: "Full provenance for every strategic recommendation — what was predicted, what actually happened, and how the model adjusted. Board-defensible by design.",
    tag: "Unique",
    category: "Governance",
  },
];

const CAPABILITIES = [
  {
    icon: Sparkles,
    title: "Executive Intelligence Copilot",
    description: "Ask strategic questions in plain English. Get answers grounded in your actual data, corrected for your historical accuracy patterns. Not generic AI — your organization's intelligence.",
    category: "Intelligence",
  },
  {
    icon: Brain,
    title: "Prescriptive Advisory Engine",
    description: "Every recommendation includes confidence scoring, consequence of inaction, evidence chain, and full lifecycle tracking from signal to measured outcome.",
    category: "Advisory",
  },
  {
    icon: Shield,
    title: "C-Suite Convergence Index",
    description: "Detects strategic misalignment across CEO, CFO, CMO, and COO before it becomes a costly conflict. Unified alignment scoring.",
    category: "Alignment",
  },
  {
    icon: TrendingUp,
    title: "Scenario War Room",
    description: "Model multi-variable scenarios with probability distributions. See P10/P50/P90 impact projections — all corrected for your accuracy history.",
    category: "Strategy",
  },
  {
    icon: FileText,
    title: "One-Click Board Reports",
    description: "Generate governance-grade reports with risk attribution, trend intelligence, and corrected confidence levels. Press one button, not prep for five days.",
    category: "Reporting",
  },
  {
    icon: Target,
    title: "OKR Alignment & Benchmarking",
    description: "Cascading objectives with weighted key results, KPI linking, and industry percentile benchmarking to know where you stand.",
    category: "Strategy",
  },
  {
    icon: Bell,
    title: "Proactive Risk Alerts",
    description: "Threshold-based escalation chains that notify the right executive before a risk becomes a crisis. No more dashboard-checking.",
    category: "Operations",
  },
  {
    icon: BarChart3,
    title: "Decision Ledger",
    description: "Track every strategic call with calibration scoring. See your prediction accuracy improve over time — your executive performance system.",
    category: "Governance",
  },
  {
    icon: Users,
    title: "Multi-Org Command Center",
    description: "Manage multiple organizations with role-based access, team invitations, audit logs, and tiered governance controls.",
    category: "Scale",
  },
];

const FeaturesSection = forwardRef<HTMLElement>((_, ref) => {
  return (
    <>
      {/* How It Works */}
      <section id="how-it-works" className="py-24 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Decide. Measure. <span className="gradient-text">Improve.</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-2">
              The system learns from every decision your team makes — and gets smarter with each outcome.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Used by strategy and finance teams in decision-heavy environments
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {HOW_IT_WORKS.map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="glass-card p-7 h-full">
                  <span className="text-3xl font-bold tracking-tight text-primary/20">{item.step}</span>
                  <h3 className="text-[14px] font-semibold tracking-tight mt-2 mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
                {i < HOW_IT_WORKS.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-3 z-10">
                    <ArrowRight className="w-5 h-5 text-primary/30" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Unique differentiators banner */}
      <section className="py-16 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card-elevated p-5 sm:p-10 md:p-14 text-center"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Why This Is Different</p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight mb-4">

              Three Capabilities That <span className="gradient-text">Set Us Apart</span>
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base max-w-2xl mx-auto mb-8 sm:mb-10">
              Most platforms show you what happened. Quantivis measures how wrong you were — and makes you less wrong next time.
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {TOP_DIFFERENTIATORS.map((d, i) => (
                <motion.div
                  key={d.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="p-6 rounded-xl border border-primary/20 bg-primary/[0.03] text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <d.icon className="w-5 h-5 text-primary" />
                    </div>
                    {d.tag && (
                      <span className="text-[10px] uppercase tracking-widest font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {d.tag}
                      </span>
                    )}
                  </div>
                  <h3 className="text-[14px] font-semibold tracking-tight mb-2">{d.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{d.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Full Capabilities Grid */}
      <section id="features" className="py-24 relative">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Full Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything You Need to <span className="gradient-text">Decide with Confidence</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From the first strategic question to the board presentation — one system that learns, corrects, and defends.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {CAPABILITIES.map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="glass-card-hover p-7 group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">{feature.category}</span>
                </div>
                <h3 className="text-[14px] font-semibold tracking-tight mb-2">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
});

FeaturesSection.displayName = "FeaturesSection";

export default FeaturesSection;
