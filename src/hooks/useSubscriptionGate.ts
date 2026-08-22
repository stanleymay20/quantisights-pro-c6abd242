import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/contexts/AuthContext";
import type { TierKey } from "@/lib/stripe-tiers";

/**
 * Feature → tier access matrix.
 * If a feature is NOT listed here, it's available to all tiers.
 *
 * Tier capability summary:
 *   Essentials (starter):  Core Decision Ledger, Copilot 20/day, 3 connectors, 5 seats
 *   Governance (growth):   Full Decision Ledger, Unlimited Copilot, all 15 connectors, 15 seats
 *   Enterprise:            Everything + multi-org, SSO, bias detection, counterfactual, war room
 */
export const FEATURE_TIERS = {
  // All paid tiers can access the connectors surface; per-tier connector counts are
  // enforced by TIER_LIMITS rather than by hiding the route entirely.
  dataConnectors:   ["starter", "growth", "enterprise"],
  // Governance + Enterprise only (starter gets core versions of these)
  simulations:      ["growth", "enterprise"],   // Monte Carlo; starter gets basic sim (5/day)
  convergence:      ["growth", "enterprise"],
  boardExport:      ["starter", "growth", "enterprise"],  // starter=summary, growth=full PDF
  advisory:         ["growth", "enterprise"],
  livestream:       ["growth", "enterprise"],
  forecasting:      ["growth", "enterprise"],
  anomalyDetection: ["growth", "enterprise"],
  causalInference:  ["growth", "enterprise"],
  decisionLedger:   ["starter", "growth", "enterprise"],  // starter=core, growth=full
  benchmarking:     ["growth", "enterprise"],
  alertPlaybooks:   ["growth", "enterprise"],
  okrAlignment:     ["growth", "enterprise"],
  apiIntegrations:  ["growth", "enterprise"],
  aicisIntegration: ["growth", "enterprise"],
  auditExport:      ["growth", "enterprise"],
  // Copilot: all tiers get it, but starter is usage-capped (20/day) via TIER_LIMITS
  copilot:          ["starter", "growth", "enterprise"],
  // Enterprise only
  sso:              ["enterprise"],
  biasDetection:    ["enterprise"],
  counterfactual:   ["enterprise"],
  executiveConvergence: ["enterprise"],
  commandCenter:    ["enterprise"],
  scenarioBranching: ["enterprise"],
  dataLineage:      ["enterprise"],
  marketIntelligence: ["enterprise"],
  multiOrg:         ["enterprise"],
  onPremise:        ["enterprise"],
} satisfies Record<string, TierKey[]>;

export type FeatureKey = keyof typeof FEATURE_TIERS;

/** Lowest paid tier that unlocks a feature — drives upgrade messaging. */
export const requiredTierFor = (feature: FeatureKey): "growth" | "enterprise" =>
  (FEATURE_TIERS[feature] as readonly TierKey[]).includes("growth") ? "growth" : "enterprise";

export const useSubscriptionGate = () => {
  const subscription = useSubscription();
  const { user } = useAuth();

  // Demo users bypass all subscription gates
  const isDemoUser = Boolean(user?.user_metadata?.is_demo);

  const canAccess = (feature: FeatureKey): boolean => {
    if (isDemoUser) return true;
    if (subscription.loading || !subscription.evidenceReady || subscription.error) return false;
    if (!subscription.subscribed || !subscription.tier) return false;
    const allowed = FEATURE_TIERS[feature] as readonly TierKey[] | undefined;
    if (!allowed) return true;
    return allowed.includes(subscription.tier);
  };

  const isExpired = Boolean(
    !isDemoUser
      && subscription.evidenceReady
      && !subscription.loading
      && !subscription.error
      && subscription.hasSubscriptionRecord
      && !subscription.subscribed,
  );

  return { ...subscription, canAccess, isExpired, isDemoUser };
};
