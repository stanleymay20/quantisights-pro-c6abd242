import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import {
  Rocket, Repeat, Briefcase, TrendingUp,
  Check, ArrowRight, Target, Shield, BarChart3,
  Users, Layers, Crown, Zap, FileText,
} from "lucide-react";

const LAYERS = [
  {
    number: "01",
    title: "Paid Pilot",
    subtitle: "Outcome-driven proof of value",
    icon: Rocket,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    description: "A 4–8 week engagement that proves ROI before any long-term commitment. One team, one dataset, full intelligence stack.",
    deliverables: [
      "Executive dashboard with live KPIs",
      "AI diagnostics & root cause analysis",
      "Prescriptive advisory engine",
      "Predictive forecasting & scenarios",
      "Decision review pack for the board",
      "Pilot audit report with ROI attribution",
    ],
    pricing: "€5,000–€15,000",
    pricingNote: "One-time, outcome-based",
    buyerValue: "Reduces buyer risk to near-zero. Proves value in weeks, not quarters.",
  },
  {
    number: "02",
    title: "Annual SaaS Subscription",
    subtitle: "Recurring platform revenue",
    icon: Repeat,
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/20",
    description: "After pilot success, convert into recurring platform access. Two public tiers plus custom Enterprise.",
    deliverables: [
      "Starter (€99/mo): 1 org, 1 dataset, core dashboards, 2 seats",
      "Growth (€499/mo): unlimited datasets, AI advisory, forecasting, copilot, calibration, 10 seats",
      "Enterprise (€18K–€72K/yr): unlimited everything, SSO/RBAC, cognitive bias detection, multi-org",
      "Usage-based AI compute add-on",
      "Board-ready governance reports",
      "Executive copilot & natural language queries",
    ],
    pricing: "€99–€499/mo",
    pricingNote: "Per organization, billed monthly or annually",
    buyerValue: "500x cheaper than equivalent consulting engagements. Always-on intelligence.",
  },
  {
    number: "03",
    title: "Strategic Services",
    subtitle: "High-margin implementation & consulting",
    icon: Briefcase,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
    description: "Premium configuration, custom modeling, and board-level reporting services layered on top of the platform.",
    deliverables: [
      "Onboarding & data integration setup",
      "Custom KPI design & metric engineering",
      "Board-ready reporting configuration",
      "Sector-specific scenario templates",
      "Decision governance framework setup",
      "Executive team training & workshops",
    ],
    pricing: "€2,500–€25,000",
    pricingNote: "Per engagement or retainer",
    buyerValue: "Serious companies don't just buy software. They buy outcomes.",
  },
  {
    number: "04",
    title: "Enterprise Expansion",
    subtitle: "Land and expand within organizations",
    icon: TrendingUp,
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/20",
    description: "Once trusted, expand within the client: more teams, workspaces, business units, datasets, and decision workflows.",
    deliverables: [
      "Additional team seats & workspaces",
      "Multi-business unit deployment",
      "Portfolio-wide monitoring (PE/VC)",
      "Cross-portfolio benchmarking & contagion modeling",
      "White-label & multi-client environments",
      "Custom AI models & compliance controls",
    ],
    pricing: "Custom",
    pricingNote: "Enterprise contracts, annual commitment",
    buyerValue: "One PE firm sale = infrastructure for 10–50 portfolio companies.",
  },
];

const BUYER_SEGMENTS = [
  { title: "PE/VC Portfolio Ops", description: "Real-time portfolio health, risk detection, board-ready reporting", icon: Crown },
  { title: "CFO Offices", description: "Faster decision cycles, documented reasoning, forecast accuracy", icon: BarChart3 },
  { title: "Strategy Teams", description: "Less spreadsheet chaos, better scenario planning, calibrated judgment", icon: Target },
  { title: "Consulting Firms", description: "Scalable intelligence delivery, client-facing dashboards", icon: Briefcase },
];

const VALUE_PROPS = [
  "We don't just show data — we improve the quality, speed, and traceability of decisions.",
  "Decision Governance Infrastructure: reducing the 7–12pp systematic overestimation in strategic judgment.",
  "Every strategic decision becomes board-defensible with a full digital audit trail.",
];

