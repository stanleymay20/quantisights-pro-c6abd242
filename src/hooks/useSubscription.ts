import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import type { TierKey } from "@/lib/stripe-tiers";
import {
  createUnavailableSubscriptionEvidence,
  maskSubscriptionEvidenceForScope,
  type SubscriptionEvidence,
} from "@/lib/subscription-evidence";

export const useSubscription = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const [state, setState] = useState<SubscriptionEvidence>(() =>
    createUnavailableSubscriptionEvidence({ loading: true }),
  );
  const requestSeq = useRef(0);

  const checkSubscription = useCallback(async () => {
    const seq = ++requestSeq.current;
    const scopeOrgId = currentOrgId;

    if (!user || !scopeOrgId) {
      setState(createUnavailableSubscriptionEvidence({ loading: false }));
      return;
    }

    // Clear all values from the previous organization before this scope is
    // verified. Unknown entitlement must never inherit paid access.
    setState(createUnavailableSubscriptionEvidence({
      organizationId: scopeOrgId,
      loading: true,
    }));

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, status, stripe_subscription_id, current_period_end, is_trial, trial_end, grace_period_end, payment_failed_at, billing_interval")
        .eq("organization_id", scopeOrgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (seq !== requestSeq.current) return;

      const now = Date.now();
      const graceEnd = data?.grace_period_end ? new Date(data.grace_period_end).getTime() : 0;
      const trialEnd = data?.trial_end ? new Date(data.trial_end).getTime() : 0;
      const trialActive = data?.status === "trialing" && trialEnd > now;
      const inGrace = graceEnd > now && data?.status !== "active" && data?.status !== "trialing";
      const isActive = data?.status === "active" || trialActive || inGrace;
      const isPilot = Boolean(data?.stripe_subscription_id?.startsWith("pilot_"));

      setState({
        subscribed: Boolean(data && isActive),
        tier: (data?.tier as TierKey) ?? null,
        subscriptionEnd: data?.current_period_end ?? null,
        isTrial: data?.is_trial ?? false,
        trialEnd: data?.trial_end ?? null,
        isPilot,
        inGracePeriod: inGrace,
        gracePeriodEnd: data?.grace_period_end ?? null,
        paymentFailed: Boolean(data?.payment_failed_at),
        billingInterval: (data?.billing_interval as "month" | "year") ?? null,
        status: data?.status ?? null,
        hasSubscriptionRecord: Boolean(data),
        loading: false,
        error: null,
        evidenceReady: true,
        organizationId: scopeOrgId,
      });

      // Reconcile real Stripe subscriptions in the background. Synthetic
      // pilot_<org> rows deliberately never touch Stripe; reconciling those
      // would turn a healthy no-card pilot into a false "not subscribed" state.
      if (isActive && !isPilot) {
        supabase.functions.invoke("check-subscription").catch(() => { /* best-effort */ });
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      console.error("[useSubscription] Failed to check subscription:", err instanceof Error ? err.message : err);
      setState(createUnavailableSubscriptionEvidence({
        organizationId: scopeOrgId,
        loading: false,
        error: "Unable to verify subscription access.",
      }));
    }
  }, [user, currentOrgId]);

  useEffect(() => {
    void checkSubscription();

    if (!currentOrgId) {
      return () => {
        requestSeq.current += 1;
      };
    }

    const unsubscribe = createSafeChannel(`sub-${currentOrgId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `organization_id=eq.${currentOrgId}` },
        () => void checkSubscription(),
      )
      .subscribe(),
    );

    return () => {
      requestSeq.current += 1;
      unsubscribe();
    };
  }, [checkSubscription, currentOrgId]);

  const safeState = maskSubscriptionEvidenceForScope(
    state,
    currentOrgId,
    Boolean(user),
  );

  return { ...safeState, refresh: checkSubscription };
};
