import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight, Shield, Brain, Target, TrendingUp, Users, BarChart3,
  Database, Lock, Globe, Zap, CheckCircle2, Award, Calendar, MapPin,
  Trophy, Rocket, Euro
} from "lucide-react";
import logo from "@/assets/quantivis-logo.png";
import { CONTACT } from "@/lib/contact-config";

const METRICS = [
  { label: "Decision Frameworks", value: "20+", desc: "analytical models built-in" },
  { label: "Market Size", value: "$4.2B", desc: "Decision Intelligence TAM (2026)" },
  { label: "Enterprise ACV", value: "€18K–€72K", desc: "per organization annually" },
  { label: "Time to Value", value: "90 days", desc: "from pilot to calibrated decisions" },
];

const CATEGORY = "AI-Powered Decision Governance Infrastructure";

const CAPABILITIES = [
  { icon: Brain, title: "20+ Decision Frameworks", desc: "Monte Carlo, Bayesian Priors, DROI/TCI Calculators, Decision Velocity Curve, Maturity Assessment" },
  { icon: Target, title: "Decision Fitness Assessment", desc: "7-dimension diagnostic scoring Strategic Clarity, Analytical Acumen, Leadership Style & more" },
  { icon: Shield, title: "Evidence Contract", desc: "Every recommendation graded A–F with traceability, assumptions, and risk-if-wrong" },
  { icon: Zap, title: "Free Strategy Diagnosis", desc: "Instant McKinsey-level business analysis — no signup required, instant value delivery" },
  { icon: Lock, title: "Enterprise Security", desc: "RLS on 100% of tables, immutable audit trails, PII redaction, GDPR-ready" },
  { icon: Users, title: "Calibration Engine", desc: "Learns from outcomes to correct systematic overconfidence with DROI quantification" },
];

const DIFFERENTIATORS = [
  "Not another dashboard — a Decision Ledger that tracks Decision → Outcome → Learning",
  "Decision Fitness Assessment: 7-dimension organizational readiness diagnostic with maturity roadmap",
  "DROI & TCI Calculators quantify both the return on better decisions AND the cost of inaction",
  "Free Strategy Session delivers instant McKinsey-level diagnosis — no signup required",
  "Decision Velocity Curve identifies optimal speed-accuracy tradeoff with Paralysis Index",
  "Enterprise-grade security: RLS on 100% of tables, immutable audit trails, PII redaction",
];

const TRACTION = [
  { label: "Platform Status", value: "Production", icon: CheckCircle2 },
  { label: "Demo Environment", value: "15 months", icon: Zap },
  { label: "Security Posture", value: "Enterprise", icon: Shield },
  { label: "Decision Frameworks", value: "20+", icon: Brain },
];

const MARKET_DATA = [
  { label: "TAM", value: "$4.2B", desc: "Decision Intelligence market (2026)" },
  { label: "CAGR", value: "22%", desc: "projected growth through 2030" },
  { label: "ICP", value: "CEO / CFO / COO", desc: "PE/VC firms, mid-market enterprises" },
  { label: "ACV", value: "€18K–€72K", desc: "per org, usage-based tiers" },
];

