import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Layers3,
  Scale,
  ShieldCheck,
  Target,
  Workflow,
} from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import {
  COMPETITIVE_SEGMENTS,
  COMPETITIVE_VENDORS,
  QUANTIVIS_BUYER_REASONS,
} from "@/data/competitive-landscape";

const ICONS = [Target, ShieldCheck, Workflow, Layers3, Scale, CheckCircle2];

const segmentDescription: Record<(typeof COMPETITIVE_SEGMENTS)[number], string> = {
  "AI governance":
    "The closest governance alternatives. These products tend to govern AI systems, models, agents, policies, risk and compliance. Quantivis wins when the missing object is the governed business decision and its outcome.",
  "Decision intelligence":
    "Platforms that model, automate, augment or orchestrate decisions. Quantivis differentiates through evidence provenance, human/AI accountability, approval history, outcome measurement and replay.",
  "Adjacent enterprise platform":
    "BI, data/AI, planning, automation, supply-chain and GRC platforms that often compete for the same budget. They can be excellent complements rather than replacements when Quantivis sits above them as the decision layer.",
};

const CompetitiveAnalysis = forwardRef<HTMLDivElement>((_, ref) => (
  <div ref={ref} className="min-h-dvh bg-background flex flex-col">
    <Navbar />
    <main className="flex-1 pt-20 pb-16">
      <div className="container mx-auto px-5 sm:px-6">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-5xl mx-auto text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold uppercase tracking-wider mb-4">
            2026 competitive landscape · 50 vendors
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-5">
            Most platforms govern the AI, automate the decision, or analyze the data. {" "}
            <span className="gradient-text">Quantivis governs the decision itself.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            The buyer question is not “does another platform have AI?” It is: after an insight or AI recommendation appears,
            can your organization prove what evidence supported the choice, who approved it, what action followed, what
            outcome was expected, what actually happened, and what should be learned next time?
          </p>
        </motion.header>

        <section className="mb-14" aria-labelledby="why-quantivis">
          <div className="max-w-3xl mb-6">
            <h2 id="why-quantivis" className="text-2xl sm:text-3xl font-bold mb-2">
              Why a client should choose Quantivis
            </h2>
            <p className="text-muted-foreground">
              These are the strongest defensible reasons — not “we do everything better.” Quantivis is most compelling when
              the customer has a trusted-decision shortage rather than a dashboard, model or workflow shortage.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {QUANTIVIS_BUYER_REASONS.map(({ title, body }, index) => {
              const Icon = ICONS[index];
              return (
                <article key={title} className="rounded-2xl border border-border/60 bg-card/60 p-5">
                  <Icon className="w-5 h-5 text-primary mb-3" aria-hidden="true" />
                  <h3 className="font-semibold mb-2">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-primary/25 bg-primary/5 p-6 sm:p-8 mb-14">
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8 items-start">
            <div className="flex gap-3 items-start">
              <CheckCircle2 className="w-6 h-6 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-bold mb-2">The buyer-safe positioning</h2>
                <p className="text-muted-foreground leading-relaxed">
                  “Keep the systems you already use. Quantivis becomes the governed decision layer above them — connecting
                  evidence to recommendation, approval, execution, measured outcome and organizational learning.”
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/80 p-5">
              <div className="flex gap-2 items-start mb-2">
                <CircleAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
                <h3 className="font-semibold">Do not oversell</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                If a prospect needs deep model governance, a full data lakehouse, specialist credit decisioning, process mining,
                enterprise planning or supply-chain execution, a specialist may be the better primary platform. Quantivis should
                win by owning the cross-system decision record — not by pretending those categories do not matter.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-16" aria-labelledby="landscape-heading">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <h2 id="landscape-heading" className="text-2xl sm:text-3xl font-bold mb-2">50 competitors and alternatives</h2>
              <p className="text-muted-foreground max-w-3xl">
                Direct and adjacent vendors are separated so a buyer can see where the competition is truly like-for-like and
                where Quantivis is better positioned as a complementary decision-governance layer.
              </p>
            </div>
            <div className="text-sm font-semibold text-primary">{COMPETITIVE_VENDORS.length} vendors reviewed</div>
          </div>

          <div className="space-y-12">
            {COMPETITIVE_SEGMENTS.map((segment) => {
              const vendors = COMPETITIVE_VENDORS.filter((vendor) => vendor.segment === segment);
              return (
                <div key={segment}>
                  <div className="mb-5">
                    <div className="flex flex-wrap gap-3 items-baseline mb-2">
                      <h3 className="text-xl sm:text-2xl font-bold">{segment}</h3>
                      <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                        {vendors.length} vendors
                      </span>
                    </div>
                    <p className="text-sm sm:text-base text-muted-foreground max-w-4xl leading-relaxed">
                      {segmentDescription[segment]}
                    </p>
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4">
                    {vendors.map((vendor, index) => (
                      <motion.article
                        key={vendor.name}
                        initial={{ opacity: 0, y: 8 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-60px" }}
                        transition={{ delay: Math.min(index * 0.015, 0.15) }}
                        className="rounded-2xl border border-border/60 bg-card/50 p-5 sm:p-6"
                      >
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <h4 className="text-lg font-bold">{vendor.name}</h4>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border/70 rounded-full px-2 py-1 shrink-0">
                            {vendor.segment}
                          </span>
                        </div>
                        <div className="space-y-4 text-sm leading-relaxed">
                          <div>
                            <div className="font-semibold text-foreground mb-1">Where they are strong</div>
                            <p className="text-muted-foreground">{vendor.strength}</p>
                          </div>
                          <div className="rounded-xl bg-primary/5 border border-primary/15 p-4">
                            <div className="font-semibold text-primary mb-1">Choose Quantivis when</div>
                            <p className="text-muted-foreground">{vendor.chooseQuantivisWhen}</p>
                          </div>
                          <div>
                            <div className="font-semibold text-foreground mb-1">Choose them when</div>
                            <p className="text-muted-foreground">{vendor.chooseThemWhen}</p>
                          </div>
                        </div>
                      </motion.article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-foreground text-background p-7 sm:p-10">
          <div className="grid lg:grid-cols-[1.4fr_0.6fr] gap-8 items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] opacity-70 mb-3">The decisive demo</div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Do not demo features. Demo one decision end to end.</h2>
              <p className="opacity-80 leading-relaxed max-w-3xl">
                Start with a real executive question, show the source evidence, produce the recommendation, capture human
                approval and rationale, assign execution, then show how Quantivis records the outcome and replays what was
                learned. That is the clearest separation from dashboards, GRC registers and model-governance tools.
              </p>
            </div>
            <div className="flex lg:justify-end">
              <Link
                to="/#demo"
                className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-3 font-semibold hover:brightness-110 transition"
              >
                Request a decision demo <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <p className="text-xs text-muted-foreground mt-6 max-w-5xl leading-relaxed">
          Competitive positioning is intentionally conservative. Product roadmaps, certifications, pricing and deployment
          options change frequently; verify vendor-specific claims during procurement. Inclusion here means a vendor can appear
          in the same RFP, budget conversation or architectural decision — not that every product is a feature-for-feature substitute.
        </p>
      </div>
    </main>
    <Footer />
  </div>
));

CompetitiveAnalysis.displayName = "CompetitiveAnalysis";
export default CompetitiveAnalysis;
