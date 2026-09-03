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
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { priceId } = body as { priceId?: string };
    const catalogEntry = priceId ? PRICE_CATALOG.get(priceId) : undefined;
    if (!priceId || !catalogEntry) {
      return new Response(JSON.stringify({ error: "Unsupported Quantivis price" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Billing authority is organization-scoped. A normal member cannot create a
    // paid subscription for the tenant, and an identity with no verified tenant
    // cannot reach checkout at all.
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

    const { data: membership, error: membershipError } = await supabaseClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", profile.organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return new Response(JSON.stringify({ error: "Only an organization owner or admin can start billing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    let hadTrial = false;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      const existingSubs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
      const activeSubscription = existingSubs.data.find(
        (s: any) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
      );
      if (activeSubscription) {
        return new Response(JSON.stringify({ error: "An active subscription already exists. Manage it from Billing." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
      hadTrial = existingSubs.data.some((s: any) => s.trial_start !== null || s.status === "trialing");
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      automatic_tax: { enabled: true },
      customer_update: customerId ? { address: "auto" } : undefined,
      payment_method_collection: "if_required",
      subscription_data: {
        ...(hadTrial ? {} : { trial_period_days: 14 }),
        metadata: {
          billing_interval: catalogEntry.interval,
          tier: catalogEntry.tier,
          source: "quantivis_web",
          organization_id: profile.organization_id,
        },
      },
      allow_promotion_codes: true,
      success_url: `${allowedOrigin}/dashboard?checkout=success`,
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
