import type { TierKey } from "@/lib/stripe-tiers";

export interface SubscriptionEvidence {
  subscribed: boolean;
  tier: TierKey | null;
  subscriptionEnd: string | null;
  isTrial: boolean;
  trialEnd: string | null;
  isPilot: boolean;
  inGracePeriod: boolean;
  gracePeriodEnd: string | null;
  paymentFailed: boolean;
  billingInterval: "month" | "year" | null;
  status: string | null;
  hasSubscriptionRecord: boolean;
  loading: boolean;
  error: string | null;
  evidenceReady: boolean;
  organizationId: string | null;
}

export const createUnavailableSubscriptionEvidence = (
  {
    organizationId = null,
    loading = false,
    error = null,
  }: {
    organizationId?: string | null;
    loading?: boolean;
    error?: string | null;
  } = {},
): SubscriptionEvidence => ({
  subscribed: false,
  tier: null,
  subscriptionEnd: null,
  isTrial: false,
  trialEnd: null,
  isPilot: false,
  inGracePeriod: false,
  gracePeriodEnd: null,
  paymentFailed: false,
  billingInterval: null,
  status: null,
  hasSubscriptionRecord: false,
  loading,
  error,
  evidenceReady: false,
  organizationId,
});

/**
 * Subscription evidence is tenant-scoped. During an organization switch React
 * can render before the new effect runs, so stale evidence must be masked
 * synchronously rather than relying only on an async state reset.
 */
export const maskSubscriptionEvidenceForScope = (
  evidence: SubscriptionEvidence,
  currentOrgId: string | null,
  hasAuthenticatedUser: boolean,
): SubscriptionEvidence => {
  const scopeMatches = Boolean(
    hasAuthenticatedUser
      && currentOrgId
      && evidence.organizationId === currentOrgId,
  );

  if (scopeMatches) return evidence;

  return createUnavailableSubscriptionEvidence({
    loading: Boolean(hasAuthenticatedUser && currentOrgId),
  });
};
