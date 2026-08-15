import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export const PILOT_DAYS = 30;
export const PILOT_TIER = "growth";
const PILOT_PREFIX = "pilot_";

export const pilotSubscriptionId = (organizationId: string) => `${PILOT_PREFIX}${organizationId}`;
export const isPilotSubscriptionId = (subscriptionId: string | null | undefined) =>
  Boolean(subscriptionId?.startsWith(PILOT_PREFIX));

export interface PilotGrantResult {
  granted: boolean;
  active: boolean;
  alreadyUsed: boolean;
  tier: string;
  trialEnd: string | null;
  reason: "granted" | "already_active" | "pilot_already_used";
}

/**
 * Grants one self-serve, no-card evaluation pilot to an organization.
 *
 * The existing subscriptions table remains the billing/access source of truth,
 * so every server-side feature gate that calls check_feature_access honors the
 * pilot exactly like a Growth trial. Synthetic Stripe identifiers keep pilot
 * rows isolated from real Stripe lifecycle events.
 *
 * A pilot is intentionally one-time: an expired pilot row is never extended by
 * this helper. Conversion to a paid Stripe subscription is the only path after
 * expiry.
 */
export async function grantPilotAccess(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<PilotGrantResult> {
  const pilotId = pilotSubscriptionId(organizationId);
  const now = Date.now();

  const { data: existingPilot, error: pilotLookupError } = await supabase
    .from("subscriptions")
    .select("tier, status, trial_end")
    .eq("stripe_subscription_id", pilotId)
    .maybeSingle();

  if (pilotLookupError) throw pilotLookupError;

  if (existingPilot) {
    const trialEndMs = existingPilot.trial_end ? new Date(existingPilot.trial_end).getTime() : 0;
    const active = existingPilot.status === "trialing" && trialEndMs > now;
    return {
      granted: false,
      active,
      alreadyUsed: true,
      tier: existingPilot.tier ?? PILOT_TIER,
      trialEnd: existingPilot.trial_end ?? null,
      reason: active ? "already_active" : "pilot_already_used",
    };
  }

  const { data: activeSubscription, error: activeLookupError } = await supabase
    .from("subscriptions")
    .select("tier, status, trial_end, current_period_end")
    .eq("organization_id", organizationId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeLookupError) throw activeLookupError;

  if (activeSubscription) {
    const trialEnd = activeSubscription.trial_end ?? activeSubscription.current_period_end ?? null;
    return {
      granted: false,
      active: true,
      alreadyUsed: false,
      tier: activeSubscription.tier ?? PILOT_TIER,
      trialEnd,
      reason: "already_active",
    };
  }

  const trialEnd = new Date(now + PILOT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await supabase.from("subscriptions").insert({
    organization_id: organizationId,
    stripe_customer_id: pilotId,
    stripe_subscription_id: pilotId,
    tier: PILOT_TIER,
    status: "trialing",
    price_id: null,
    current_period_end: trialEnd,
    cancel_at_period_end: false,
    is_trial: true,
    trial_end: trialEnd,
    grace_period_end: null,
    payment_failed_at: null,
    billing_interval: "month",
  });

  if (insertError) {
    // A simultaneous second activation can race the unique synthetic ID. Read
    // back the winner rather than creating duplicate access or extending time.
    const { data: racedPilot } = await supabase
      .from("subscriptions")
      .select("tier, status, trial_end")
      .eq("stripe_subscription_id", pilotId)
      .maybeSingle();
    if (!racedPilot) throw insertError;
    const racedEndMs = racedPilot.trial_end ? new Date(racedPilot.trial_end).getTime() : 0;
    return {
      granted: false,
      active: racedPilot.status === "trialing" && racedEndMs > Date.now(),
      alreadyUsed: true,
      tier: racedPilot.tier ?? PILOT_TIER,
      trialEnd: racedPilot.trial_end ?? null,
      reason: "already_active",
    };
  }

  return {
    granted: true,
    active: true,
    alreadyUsed: false,
    tier: PILOT_TIER,
    trialEnd,
    reason: "granted",
  };
}
