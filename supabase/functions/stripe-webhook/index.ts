import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const TIERS: Record<string, "starter" | "growth" | "enterprise"> = {
  "prod_U4SdCda1dcZAtu": "starter",
  "prod_UB202T0yfALsxx": "growth",
  "prod_U1oN5CDeptb9uY": "enterprise",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

function tierForProduct(productId: string): "starter" | "growth" | "enterprise" | null {
  return TIERS[productId] ?? null;
}

// Resolve subscription id from invoice across API versions.
function getSubIdFromInvoice(invoice: any): string | null {
  if (typeof invoice?.subscription === "string") return invoice.subscription;
  const fromParent = invoice?.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  return null;
}

// Lookup auth user by email using GoTrue admin REST endpoint.
async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const url = `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, {
    headers: {
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
    },
  });
  if (!res.ok) {
    logStep("admin/users lookup failed", { status: res.status });
    return null;
  }
  const body = await res.json();
  const users = body?.users ?? [];
  const match = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
  return match ? { id: match.id, email: match.email } : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Stripe webhook runtime configuration is incomplete" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) throw new Error("Missing Stripe signature");
    const event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);

    logStep("Event received", { type: event.type, id: event.id });

    const { error: dedupeError } = await supabase
      .from("stripe_processed_events")
      .insert({ event_id: event.id, event_type: event.type });

    if (dedupeError) {
      if ((dedupeError as any).code === "23505") {
        logStep("Duplicate event, skipping", { eventId: event.id });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      throw new Error(`Idempotency insert failed: ${dedupeError.message}`);
    }

    const GRACE_PERIOD_DAYS = 7;

    switch (event.type) {
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubIdFromInvoice(invoice);
        if (!subId) {
          logStep("invoice.payment_failed: no subscription id on invoice");
          break;
        }
        const graceEnd = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase
          .from("subscriptions")
          .update({ payment_failed_at: new Date().toISOString(), grace_period_end: graceEnd, status: "past_due" })
          .eq("stripe_subscription_id", subId);
        if (error) throw new Error(`payment_failed update failed: ${error.message}`);
        logStep("Payment failed → grace period set", { subId, graceEnd });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubIdFromInvoice(invoice);
        if (!subId) {
          logStep("invoice.payment_succeeded: no subscription id on invoice");
          break;
        }

        let periodEndUpdate: { current_period_end?: string } = {};
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          periodEndUpdate = { current_period_end: new Date(sub.current_period_end * 1000).toISOString() };
        } catch (fetchErr) {
          logStep("payment_succeeded: could not refetch subscription for period_end", { subId, err: String(fetchErr) });
        }

        const { error } = await supabase
          .from("subscriptions")
          .update({ payment_failed_at: null, grace_period_end: null, status: "active", ...periodEndUpdate })
          .eq("stripe_subscription_id", subId);
        if (error) throw new Error(`payment_succeeded update failed: ${error.message}`);
        logStep("Payment succeeded → grace period cleared", { subId, ...periodEndUpdate });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId = typeof session.customer === "string" ? session.customer : null;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
        const customerEmail = session.customer_details?.email ?? session.customer_email;
        if (!customerId || !subscriptionId || !customerEmail) {
          throw new Error("Checkout session is missing customer, subscription, or email attribution");
        }

        const authUser = await findAuthUserByEmail(customerEmail);
        if (!authUser) throw new Error("No authenticated Quantivis user found for Stripe customer email");

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const productId = sub.items.data[0]?.price.product as string | undefined;
        if (!productId) throw new Error("Stripe subscription has no product");
        const tier = tierForProduct(productId);
        if (!tier) throw new Error(`Unsupported Stripe product: ${productId}`);

        const metadataOrgId = typeof sub.metadata?.organization_id === "string" && sub.metadata.organization_id
          ? sub.metadata.organization_id
          : null;

        const { data: userProfile, error: profileError } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (profileError) throw new Error(`Profile lookup failed: ${profileError.message}`);
        if (!userProfile?.organization_id) throw new Error("No verified organization found for Stripe purchaser");

        const organizationId = metadataOrgId ?? userProfile.organization_id;
        if (metadataOrgId && metadataOrgId !== userProfile.organization_id) {
          throw new Error("Stripe organization metadata does not match purchaser profile organization");
        }

        const { data: billingMembership, error: membershipError } = await supabase
          .from("organization_members")
          .select("role")
          .eq("organization_id", organizationId)
          .eq("user_id", authUser.id)
          .maybeSingle();
        if (membershipError) throw new Error(`Billing membership lookup failed: ${membershipError.message}`);
        if (!billingMembership || !["owner", "admin"].includes(billingMembership.role)) {
          throw new Error("Stripe purchaser is not an organization owner/admin");
        }

        const isTrial = sub.status === "trialing";
        const { error } = await supabase.from("subscriptions").upsert(
          {
            organization_id: organizationId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            tier,
            status: sub.status,
            price_id: sub.items.data[0].price.id,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            is_trial: isTrial,
            trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            billing_interval: sub.items.data[0].price.recurring?.interval === "year" ? "year" : "month",
            payment_failed_at: null,
            grace_period_end: null,
            canceled_at: null,
          },
          { onConflict: "stripe_subscription_id" },
        );
        if (error) throw new Error(`Subscription upsert failed: ${error.message}`);
        logStep("Subscription upserted", { tier, orgId: organizationId, metadataBound: Boolean(metadataOrgId) });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const productId = sub.items.data[0]?.price.product as string | undefined;
        if (!productId) throw new Error("Updated Stripe subscription has no product");
        const tier = tierForProduct(productId);
        if (!tier) throw new Error(`Unsupported Stripe product: ${productId}`);
        const isTrial = sub.status === "trialing";

        const { error } = await supabase
          .from("subscriptions")
          .update({
            tier,
            status: sub.status,
            price_id: sub.items.data[0].price.id,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            is_trial: isTrial,
            trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
            billing_interval: sub.items.data[0].price.recurring?.interval === "year" ? "year" : "month",
            ...(sub.status === "active" ? { payment_failed_at: null, grace_period_end: null } : {}),
          })
          .eq("stripe_subscription_id", sub.id);
        if (error) throw new Error(`Subscription update failed: ${error.message}`);
        logStep("Subscription updated", { tier, status: sub.status });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const { error } = await supabase
          .from("subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        if (error) throw new Error(`Subscription cancellation update failed: ${error.message}`);
        logStep("Subscription canceled", { subId: sub.id });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
