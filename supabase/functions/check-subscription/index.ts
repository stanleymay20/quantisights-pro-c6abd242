import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const organizationId = profile.organization_id;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Prefer a currently relevant organisation-linked row. Historical canceled
    // rows must not hide an older live subscription for the same tenant.
    const { data: storedSubscriptions, error: storedError } = await supabaseClient
      .from("subscriptions")
      .select("stripe_subscription_id,status,trial_end,grace_period_end,current_period_end,cancel_at_period_end")
      .eq("organization_id", organizationId)
      .not("stripe_subscription_id", "like", "pilot_%")
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (storedError) throw storedError;

    let subscription: Stripe.Subscription | null = null;
    let linkedState: {
      stripe_subscription_id: string;
      status: string;
      trial_end: string | null;
      grace_period_end: string | null;
      current_period_end: string | null;
      cancel_at_period_end: boolean;
    } | null = null;

    for (const stored of storedSubscriptions ?? []) {
      try {
        const candidate = await stripe.subscriptions.retrieve(stored.stripe_subscription_id);
        if (candidate.metadata?.organization_id && candidate.metadata.organization_id !== organizationId) {
          throw new Error("Stored Stripe subscription organization metadata does not match the authenticated tenant");
        }
        subscription = candidate;
        linkedState = stored as typeof linkedState;
        break;
      } catch (err) {
        console.error(
          "[check-subscription] stored Stripe subscription fetch failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Legacy/recovery fallback: email only discovers candidate Stripe customers;
    // it never establishes tenant authority. The subscription itself must carry
    // the exact organization metadata authored by Quantivis checkout. past_due
    // is intentionally excluded here because grace-period authority lives in
    // the tenant subscription ledger, not in Stripe alone.
    if (!subscription) {
      const customers = await stripe.customers.list({ email: user.email, limit: 3 });
      for (const customer of customers.data) {
        const subscriptions = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
        const now = Date.now();
        const candidate = subscriptions.data.find((s: any) => {
          const trialActive = s.status === "trialing" && Boolean(s.trial_end) && s.trial_end * 1000 > now;
          return (s.status === "active" || trialActive)
            && s.metadata?.organization_id === organizationId;
        });
        if (candidate) {
          subscription = candidate;
          break;
        }
      }
    }

    if (!subscription) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (subscription.metadata?.organization_id && subscription.metadata.organization_id !== organizationId) {
      throw new Error("Stripe subscription organization metadata does not match the authenticated tenant");
    }

    const now = Date.now();
    const stripeTrialEnd = subscription.trial_end ? subscription.trial_end * 1000 : 0;
    const trialActive = subscription.status === "trialing" && stripeTrialEnd > now;
    const graceEnd = linkedState?.grace_period_end ? Date.parse(linkedState.grace_period_end) : 0;
    const inGrace = subscription.status === "past_due" && Number.isFinite(graceEnd) && graceEnd > now;
    const active = subscription.status === "active" || trialActive || inGrace;
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const productId = subscription.items.data[0]?.price.product as string | undefined;
    const isTrial = subscription.status === "trialing";

    // Reconcile only an already-linked row. The signed webhook or an explicit
    // verified Checkout Session confirmation remains the authority that creates
    // the organization/subscription relationship.
    const { data: existing, error: existingError } = await supabaseClient
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("organization_id", organizationId)
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const driftDetected = existing.status !== subscription.status
        || existing.current_period_end !== subscriptionEnd
        || existing.cancel_at_period_end !== subscription.cancel_at_period_end;
      if (driftDetected) {
        const { error: reconcileErr } = await supabaseClient
          .from("subscriptions")
          .update({
            status: subscription.status,
            current_period_end: subscriptionEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
          })
          .eq("organization_id", organizationId)
          .eq("stripe_subscription_id", subscription.id);
        if (reconcileErr) throw new Error(`Subscription reconciliation failed: ${reconcileErr.message}`);
      }
    }

    return new Response(JSON.stringify({
      subscribed: active,
      product_id: productId ?? null,
      subscription_end: subscriptionEnd,
      is_trial: isTrial,
      trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
      in_grace_period: inGrace,
      grace_period_end: linkedState?.grace_period_end ?? null,
      status: subscription.status,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error instanceof Error ? error.message : String(error)) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
