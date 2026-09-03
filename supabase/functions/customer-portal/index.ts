import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { corsPreflightResponse, getAllowedRequestOrigin, getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const allowedOrigin = getAllowedRequestOrigin(req);
    if (!allowedOrigin) {
      return new Response(JSON.stringify({ error: "Billing portal is not available from this origin" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.id) throw new Error("User not authenticated");

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("organization_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: "Verified organization required" }), {
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
      return new Response(JSON.stringify({ error: "Only an organization owner or admin can manage billing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const { data: subscriptions, error: subscriptionError } = await supabaseClient
      .from("subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, trial_end, grace_period_end, created_at")
      .eq("organization_id", organizationId)
      .not("stripe_subscription_id", "like", "pilot_%")
      .order("created_at", { ascending: false })
      .limit(50);
    if (subscriptionError) throw subscriptionError;

    const now = Date.now();
    const ranked = [...(subscriptions ?? [])].sort((a: any, b: any) => {
      const rank = (row: any) => {
        if (row.status === "active") return 0;
        const trialEnd = row.trial_end ? Date.parse(row.trial_end) : 0;
        if (row.status === "trialing" && Number.isFinite(trialEnd) && trialEnd > now) return 1;
        if (row.status === "past_due") return 2;
        return 3;
      };
      const rankDelta = rank(a) - rank(b);
      if (rankDelta !== 0) return rankDelta;
      return Date.parse(b.created_at) - Date.parse(a.created_at);
    });

    if (!ranked.length) {
      return new Response(JSON.stringify({ error: "No paid Stripe billing relationship is linked to this organization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let customerId: string | null = null;

    // A stale/deleted historical Stripe customer must not mask another valid
    // organization-linked billing relationship.
    for (const row of ranked) {
      if (typeof row.stripe_customer_id !== "string" || !row.stripe_customer_id.startsWith("cus_")) continue;
      try {
        const customer = await stripe.customers.retrieve(row.stripe_customer_id);
        if (!("deleted" in customer && customer.deleted)) {
          customerId = customer.id;
          break;
        }
      } catch (error) {
        console.error(
          "[customer-portal] linked Stripe customer lookup failed:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (!customerId) {
      return new Response(JSON.stringify({ error: "No usable Stripe customer is linked to this organization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${allowedOrigin}/billing`,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
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
