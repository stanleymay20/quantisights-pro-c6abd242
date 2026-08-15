import type { TierKey } from "@/lib/stripe-tiers";

/**
 * Self-serve evaluation access is intentionally separate from Stripe's
 * checkout trial. The pilot starts without a card, never auto-renews, and
 * grants Governance/Growth capabilities long enough to reach first value.
 */
export const PILOT_TERMS = {
  days: 30,
  tier: "growth" as TierKey,
  tierLabel: "Governance",
  requiresCard: false,
  autoRenews: false,
} as const;