const Pitch = () => {
  return (
    <div className="min-h-dvh bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-2xl">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Quantivis" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/pitch-deck" className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary/30 transition-all hidden sm:inline-flex">
              Pitch Deck
            </Link>
            <Link to="/demo" className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
              Live Demo
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 pt-24">
        {/* Hero */}
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-6 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 text-xs font-semibold text-primary mb-6">
                <Award className="w-3.5 h-3.5" />
                Investor One-Pager · {CATEGORY}
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
                Decision Governance{" "}
                <span className="gradient-text">Infrastructure</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
                Quantivis is the operating system for strategic decisions — making every executive call traceable, calibrated, and board-defensible through the Decision → Outcome → Learning lifecycle.
              </p>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-8">
                Target: CEO, CFO, COO, PE/VC firms · Market: $4.2B Decision Intelligence · HQ: {CONTACT.location}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/25"
                >
                  Launch Live Demo <ArrowRight className="w-5 h-5" />
                </Link>
                <Link
                  to="/pitch-deck"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-border bg-card/50 text-foreground font-semibold hover:border-primary/30 transition-all"
                >
                  View Pitch Deck
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Key Metrics */}
        <section className="py-12 border-y border-border/30 bg-muted/20">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {METRICS.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <p className="text-3xl sm:text-4xl font-bold text-primary">{m.value}</p>
                  <p className="text-sm font-semibold mt-1">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6 text-center">The Problem</h2>
            <div className="space-y-4 text-muted-foreground">
              <p className="text-base sm:text-lg leading-relaxed">
                <strong className="text-foreground">73% of executives are systematically overconfident</strong> in their strategic forecasts (HBR, 2023). Yet no enterprise tool tracks whether past predictions were accurate, or adjusts future confidence accordingly.
              </p>
              <p className="text-base sm:text-lg leading-relaxed">
                The result: <strong className="text-foreground">$2.3T in annual value destruction</strong> from preventable strategic miscalls. Boards lack audit trails. PE firms can't measure portfolio management quality. CFOs reforecast without learning from prior misses.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                {[
                  { stat: "$12.9M", label: "Avg. annual cost of poor data quality", src: "Gartner 2022" },
                  { stat: "85%", label: "AI projects that fail due to data gaps", src: "MIT Sloan" },
                  { stat: "40%", label: "Higher ops cost without governance", src: "TDWI 2023" },
                  { stat: "80%", label: "Analyst time wasted on data cleansing", src: "Industry avg." },
                ].map((d) => (
                  <div key={d.stat} className="text-center p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                    <p className="text-xl font-bold text-destructive">{d.stat}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{d.label}</p>
                    <p className="text-[9px] text-muted-foreground/60 mt-0.5">{d.src}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Solution */}
        <section className="py-16 sm:py-20 bg-muted/10">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4 text-center">The Solution</h2>
            <p className="text-center text-muted-foreground mb-12 max-w-2xl mx-auto">
              A 90-day path from tracking decisions to measurably better strategic judgment.
            </p>
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {[
                { month: "Month 1", title: "Decision Ledger", desc: "Log strategic calls with confidence scores, predicted impact, and accountability assignments." },
                { month: "Month 2", title: "Outcome Tracking", desc: "Record real results. The platform measures where forecasts diverged from reality." },
                { month: "Month 3", title: "Calibration Active", desc: "AI adjusts confidence scores based on track record. Your org makes measurably better decisions." },
              ].map((step, i) => (
                <motion.div
                  key={step.month}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="p-6 rounded-xl border border-border bg-card"
                >
                  <span className="text-xs font-bold text-primary uppercase tracking-widest">{step.month}</span>
                  <h3 className="text-lg font-bold mt-2 mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Market Opportunity */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8 text-center">Market Opportunity</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {MARKET_DATA.map((m, i) => (
                <motion.div
                  key={m.label}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center p-5 rounded-xl border border-border/50 bg-card/60"
                >
                  <p className="text-xs font-bold text-primary uppercase tracking-widest mb-1">{m.label}</p>
                  <p className="text-2xl font-bold">{m.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="py-16 sm:py-20 bg-muted/10">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-12 text-center">Platform Capabilities</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {CAPABILITIES.map((cap, i) => (
                <motion.div
                  key={cap.title}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                  className="p-5 rounded-xl border border-border/50 bg-card/60"
                >
                  <cap.icon className="w-8 h-8 text-primary mb-3" />
                  <h3 className="font-bold mb-1">{cap.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{cap.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Differentiators */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-6 max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8 text-center">What Makes Us Different</h2>
            <div className="space-y-4">
              {DIFFERENTIATORS.map((d, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-start gap-3 p-4 rounded-lg border border-border/30 bg-card/40"
                >
                  <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm sm:text-base">{d}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Technical Traction */}
        <section className="py-16 sm:py-20 bg-muted/10">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8 text-center">Traction & Readiness</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-3xl mx-auto">
              {TRACTION.map((t, i) => (
                <motion.div
                  key={t.label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center p-5 rounded-xl border border-border/50 bg-card/60"
                >
                  <t.icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="text-xl font-bold">{t.value}</p>
                  <p className="text-xs text-muted-foreground">{t.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-24">
          <div className="container mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="border border-border rounded-2xl bg-card/80 backdrop-blur-sm p-8 sm:p-16 text-center max-w-2xl mx-auto"
            >
              <Globe className="w-10 h-10 text-primary mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">See It In Action</h2>
              <p className="text-muted-foreground mb-8">
                Try the full platform with 15 months of seeded intelligence data — no signup required.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all shadow-lg shadow-primary/25"
                >
                  Launch Live Demo <ArrowRight className="w-5 h-5" />
                </Link>
                <a
                  href={`mailto:${CONTACT.email.general}`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-border bg-card/50 text-foreground font-semibold hover:border-primary/30 transition-all"
                >
                  Contact Founder
                </a>
              </div>
              <p className="text-xs text-muted-foreground mt-6">
                {CONTACT.email.general} · {CONTACT.location} · GDPR ready
              </p>
            </motion.div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Pitch;