const BusinessModel = () => {
  return (
    <div className="min-h-dvh bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-16">
        <div className="container mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-xs tracking-widest uppercase">Business Model Canvas</Badge>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
              B2B Decision Intelligence <span className="gradient-text">Revenue Engine</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Software subscription + implementation + premium intelligence workflows + enterprise support.
              Four revenue layers designed for category leadership in a $4.2B market growing 22% annually.
            </p>
          </motion.div>

          {/* Revenue Layers */}
          <div className="space-y-6 max-w-5xl mx-auto mb-20">
            {LAYERS.map((layer, i) => (
              <motion.div
                key={layer.number}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`border ${layer.border} overflow-hidden`}>
                  <CardContent className="p-0">
                    <div className="flex flex-col lg:flex-row">
                      {/* Left accent */}
                      <div className={`${layer.bg} p-8 lg:w-80 flex flex-col justify-center items-center lg:items-start shrink-0`}>
                        <span className="text-xs font-mono text-muted-foreground mb-2">LAYER {layer.number}</span>
                        <div className="flex items-center gap-3 mb-3">
                          <layer.icon className={`w-6 h-6 ${layer.color}`} />
                          <h3 className="text-[16px] font-semibold tracking-tight tracking-tight">{layer.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground text-center lg:text-left">{layer.subtitle}</p>
                        <div className="mt-4 pt-4 border-t border-border/30 w-full">
                          <p className={`text-[18px] font-semibold tracking-tight ${layer.color}`}>{layer.pricing}</p>
                          <p className="text-xs text-muted-foreground">{layer.pricingNote}</p>
                        </div>
                      </div>

                      {/* Right content */}
                      <div className="p-8 flex-1 space-y-4">
                        <p className="text-sm text-foreground/80">{layer.description}</p>
                        <div>
                          <h4 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Deliverables</h4>
                          <div className="grid sm:grid-cols-2 gap-2">
                            {layer.deliverables.map((d) => (
                              <div key={d} className="flex items-start gap-2 text-sm">
                                <Check className={`w-4 h-4 mt-0.5 shrink-0 ${layer.color}`} />
                                <span className="text-muted-foreground">{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="pt-3 border-t border-border/30">
                          <p className="text-xs text-muted-foreground flex items-start gap-2">
                            <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" />
                            {layer.buyerValue}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Revenue Flow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto mb-20"
          >
            <h2 className="text-[18px] font-semibold tracking-tight text-center mb-8">
              Revenue <span className="gradient-text">Flywheel</span>
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {["Sell Pilot", "Prove Value", "Convert to Annual", "Expand Seats & Datasets", "Add Premium Services"].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-5 py-3 rounded-xl bg-card border border-border">
                    <Zap className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">{step}</span>
                  </div>
                  {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Target Buyers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto mb-20"
          >
            <h2 className="text-[18px] font-semibold tracking-tight text-center mb-3">
              Who <span className="gradient-text">Pays</span>
            </h2>
            <p className="text-muted-foreground text-center mb-8 text-sm">The most valuable buyers are institutional decision-makers, not random small businesses.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {BUYER_SEGMENTS.map((seg) => (
                <Card key={seg.title} className="border-border/50">
                  <CardContent className="p-6 text-center space-y-3">
                    <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                      <seg.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h4 className="font-semibold text-sm">{seg.title}</h4>
                    <p className="text-xs text-muted-foreground">{seg.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* Value Proposition */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto mb-20"
          >
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <CardContent className="p-8 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-bold tracking-tight">Core Value Proposition</h3>
                </div>
                {VALUE_PROPS.map((v, i) => (
                  <p key={i} className="text-sm text-foreground/80 flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {v}
                  </p>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Model Framings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-4xl mx-auto mb-20"
          >
            <h2 className="text-[18px] font-semibold tracking-tight text-center mb-8">
              Three Ways to <span className="gradient-text">Describe</span> the Model
            </h2>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { label: "Investor Version", text: "AI-powered enterprise decision intelligence platform", icon: TrendingUp },
                { label: "Client Version", text: "Software that helps leaders make better decisions with diagnostics, forecasts, and recommendations", icon: Users },
                { label: "Internal Version", text: "B2B SaaS + implementation + premium enterprise intelligence stack", icon: FileText },
              ].map((f) => (
                <Card key={f.label} className="border-border/50">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-center gap-2">
                      <f.icon className="w-4 h-4 text-primary" />
                      <Badge variant="outline" className="text-xs">{f.label}</Badge>
                    </div>
                    <p className="text-sm text-foreground/80 leading-relaxed">{f.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </motion.div>

          {/* One-liner */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto text-center mb-16"
          >
            <div className="glass-card p-8 rounded-2xl">
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">The Elevator Pitch</p>
              <p className="text-lg font-medium text-foreground leading-relaxed">
                Quantivis makes money by helping companies upload operational data, convert it into decision intelligence,
                and pay for ongoing access, premium analysis, and implementation support.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default BusinessModel;
