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

type SubscriptionRow = {
  tier: string | null;
  status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  is_trial: boolean | null;
  trial_end: string | null;
  grace_period_end: string | null;
  payment_failed_at: string | null;
  billing_interval: string | null;
  created_at: string;
};

const timeMs = (value: string | null | undefined): number => value ? new Date(value).getTime() : 0;

const selectEffectiveSubscription = (rows: SubscriptionRow[], now: number): SubscriptionRow | null => {
  if (rows.length === 0) return null;

  const active = rows.find((row) => row.status === "active");
  if (active) return active;

  const liveTrial = rows.find((row) => row.status === "trialing" && timeMs(row.trial_end) > now);
  if (liveTrial) return liveTrial;

  const liveGrace = rows.find((row) =>
    row.status !== "active"
    && row.status !== "trialing"
    && timeMs(row.grace_period_end) > now,
  );
  if (liveGrace) return liveGrace;

  // Rows are fetched newest-first. When nothing grants access, return the newest
  // historical record for truthful expired/canceled messaging.
  return rows[0];
};

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

    setState(createUnavailableSubscriptionEvidence({
      organizationId: scopeOrgId,
      loading: true,
    }));

    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("tier, status, stripe_subscription_id, current_period_end, is_trial, trial_end, grace_period_end, payment_failed_at, billing_interval, created_at")
        .eq("organization_id", scopeOrgId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (seq !== requestSeq.current) return;

      const rows = (data ?? []) as SubscriptionRow[];
      const now = Date.now();
      const selected = selectEffectiveSubscription(rows, now);
      const graceEnd = timeMs(selected?.grace_period_end);
      const trialEnd = timeMs(selected?.trial_end);
      const trialActive = selected?.status === "trialing" && trialEnd > now;
      const inGrace = graceEnd > now && selected?.status !== "active" && selected?.status !== "trialing";
      const isActive = selected?.status === "active" || trialActive || inGrace;
      const isPilot = Boolean(selected?.stripe_subscription_id?.startsWith("pilot_"));

      setState({
        subscribed: Boolean(selected && isActive),
        tier: (selected?.tier as TierKey) ?? null,
        subscriptionEnd: selected?.current_period_end ?? null,
        isTrial: selected?.is_trial ?? false,
        trialEnd: selected?.trial_end ?? null,
        isPilot,
        inGracePeriod: inGrace,
        gracePeriodEnd: selected?.grace_period_end ?? null,
        paymentFailed: Boolean(selected?.payment_failed_at),
        billingInterval: (selected?.billing_interval as "month" | "year") ?? null,
        status: selected?.status ?? null,
        hasSubscriptionRecord: rows.length > 0,
        loading: false,
        error: null,
        evidenceReady: true,
        organizationId: scopeOrgId,
      });

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
