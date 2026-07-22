import { Fragment } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Crown, X, Minus } from "lucide-react";
import { TIERS, TierKey, FEATURE_MATRIX } from "@/lib/stripe-tiers";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import ComparisonSection from "@/components/landing/ComparisonSection";
import { CONTACT } from "@/lib/contact-config";
import { useSeoHead } from "@/lib/useSeoHead";

const renderCellValue = (value: boolean | string) => {
  if (value === true) return <Check className="w-4 h-4 text-primary mx-auto" />;
  if (value === false) return <Minus className="w-4 h-4 text-muted-foreground/30 mx-auto" />;
  return <span className="text-sm font-medium text-foreground">{value}</span>;
};

const Pricing = () => {
  useSeoHead({
    title: "Pricing — Quantivis Decision Governance Platform",
    description: "Transparent pricing for Decision Governance. Starter €99/mo, Growth €499/mo, Enterprise custom. SOC 2 controls, EU AI Act-aligned audit trail, immutable decision ledger.",
    canonicalPath: "/pricing",
  });
  const { user } = useAuth();
  const { tier: currentTier, subscribed } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<TierKey | null>(null);
  const [annual, setAnnual] = useState(false);

  const handleCheckout = async (tierKey: TierKey) => {
    if (!user) { navigate(`/register?plan=${tierKey}`); return; }
    const tier = TIERS[tierKey];
    const priceId = annual && tier.price_id_annual ? tier.price_id_annual : tier.price_id;

    // If annual toggle selected but no annual price ID yet, show toast and continue
    // with monthly — tagging the session so sales team can follow up on annual billing
    if (annual && !tier.price_id_annual) {
      toast({
        title: "Annual billing — our team will follow up",
        description: "Starting your trial now. We'll contact you within 24 hours to set up annual billing at the discounted rate.",
        variant: "default",
      });
    }

    setLoadingTier(tierKey);
    try {
      const { data, error } = await invokeWithRetry<{ url?: string }>("create-checkout", {
        body: { priceId: priceId ?? tier.price_id, wantsAnnual: annual },
      });
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: "Checkout failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoadingTier(null);
    }
  };

  const handleManage = async () => {
    try {
      const { data, error } = await invokeWithRetry<{ url?: string }>("customer-portal");
      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err: unknown) {
      toast({ title: "Could not open portal", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Navbar />
      <section className="pt-32 pb-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">Pricing</p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
              Priced Against the <span className="gradient-text">Alternative</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-3">
              EU AI Act fines reach €30M. McKinsey charges €50K for one governance project.
              Building this internally costs €350K. Quantivis starts at €499/month.
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-md mx-auto">
              Every plan includes full audit trail, EU AI Act compliance documentation, and GDPR-ready infrastructure.
            </p>
          </motion.div>

          {/* Billing interval toggle */}
          <div className="flex justify-center mb-10">
            <div className="inline-flex items-center gap-1 p-1 rounded-full border border-border bg-card/40">
              <button
                onClick={() => setAnnual(false)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${!annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${annual ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}
              >
                Annual <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/20 text-success font-bold">−20%</span>
              </button>
            </div>
          </div>

          {/* Tier Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-10">
            {(Object.entries(TIERS) as [TierKey, (typeof TIERS)[TierKey]][]).map(
              ([key, tier], i) => {
                const isActive = subscribed && currentTier === key;
                const isPopular = "popular" in tier && tier.popular;
                const displayPrice = annual && tier.price_annual !== null ? tier.price_annual : tier.price;
                const displayInterval = annual ? "mo, billed yearly" : tier.interval;

                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className={`glass-card p-8 flex flex-col relative ${
                      isPopular ? "border-primary/40 shadow-lg shadow-primary/10" : ""
                    } ${isActive ? "ring-2 ring-primary" : ""}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                        Most Popular
                      </div>
                    )}
                    {isActive && (
                      <div className="absolute -top-3 right-4 px-3 py-1 rounded-full bg-success/20 text-success text-xs font-semibold flex items-center gap-1">
                        <Crown className="w-3 h-3" /> Your Plan
                      </div>
                    )}

                    <h3 className="text-xl font-semibold tracking-tight mb-1">{tier.name}</h3>
                    {"tagline" in tier && (
                      <p className="text-xs text-muted-foreground mb-4">{tier.tagline}</p>
                    )}
                    <div className="mb-6">
                      {displayPrice !== null ? (
                        <>
                          <span className="text-4xl font-bold tracking-tight">{tier.currency}{displayPrice}</span>
                          <span className="text-muted-foreground text-sm">/{displayInterval}</span>
                          {annual && tier.price !== null && (
                            <div className="text-[11px] text-success font-semibold mt-1">
                              Save {tier.currency}{(tier.price - (tier.price_annual ?? tier.price)) * 12}/yr
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-3xl font-bold tracking-tight">Custom</span>
                      )}
                    </div>

                    <ul className="space-y-2.5 mb-8 flex-1">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{f}</span>
                        </li>
                      ))}
                    </ul>

                    {"contactSales" in tier && tier.contactSales ? (
                      <button
                        onClick={() => navigate("/enterprise/contact")}
                        className="w-full py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-colors text-center"
                      >
                        Contact Sales
                      </button>
                    ) : isActive ? (
                      <button
                        onClick={handleManage}
                        className="w-full py-3 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors"
                      >
                        Manage Subscription
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleCheckout(key)}
                          disabled={loadingTier === key}
                          className={`w-full py-3 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 ${
                            isPopular
                              ? "bg-primary text-primary-foreground hover:brightness-110"
                              : "bg-secondary text-foreground border border-border hover:bg-secondary/80"
                          }`}
                        >
                          {loadingTier === key ? (
                            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                          ) : subscribed ? (
                            "Switch Plan"
                          ) : (
                            "Start 14-Day Free Trial"
                          )}
                        </button>
                        {isPopular && !subscribed && (
                          <button
                            onClick={() => navigate("/enterprise/contact")}
                            className="w-full pt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Talk to Sales instead →
                          </button>
                        )}
                      </>
                    )}
                  </motion.div>
                );
              }
            )}
          </div>

          {/* Price Anchoring Banner */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="max-w-5xl mx-auto mb-16 text-center"
          >
            <div className="inline-flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 rounded-2xl sm:rounded-full border border-border/50 bg-card/30">
              <span className="text-xs sm:text-sm text-muted-foreground">vs. McKinsey governance project:</span>
              <span className="text-xs sm:text-sm font-bold line-through text-muted-foreground/60">€50,000+ one-time</span>
              <span className="text-xs text-muted-foreground">→</span>
              <span className="text-xs sm:text-sm font-bold text-primary">From €499/mo continuous</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">100× cheaper, always on</span>
            </div>
          </motion.div>

          {/* Competitive Comparison — directly below pricing */}
          <ComparisonSection inline />

          {/* Full Feature Comparison Matrix */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto mt-16"
          >
            <div className="text-center mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                Complete <span className="gradient-text">Feature Comparison</span>
              </h2>
              <p className="text-muted-foreground">Every capability across every tier — no hidden features.</p>
            </div>

            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-4 px-6 text-muted-foreground font-medium w-[40%]">Feature</th>
                      {(Object.entries(TIERS) as [TierKey, (typeof TIERS)[TierKey]][]).map(([key, t]) => (
                        <th key={key} className={`text-center py-4 px-4 font-semibold ${key === currentTier && subscribed ? "text-primary" : ""}`}>
                          <div>{t.name}</div>
                          <div className="text-xs font-normal text-muted-foreground mt-0.5">
                            {t.price !== null ? `${t.currency}${t.price}/${t.interval}` : "Custom"}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FEATURE_MATRIX.map((group) => (
                      <Fragment key={group.category}>
                        <tr>
                          <td colSpan={4} className="py-3 px-6 text-xs uppercase tracking-widest text-primary font-semibold bg-primary/[0.03] border-b border-border/50">
                            {group.category}
                          </td>
                        </tr>
                        {group.features.map((row) => (
                          <tr key={row.label} className="border-b border-border/30 hover:bg-card/50 transition-colors">
                            <td className="py-3 px-6 font-medium">{row.label}</td>
                            <td className="text-center py-3 px-4">{renderCellValue(row.starter)}</td>
                            <td className="text-center py-3 px-4">{renderCellValue(row.growth)}</td>
                            <td className="text-center py-3 px-4">{renderCellValue(row.enterprise)}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 border-t border-border">
        <div className="container mx-auto px-6 max-w-3xl">
          <div className="text-center mb-12">
            <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">FAQ</p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Common <span className="gradient-text">Questions</span>
            </h2>
          </div>
          <div className="space-y-6">
            {[
              {
                q: "Why is Quantivis priced at €499/month when other SaaS tools are cheaper?",
                a: "Because Quantivis is not a dashboard tool — it is a governance platform. EU AI Act fines reach €30M. McKinsey charges €50,000–€500,000 for a one-time governance project. Building this internally costs €350,000+ in Year 1. At €499/month (€5,988/year), Quantivis delivers continuous governance at less than 1.2% of the minimum consulting engagement cost.",
              },
              {
                q: "What counts as a data connector?",
                a: "A connector is a live integration with an enterprise data source — Stripe, Salesforce, HubSpot, SAP, NetSuite, Xero, Google Sheets, Snowflake, BigQuery, and others. Essentials includes 3 connectors. Governance unlocks all 15. CSV upload is available on every plan and does not count toward the connector limit.",
              },
              {
                q: "What happens after the 14-day trial?",
                a: "Your account stays active and you choose a plan. No automatic charges during the trial. We'll remind you 3 days before the trial ends.",
              },
              {
                q: "Can I change plans at any time?",
                a: "Yes. Upgrades take effect immediately with prorated billing. Downgrades apply at the next billing cycle.",
              },
              {
                q: "Is EU AI Act compliance included in every plan?",
                a: "Yes. Every plan includes the sha256-hashed audit trail, human-in-the-loop approval documentation, EU AI Act risk classification, and the compliance evidence required for Articles 13 and 14. The Trust Center at quantivis.io/trust shows the live compliance state — no login required.",
              },
              {
                q: "What about customers outside the EU — Americas, Asia, Africa?",
                a: "Quantivis works globally. The dashboard and all features are fully available regardless of location. For customers in the US, Canada, and UK, we can invoice in USD or GBP on Enterprise plans. For organisations in Asia and Africa, contact sales for regional pricing — the EU AI Act is increasingly being mirrored by regulators in Singapore (MAS), India (DPDP Act), and South Africa (POPIA), making governance infrastructure relevant globally.",
              },
              {
                q: "Do you offer annual billing?",
                a: "Yes — annual billing saves 20% (Essentials: €399/mo billed yearly = €4,788/yr; Governance: €1,599/mo billed yearly = €19,188/yr). Toggle Annual on the pricing page and you'll be charged the annual amount directly at checkout.",
              },
              {
                q: "Is there a DPA for enterprise procurement?",
                a: "Yes. A standard DPA (EN) and AVV (DE) are available for download in the Trust Center. Custom DPAs and MSAs are available on Enterprise plans.",
              },
              {
                q: "What data do you store and where?",
                a: "Primary customer data is stored in the configured EU Supabase region. We do not use customer data to train Quantivis models. Subprocessor locations, safeguards, and provider certifications are documented individually in the public subprocessor registry.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="glass-card p-6">
                <h3 className="font-semibold mb-2">{q}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 border-t border-border bg-card/20">
        <div className="container mx-auto px-6 text-center max-w-2xl">
          <h2 className="text-[18px] font-semibold tracking-tight mb-3">Ready to Start?</h2>
          <p className="text-muted-foreground mb-8">
            14-day free trial · No credit card required · GDPR ready · Enterprise-grade security
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate("/register")}
              className="px-8 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => navigate("/enterprise/contact")}
              className="px-8 py-3 rounded-lg border border-border text-sm font-semibold hover:bg-secondary transition-colors"
            >
              Talk to Sales
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-6">
            All plans include full audit trail · Data encrypted at rest &amp; in transit · No vendor lock-in
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
