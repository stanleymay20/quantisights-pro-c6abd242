/**
 * stripe-tiers.ts — Quantivis pricing tiers
 *
 * Pricing philosophy: value-based, not cost-based.
 *
 * What Quantivis delivers vs the alternative:
 *   • EU AI Act fine (max): €30M or 6% revenue — Quantivis at €499/mo = 0.02% of max fine
 *   • McKinsey governance project: €50,000–€500,000 one-time — Quantivis is continuous
 *   • Internal build cost: €350,000+ Year 1 — Quantivis is month-to-month
 *   • Compliance consultant: €150–€300/hr — Quantivis automates 40+ hrs/month
 *
 * New price IDs (REQUIRED ACTION):
 *   In Stripe Dashboard → Products, create new prices for each tier and replace the
 *   price_id values below. Keep the product_ids — they already exist in Stripe.
 *
 * Annual price IDs:
 *   Go to Stripe → Products → [Product] → Add another price → Recurring → Yearly
 *   Set the yearly price and paste the price_id into price_id_annual.
 */

export const TIERS = {
  starter: {
    name: "Essentials",
    price: 499,
    price_annual: 399,      // €399/mo billed annually = €4,788/yr (20% off €5,988)
    currency: "€",
    interval: "month",
    price_id: "price_1T6Ji8JYFIBeCvef4RkHSCfw",          // €499/mo
    price_id_annual: "price_1TiqhyJYFIBeCvefcRRwNfor" as string | null,  // €4,788/yr = €399/mo billed yearly
    product_id: "prod_U4SdCda1dcZAtu",
    tagline: "Decision governance for teams that need board-defensible AI decisions",
    features: [
      "5 user seats",
      "3 data connectors",
      "Core Decision Ledger",
      "Executive Copilot (20 queries/day)",
      "KPI dashboard & analytics",
      "Basic scenario simulations (5/day)",
      "EU AI Act compliance documentation",
      "GDPR audit trail",
      "Board-ready summary reports",
    ],
  },
  growth: {
    name: "Governance",
    price: 1999,
    price_annual: 1599,     // €1,599/mo billed annually = €19,188/yr (20% off €23,988)
    currency: "€",
    interval: "month",
    price_id: "price_1TCfwlJYFIBeCvefvzY9z5m9",          // €1,999/mo
    price_id_annual: "price_1TiqiLJYFIBeCvef3CEFlzIL" as string | null,  // €19,188/yr = €1,599/mo billed yearly
    product_id: "prod_UB202T0yfALsxx",
    tagline: "Full decision intelligence OS for mid-market operations and leadership teams",
    features: [
      "15 user seats",
      "All 15 enterprise data connectors",
      "Full Decision Ledger with calibration tracking",
      "Unlimited Executive Copilot",
      "Monte Carlo simulations (50/day)",
      "AI Prescriptive Advisory Engine",
      "Predictive Forecasting & Anomaly Detection",
      "Causal Inference Engine (DAGs)",
      "Board-ready PDF governance reports",
      "AICIS geopolitical signal integration",
      "OKR Alignment & Benchmarking",
      "Alert Playbooks & Escalation Chains",
      "EU AI Act Articles 13 & 14 compliance",
    ],
    popular: true,
  },
  enterprise: {
    name: "Enterprise",
    price: null,
    price_annual: null,
    currency: "€",
    interval: "year",
    price_id: null,
    price_id_annual: null as string | null,
    product_id: "prod_U1oN5CDeptb9uY",
    tagline: "Enterprise decision governance at scale — from €6,500/month",
    contactSales: true,
    features: [
      "Everything in Governance, plus:",
      "Unlimited user seats",
      "Multi-organisation management",
      "SSO, RBAC & full audit trail",
      "Cognitive Bias Detection (AI)",
      "Counterfactual Explanations",
      "Executive Convergence Index",
      "Multi-role Command Center (CEO/CFO/CMO/COO)",
      "Scenario Branching & War Room",
      "Data Lineage & Provenance Tracking",
      "Market Intelligence Signals",
      "Custom data connector development",
      "Dedicated Customer Success Manager",
      "Priority processing & 4hr SLA",
      "On-premise / private cloud option",
      "Custom DPA & MSA",
    ],
  },
} as const;

export type TierKey = keyof typeof TIERS;

export const getTierByProductId = (productId: string | null): TierKey | null => {
  if (!productId) return null;
  for (const [key, tier] of Object.entries(TIERS)) {
    if (tier.product_id === productId) return key as TierKey;
  }
  return null;
};

