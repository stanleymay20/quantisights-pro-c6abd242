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

const isBlockingSubscription = (subscription: {
  status?: string | null;
  trial_end?: string | null;
}): boolean => {
  if (subscription.status === "active" || subscription.status === "past_due") return true;
  if (subscription.status !== "trialing") return false;
  if (!subscription.trial_end) return true;
  return new Date(subscription.trial_end).getTime() > Date.now();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const allowedOrigin = getAllowedRequestOrigin(req);
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: "Checkout is not available from this origin" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service configuration is unavailable");

    const supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id || !user.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { priceId } = body as { priceId?: string };
    const catalogEntry = priceId ? PRICE_CATALOG.get(priceId) : undefined;
    if (!priceId || !catalogEntry) {
      return new Response(JSON.stringify({ error: "Unsupported Quantivis price" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "Verified organization required before checkout" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }
    const organizationId = profile.organization_id;

    const { data: membership, error: membershipError } = await supabaseClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Only an organization owner or admin can start billing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { data: organization, error: organizationError } = await supabaseClient
      .from("organizations")
      .select("onboarding_completed")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) throw new Error("Verified organization could not be loaded");

    // Billing history is organization-scoped. Never discover a reusable Stripe
    // customer merely by the purchaser's email address.
    const { data: subscriptionHistory, error: historyError } = await supabaseClient
      .from("subscriptions")
      .select("stripe_customer_id,stripe_subscription_id,status,is_trial,trial_end,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (historyError) throw historyError;

    const history = subscriptionHistory ?? [];
    const pilotRecord = history.find((row: any) => row.stripe_subscription_id === `pilot_${organizationId}`);
    const blockingStoredSubscription = history.find(
      (row: any) => !String(row.stripe_subscription_id ?? "").startsWith("pilot_") && isBlockingSubscription(row),
    );
    if (blockingStoredSubscription) {
      return new Response(JSON.stringify({ error: "An active subscription already exists. Manage it from Billing." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 409,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    let customerId: string | undefined;
    const linkedCustomer = history.find(
      (row: any) =>
        !String(row.stripe_subscription_id ?? "").startsWith("pilot_")
        && typeof row.stripe_customer_id === "string"
        && row.stripe_customer_id.startsWith("cus_"),
    );

    if (linkedCustomer?.stripe_customer_id) {
      try {
        const customer = await stripe.customers.retrieve(linkedCustomer.stripe_customer_id);
        if (!("deleted" in customer && customer.deleted)) {
          customerId = customer.id;
        }
      } catch (error) {
        console.error("[create-checkout] linked Stripe customer could not be retrieved:", error instanceof Error ? error.message : String(error));
      }
    }

    // Defense against webhook lag: when a trusted organization-linked customer
    // exists, Stripe itself must not already contain a live subscription for this org.
    let hadTrustedStripeTrial = false;
    if (customerId) {
      const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 100 });
      const trustedOrgSubs = existingSubs.data.filter(
        (subscription: any) => subscription.metadata?.organization_id === organizationId,
      );
      const activeSubscription = trustedOrgSubs.find((subscription: any) => {
        if (subscription.status === "active" || subscription.status === "past_due") return true;
        if (subscription.status !== "trialing") return false;
        return !subscription.trial_end || subscription.trial_end * 1000 > Date.now();
      });
      if (activeSubscription) {
        return new Response(JSON.stringify({ error: "An active subscription already exists. Manage it from Billing." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      hadTrustedStripeTrial = trustedOrgSubs.some(
        (subscription: any) => subscription.trial_start !== null || subscription.trial_end !== null,
      );
    }

    // Quantivis offers one evaluation path per organization. A prior no-card
    // pilot or paid-checkout trial means the next checkout starts paid access
    // immediately rather than silently stacking another trial.
    const hadRecordedTrial = history.some((row: any) => row.is_trial === true);
    const trialAlreadyUsed = Boolean(pilotRecord) || hadRecordedTrial || hadTrustedStripeTrial;

    const successPath = organization.onboarding_completed
      ? "/dashboard?checkout=success"
      : "/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: organizationId,
      metadata: {
        organization_id: organizationId,
        purchaser_user_id: user.id,
      },
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      automatic_tax: { enabled: true },
      customer_update: customerId ? { address: "auto" } : undefined,
      payment_method_collection: "if_required",
      subscription_data: {
        ...(trialAlreadyUsed ? {} : { trial_period_days: 14 }),
        metadata: {
          billing_interval: catalogEntry.interval,
          tier: catalogEntry.tier,
          source: "quantivis_web",
          organization_id: organizationId,
          purchaser_user_id: user.id,
          prior_pilot_used: pilotRecord ? "true" : "false",
          prior_evaluation_used: trialAlreadyUsed ? "true" : "false",
        },
      },
      allow_promotion_codes: true,
      success_url: `${allowedOrigin}${successPath}`,
      cancel_url: `${allowedOrigin}/pricing`,
      billing_address_collection: "required",
    });

    return new Response(JSON.stringify({ url: session.url }), {
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
