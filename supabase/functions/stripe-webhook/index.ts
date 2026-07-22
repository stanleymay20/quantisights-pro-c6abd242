import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const TIERS: Record<string, string> = {
  "prod_U4SdCda1dcZAtu": "starter",
  "prod_UB202T0yfALsxx": "growth",
  "prod_U1oN5CDeptb9uY": "enterprise",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

// Resolve subscription id from invoice across API versions.
// Newer Stripe API moves it to invoice.parent.subscription_details.subscription.
function getSubIdFromInvoice(invoice: any): string | null {
  if (typeof invoice?.subscription === "string") return invoice.subscription;
  const fromParent = invoice?.parent?.subscription_details?.subscription;
  if (typeof fromParent === "string") return fromParent;
  return null;
}

// Lookup auth user by email using GoTrue admin REST endpoint
// (the JS client's listUsers does NOT support an email filter — it silently ignores it).
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

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  try {
    const body = await req.text();
    const sig = req.headers.get("stripe-signature")!;
    const event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);

    logStep("Event received", { type: event.type, id: event.id });

    // Org-independent idempotency. Insert first; ON CONFLICT short-circuits duplicates.
    const { error: dedupeError } = await supabase
      .from("stripe_processed_events")
      .insert({ event_id: event.id, event_type: event.type });

    if (dedupeError) {
      // Unique-violation = already processed
      if ((dedupeError as any).code === "23505") {
        logStep("Duplicate event, skipping", { eventId: event.id });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      // Any other DB error: fail loud so Stripe retries.
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
          .update({
            payment_failed_at: new Date().toISOString(),
            grace_period_end: graceEnd,
            status: "past_due",
          })
          .eq("stripe_subscription_id", subId);

        if (error) logStep("payment_failed update error", error);
        else logStep("Payment failed → grace period set", { subId, graceEnd });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = getSubIdFromInvoice(invoice);
        if (!subId) {
          logStep("invoice.payment_succeeded: no subscription id on invoice");
          break;
        }

        // current_period_end was previously only updated by
        // checkout.session.completed (fires once, at signup) and
        // customer.subscription.updated -- which Stripe does not
        // reliably fire on a simple renewal charge with no plan/item
        // changes. That left current_period_end stuck at its initial
        // value indefinitely for a subscription that just kept renewing
        // normally, showing a "next billing" date months in the past for
        // an active, paying customer. invoice.payment_succeeded fires on
        // every successful recurring charge, so re-fetch the subscription
        // here and advance it -- the one signal renewal reliably sends.
        let periodEndUpdate: { current_period_end?: string } = {};
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          periodEndUpdate = { current_period_end: new Date(sub.current_period_end * 1000).toISOString() };
        } catch (fetchErr) {
          logStep("payment_succeeded: could not refetch subscription for period_end", { subId, err: String(fetchErr) });
        }

        const { error } = await supabase
          .from("subscriptions")
          .update({
            payment_failed_at: null,
            grace_period_end: null,
            status: "active",
            ...periodEndUpdate,
          })
          .eq("stripe_subscription_id", subId);

        if (error) logStep("payment_succeeded update error", error);
        else logStep("Payment succeeded → grace period cleared", { subId, ...periodEndUpdate });
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const customerEmail = session.customer_details?.email ?? session.customer_email;

        if (!customerEmail) {
          logStep("No customer email found, skipping");
          break;
        }

        const authUser = await findAuthUserByEmail(customerEmail);
        if (!authUser) {
          logStep("No auth user found for email", { customerEmail });
          break;
        }

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("user_id", authUser.id)
          .single();

        if (!userProfile?.organization_id) {
          logStep("No org found for user", { userId: authUser.id });
          break;
        }

        // Fetch subscription details from Stripe
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const productId = sub.items.data[0].price.product as string;
        const tier = TIERS[productId] ?? "starter";
        const isTrial = sub.status === "trialing";

        const { error } = await supabase.from("subscriptions").upsert(
          {
            organization_id: userProfile.organization_id,
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
          { onConflict: "stripe_subscription_id" }
        );

        if (error) logStep("Upsert error", error);
        else logStep("Subscription upserted", { tier, orgId: userProfile.organization_id });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const productId = sub.items.data[0].price.product as string;
        const tier = TIERS[productId] ?? "starter";
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

        if (error) logStep("Update error", error);
        else logStep("Subscription updated", { tier, status: sub.status });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        const { error } = await supabase
          .from("subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);

        if (error) logStep("Delete-update error", error);
        else logStep("Subscription canceled", { subId: sub.id });
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
