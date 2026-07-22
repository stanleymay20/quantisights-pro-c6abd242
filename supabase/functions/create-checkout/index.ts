import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// P0 FIX: Added live production domains (www.quantivis.io + quantivis.io)
// Previously missing — redirect after payment went to wrong URL
const ALLOWED_ORIGINS = [
  "https://www.quantivis.io",
  "https://quantivis.io",
  "https://quantisights-pro.lovable.app",
  "https://id-preview--28b43e06-9231-4c54-bc18-a49be01a6516.lovable.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  const match = ALLOWED_ORIGINS.find(o => origin.startsWith(o));
  // Always prefer the actual origin if it's in the allowlist
  return match ? origin : "https://www.quantivis.io";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const body = await req.json();
    const { priceId, wantsAnnual } = body as { priceId: string; wantsAnnual?: boolean };
    if (!priceId) throw new Error("priceId is required");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Check if customer already had a trial (only offer trial to new subscribers)
    let hadTrial = false;
    if (customerId) {
      const existingSubs = await stripe.subscriptions.list({
        customer: customerId,
        limit: 10,
      });
      hadTrial = existingSubs.data.some(
        (s: any) => s.trial_start !== null || s.status === "trialing"
      );
    }

    const allowedOrigin = getAllowedOrigin(req);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Stripe Tax — handles EU VAT, German USt, UK VAT, US sales tax automatically
      automatic_tax: { enabled: true },
      // Allow customers to update billing address (needed for tax calculation)
      customer_update: customerId ? { address: "auto" } : undefined,
      // Stripe handles local payment methods where supported
      payment_method_collection: "if_required",
      subscription_data: {
        ...(hadTrial ? {} : { trial_period_days: 14 }),
        // Tag if customer wanted annual so sales team can follow up
        metadata: { wants_annual: wantsAnnual ? "true" : "false", source: "quantivis_web" },
      },
      // Promotional codes — allows discount codes at checkout
      allow_promotion_codes: true,
      success_url: `${allowedOrigin}/dashboard?checkout=success`,
      cancel_url: `${allowedOrigin}/pricing`,
      // Collect billing address for tax purposes
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