// Feature comparison matrix for pricing/billing pages
export const FEATURE_MATRIX = [
  { category: "Intelligence", features: [
    { label: "KPI Dashboard & Analytics",         starter: true,      growth: true,       enterprise: true },
    { label: "AI-Powered Insights",               starter: false,     growth: true,       enterprise: true },
    { label: "Anomaly Detection",                 starter: false,     growth: true,       enterprise: true },
    { label: "Root Cause Diagnostics",            starter: false,     growth: true,       enterprise: true },
    { label: "Predictive Forecasting",            starter: false,     growth: true,       enterprise: true },
    { label: "Causal Inference Engine",           starter: false,     growth: true,       enterprise: true },
    { label: "Market Intelligence Signals",       starter: false,     growth: false,      enterprise: true },
  ]},
  { category: "Decision Science", features: [
    { label: "Scenario Simulations",              starter: "5/day",   growth: "50/day",   enterprise: "Unlimited" },
    { label: "Monte Carlo Analysis",              starter: false,     growth: true,       enterprise: true },
    { label: "Decision Ledger & Tracking",        starter: "Core",    growth: "Full",     enterprise: "Full + AI" },
    { label: "Cognitive Bias Detection",          starter: false,     growth: false,      enterprise: true },
    { label: "Counterfactual Explanations",       starter: false,     growth: false,      enterprise: true },
    { label: "Scenario Branching & War Room",     starter: false,     growth: false,      enterprise: true },
  ]},
  { category: "Executive Layer", features: [
    { label: "Executive Copilot",                 starter: "20/day",  growth: "Unlimited",enterprise: "Unlimited" },
    { label: "Prescriptive Advisory",             starter: false,     growth: true,       enterprise: true },
    { label: "Board Governance Reports",          starter: "Summary", growth: "Full PDF", enterprise: "Full + AI" },
    { label: "Executive Convergence Index",       starter: false,     growth: false,      enterprise: true },
    { label: "Multi-role Command Center",         starter: false,     growth: false,      enterprise: true },
    { label: "Alert Playbooks & Escalation",      starter: false,     growth: true,       enterprise: true },
  ]},
  { category: "Data & Connectors", features: [
    { label: "Data Upload (CSV)",                 starter: true,      growth: true,       enterprise: true },
    { label: "Live Data Connectors",              starter: "3",       growth: "15",       enterprise: "Custom" },
    { label: "AICIS Geopolitical Signals",        starter: false,     growth: true,       enterprise: true },
    { label: "Data Lineage & Provenance",         starter: false,     growth: false,      enterprise: true },
    { label: "OKR Alignment Engine",              starter: false,     growth: true,       enterprise: true },
    { label: "Industry Benchmarking",             starter: false,     growth: true,       enterprise: true },
  ]},
  { category: "Governance & Compliance", features: [
    { label: "Audit Trail (sha256 verified)",     starter: true,      growth: true,       enterprise: true },
    { label: "EU AI Act Art. 13 & 14",            starter: true,      growth: true,       enterprise: true },
    { label: "GDPR / DSGVO",                     starter: true,      growth: true,       enterprise: true },
    { label: "DPA / AVV",                        starter: "Standard",growth: "Standard", enterprise: "Custom" },
    { label: "Full Audit Trail Export",           starter: false,     growth: true,       enterprise: true },
    { label: "Governance Simulation",             starter: false,     growth: false,      enterprise: true },
  ]},
  { category: "Platform & Team", features: [
    { label: "Team Seats",                        starter: "5",       growth: "15",       enterprise: "Unlimited" },
    { label: "Multi-organisation",               starter: false,     growth: false,      enterprise: true },
    { label: "SSO & RBAC",                       starter: false,     growth: false,      enterprise: true },
    { label: "API & Webhook Integrations",        starter: false,     growth: true,       enterprise: true },
    { label: "Custom Connector Development",      starter: false,     growth: false,      enterprise: true },
  ]},
  { category: "Support & Services", features: [
    { label: "Onboarding",                        starter: "Self-serve", growth: "Guided", enterprise: "Dedicated" },
    { label: "Support",                           starter: "Email",   growth: "Priority", enterprise: "4hr SLA" },
    { label: "Customer Success Manager",          starter: false,     growth: false,      enterprise: true },
    { label: "Custom KPI Design",                starter: false,     growth: "Add-on",   enterprise: "Included" },
    { label: "Executive Reporting Config",        starter: false,     growth: "Add-on",   enterprise: "Included" },
    { label: "Team Training & Workshops",         starter: false,     growth: "Add-on",   enterprise: "Included" },
    { label: "On-premise / Private Cloud",        starter: false,     growth: false,      enterprise: true },
  ]},
] as const;
