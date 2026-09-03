import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsPreflightResponse, getAllowedRequestOrigin, getCorsHeaders } from "../_shared/cors.ts";

const PRICE_CATALOG = new Map<string, { tier: "starter" | "growth"; interval: "month" | "year" }>([
  ["price_1T6Ji8JYFIBeCvef4RkHSCfw", { tier: "starter", interval: "month" }],
  ["price_1TiqhyJYFIBeCvefcRRwNfor", { tier: "starter", interval: "year" }],
  ["price_1TCfwlJYFIBeCvefvzY9z5m9", { tier: "growth", interval: "month" }],
  ["price_1TiqiLJYFIBeCvef3CEFlzIL", { tier: "growth", interval: "year" }],
]);

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const allowedOrigin = getAllowedRequestOrigin(req);
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: "Checkout confirmation is not available from this origin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
      throw new Error("Checkout confirmation runtime configuration is unavailable");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid auth token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId.startsWith("cs_")) {
      return new Response(JSON.stringify({ error: "Valid Stripe Checkout session required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "Verified organization required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const organizationId = profile.organization_id;

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Only an organization owner or admin can confirm billing" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.mode !== "subscription" || session.status !== "complete") {
      return new Response(JSON.stringify({ error: "Stripe Checkout has not completed" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      session.client_reference_id !== organizationId
      || session.metadata?.organization_id !== organizationId
      || session.metadata?.purchaser_user_id !== userId
    ) {
      return new Response(JSON.stringify({ error: "Checkout session does not belong to this Quantivis tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerId = typeof session.customer === "string" ? session.customer : null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    if (!customerId || !subscriptionId) {
      throw new Error("Completed checkout is missing Stripe customer or subscription attribution");
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (
      subscription.metadata?.organization_id !== organizationId
      || subscription.metadata?.purchaser_user_id !== userId
    ) {
      return new Response(JSON.stringify({ error: "Stripe subscription does not belong to this Quantivis tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const priceId = subscription.items.data[0]?.price.id;
    const catalogEntry = priceId ? PRICE_CATALOG.get(priceId) : undefined;
    if (!priceId || !catalogEntry) {
      throw new Error("Stripe subscription uses an unsupported Quantivis price");
    }

    const { data: existing, error: existingError } = await supabase
      .from("subscriptions")
      .select("organization_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.organization_id && existing.organization_id !== organizationId) {
      throw new Error("Stripe subscription is already linked to a different organization");
    }

    const isTrial = subscription.status === "trialing";
    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        organization_id: organizationId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        tier: catalogEntry.tier,
        status: subscription.status,
        price_id: priceId,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        cancel_at_period_end: subscription.cancel_at_period_end,
        is_trial: isTrial,
        trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        billing_interval: catalogEntry.interval,
        payment_failed_at: null,
        grace_period_end: null,
        canceled_at: null,
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (upsertError) throw new Error(`Checkout subscription sync failed: ${upsertError.message}`);

    return new Response(JSON.stringify({
      confirmed: true,
      organization_id: organizationId,
      subscription_id: subscriptionId,
      tier: catalogEntry.tier,
      billing_interval: catalogEntry.interval,
      status: subscription.status,
      is_trial: isTrial,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
