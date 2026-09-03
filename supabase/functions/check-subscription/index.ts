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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Prefer the organisation-linked subscription recorded by the signed Stripe
    // webhook. This makes subscription truth tenant-scoped rather than user-email scoped.
    const { data: storedSubscription, error: storedError } = await supabaseClient
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("organization_id", profile.organization_id)
      .not("stripe_subscription_id", "like", "pilot_%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (storedError) throw storedError;

    let subscription: Stripe.Subscription | null = null;
    if (storedSubscription?.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(storedSubscription.stripe_subscription_id);
      } catch (err) {
        console.error("[check-subscription] stored Stripe subscription fetch failed:", err instanceof Error ? err.message : String(err));
      }
    }

    // Legacy/recovery fallback: customer-email discovery is never sufficient on
    // its own. The subscription must carry the organization metadata authored by
    // Quantivis checkout and match the verified profile organization.
    if (!subscription) {
      const customers = await stripe.customers.list({ email: user.email, limit: 3 });
      for (const customer of customers.data) {
        const subscriptions = await stripe.subscriptions.list({ customer: customer.id, limit: 10 });
        const candidate = subscriptions.data.find(
          (s: any) =>
            (s.status === "active" || s.status === "trialing" || s.status === "past_due")
            && s.metadata?.organization_id === profile.organization_id,
        );
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

    if (subscription.metadata?.organization_id && subscription.metadata.organization_id !== profile.organization_id) {
      throw new Error("Stripe subscription organization metadata does not match the authenticated tenant");
    }

    const active = subscription.status === "active" || subscription.status === "trialing" || subscription.status === "past_due";
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const productId = subscription.items.data[0]?.price.product as string | undefined;
    const isTrial = subscription.status === "trialing";

    // Reconcile only the already-linked row. The signed webhook remains the
    // authority that creates the organization subscription relationship.
    const { data: existing } = await supabaseClient
      .from("subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("organization_id", profile.organization_id)
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

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
          .eq("organization_id", profile.organization_id)
          .eq("stripe_subscription_id", subscription.id);
        if (reconcileErr) console.error("[check-subscription] reconcile error:", reconcileErr.message);
      }
    }

    return new Response(JSON.stringify({
      subscribed: active,
      product_id: productId ?? null,
      subscription_end: subscriptionEnd,
      is_trial: isTrial,
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
