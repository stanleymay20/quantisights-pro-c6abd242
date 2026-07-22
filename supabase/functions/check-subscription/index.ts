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
    { auth: { persistSession: false } }
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });

    if (customers.data.length === 0) {
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    // Check for active OR trialing subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 5,
    });
    const activeSubs = subscriptions.data.filter(
      (s: any) => s.status === "active" || s.status === "trialing"
    );

    const hasActiveSub = activeSubs.length > 0;
    let productId: string | null = null;
    let subscriptionEnd: string | null = null;
    let isTrial = false;

    if (hasActiveSub) {
      const subscription = activeSubs[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      productId = subscription.items.data[0].price.product as string;
      isTrial = subscription.status === "trialing";

      // Reconcile: stripe-webhook's invoice.payment_succeeded/
      // customer.subscription.updated handlers keep current_period_end
      // current going forward, but a missed or never-configured webhook
      // leaves the row stuck at whatever it was last set to -- with no
      // self-heal until some future event happens to fire. This function
      // is called on every Billing page load (and in the background by
      // useSubscription), so use it to also correct drift directly
      // against Stripe, the source of truth. Only write when something
      // actually changed -- useSubscription's realtime subscription
      // re-runs on any UPDATE regardless of whether values changed, and
      // it re-invokes this function whenever the subscription is active,
      // so an unconditional write would loop forever.
      const { data: existing } = await supabaseClient
        .from("subscriptions")
        .select("status, current_period_end, cancel_at_period_end")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      const driftDetected = !existing
        || existing.status !== subscription.status
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
          .eq("stripe_subscription_id", subscription.id);
        if (reconcileErr) console.error("[check-subscription] reconcile error:", reconcileErr.message);
      }
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
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
