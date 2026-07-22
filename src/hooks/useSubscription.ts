import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createSafeChannel } from "@/lib/realtime-channel";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { TierKey } from "@/lib/stripe-tiers";

interface SubscriptionState {
  subscribed: boolean;
  tier: TierKey | null;
  subscriptionEnd: string | null;
  isTrial: boolean;
  trialEnd: string | null;
  inGracePeriod: boolean;
  gracePeriodEnd: string | null;
  paymentFailed: boolean;
  billingInterval: "month" | "year" | null;
  loading: boolean;
}

export const useSubscription = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    tier: null,
    subscriptionEnd: null,
    isTrial: false,
    trialEnd: null,
    inGracePeriod: false,
    gracePeriodEnd: null,
    paymentFailed: false,
    billingInterval: null,
    loading: true,
  });

  const checkSubscription = useCallback(async () => {
    if (!user || !currentOrgId) {
      setState({
        subscribed: false, tier: null, subscriptionEnd: null,
        isTrial: false, trialEnd: null, inGracePeriod: false,
        gracePeriodEnd: null, paymentFailed: false, billingInterval: null,
        loading: false,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, status, current_period_end, is_trial, trial_end, grace_period_end, payment_failed_at, billing_interval")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      const now = Date.now();
      const graceEnd = data?.grace_period_end ? new Date(data.grace_period_end).getTime() : 0;
      const inGrace = graceEnd > now && data?.status !== "active" && data?.status !== "trialing";
      const isActive = data?.status === "active" || data?.status === "trialing" || inGrace;

      setState({
        subscribed: !!data && isActive,
        tier: (data?.tier as TierKey) ?? null,
        subscriptionEnd: data?.current_period_end ?? null,
        isTrial: data?.is_trial ?? false,
        trialEnd: data?.trial_end ?? null,
        inGracePeriod: inGrace,
        gracePeriodEnd: data?.grace_period_end ?? null,
        paymentFailed: !!data?.payment_failed_at,
        billingInterval: (data?.billing_interval as "month" | "year") ?? null,
        loading: false,
      });

      // Reconcile against Stripe in the background. stripe-webhook keeps
      // current_period_end current going forward, but a missed or
      // never-fired webhook leaves this row stuck indefinitely with no
      // self-heal -- reported live as a "next billing" date months in the
      // past for an active subscription. check-subscription queries Stripe
      // directly and corrects drift; the realtime subscription below
      // picks up any resulting write and refreshes state automatically.
      if (isActive) {
        supabase.functions.invoke("check-subscription").catch(() => { /* best-effort */ });
      }
    } catch (err) {
      console.error("[useSubscription] Failed to check subscription:", err instanceof Error ? err.message : err);
      setState((s) => ({ ...s, loading: false }));
    }
  }, [user, currentOrgId]);

  useEffect(() => {
    checkSubscription();

    // Listen for realtime changes
    if (!currentOrgId) return;
    return createSafeChannel(`sub-${currentOrgId}`, (channel) =>
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `organization_id=eq.${currentOrgId}` },
        () => checkSubscription()
      )
      .subscribe()
    );
  }, [checkSubscription, currentOrgId]);

  return { ...state, refresh: checkSubscription };
};
