import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

const catalog = read("supabase/functions/_shared/billing-catalog.ts");
const cors = read("supabase/functions/_shared/cors.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const portal = read("supabase/functions/customer-portal/index.ts");
const reconcile = read("supabase/functions/check-subscription/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const confirm = read("supabase/functions/confirm-checkout/index.ts");
const pricing = read("src/pages/Pricing.tsx");
const returnHook = read("src/hooks/useCheckoutConfirmation.ts");
const dashboard = read("src/pages/Dashboard.tsx");
const onboarding = read("src/pages/Onboarding.tsx");
const idempotency = read("supabase/migrations/20260926122015_stripe_event_lease_idempotency.sql");

describe("first paying customer billing boundary", () => {
  it("keeps all self-service Stripe prices server-owned", () => {
    for (const priceId of [
      "price_1T6Ji8JYFIBeCvef4RkHSCfw",
      "price_1TiqhyJYFIBeCvefcRRwNfor",
      "price_1TCfwlJYFIBeCvefvzY9z5m9",
      "price_1TiqiLJYFIBeCvef3CEFlzIL",
    ]) expect(catalog).toContain(priceId);

    expect(checkout).toContain("getSelfServeCatalogEntry(requestedTier, requestedInterval)");
    expect(checkout).not.toContain("const { priceId");
    expect(pricing).toContain('body: { tier: tierKey, interval: annual ? "year" : "month" }');
    expect(pricing).not.toContain("body: { priceId:");
  });

  it("requires exact trusted origin and owner/admin billing authority", () => {
    expect(cors).toContain("return isAllowedOrigin(origin) ? origin : null");
    expect(checkout).toContain("getAllowedRequestOrigin(req)");
    expect(checkout).not.toContain("origin.startsWith");
    expect(checkout).toContain('["owner", "admin"].includes(membership.role)');
    expect(portal).toContain('["owner", "admin"].includes(membership.role)');
  });

  it("binds checkout identity and trial history to the organisation", () => {
    expect(checkout).toContain('.eq("organization_id", organizationId)');
    expect(checkout).toContain("client_reference_id: organizationId");
    expect(checkout).toContain("organization_id: organizationId");
    expect(checkout).toContain("purchaser_user_id: user.id");
    expect(checkout).not.toContain("stripe.customers.list({ email:");
    expect(checkout).toContain("trialAlreadyUsed");
  });

  it("manages billing portal through organisation-linked customers", () => {
    expect(portal).toContain('.from("subscriptions")');
    expect(portal).toContain('.eq("organization_id", organizationId)');
    expect(portal).toContain('.not("stripe_subscription_id", "like", "pilot_%")');
    expect(portal).not.toContain("stripe.customers.list({ email:");
    expect(portal).toContain('return_url: `${allowedOrigin}/billing`');
  });

  it("uses email only as non-authoritative legacy discovery during reconciliation", () => {
    expect(reconcile).toContain("Legacy/recovery fallback: email only discovers candidate Stripe customers");
    expect(reconcile).toContain("s.metadata?.organization_id === organizationId");
    expect(reconcile).toContain('.eq("organization_id", organizationId)');
    expect(reconcile).toContain('.eq("stripe_subscription_id", subscription.id)');
  });

  it("makes webhook attribution tenant-bound and unknown products fail closed", () => {
    expect(webhook).toContain("sub.metadata?.organization_id");
    expect(webhook).toContain("sub.metadata?.purchaser_user_id");
    expect(webhook).toContain('.eq("user_id", purchaserUserId)');
    expect(webhook).toContain('["owner", "admin"].includes(billingMembership.role)');
    expect(webhook).toContain("getTierForProduct(productId)");
    expect(webhook).toContain("Unsupported Stripe product");
    expect(webhook).not.toContain("findAuthUserByEmail");
    expect(webhook).not.toContain('?? "starter"');
  });

  it("uses lease-token Stripe event claims so stale workers cannot clobber retries", () => {
    expect(idempotency).toContain("ADD COLUMN IF NOT EXISTS claim_token uuid");
    expect(idempotency).toContain("status IN ('processing', 'processed', 'failed')");
    expect(idempotency).toContain("clock_timestamp() - interval '5 minutes'");
    expect(idempotency).toContain("stripe_event_claim_not_owned");
    expect(idempotency).toContain("CREATE OR REPLACE FUNCTION billing_control.claim_stripe_event");
    expect(idempotency).toContain("SECURITY DEFINER");
    expect(idempotency).toContain("CREATE OR REPLACE FUNCTION public.claim_stripe_event");
    expect(idempotency).toContain("SECURITY INVOKER");
    expect(idempotency).toContain("GRANT EXECUTE ON FUNCTION public.claim_stripe_event(text, text) TO service_role");
    expect(idempotency).toContain("REVOKE ALL ON FUNCTION public.claim_stripe_event(text, text) FROM PUBLIC, anon, authenticated");

    expect(webhook).toContain('supabase.rpc("claim_stripe_event"');
    expect(webhook).toContain("claim_token");
    expect(webhook).toContain("p_claim_token: claimedEvent.claimToken");
    expect(webhook).toContain('supabase.rpc("complete_stripe_event"');
    expect(webhook).toContain('supabase.rpc("fail_stripe_event"');
  });

  it("provides authenticated checkout-session recovery when webhook delivery lags", () => {
    expect(checkout).toContain("session_id={CHECKOUT_SESSION_ID}");
    expect(confirm).toContain('sessionId.startsWith("cs_")');
    expect(confirm).toContain("session.client_reference_id !== organizationId");
    expect(confirm).toContain("session.metadata?.purchaser_user_id !== userId");
    expect(confirm).toContain("getSelfServeCatalogEntryByPrice(priceId)");
    expect(confirm).toContain("existing.organization_id !== organizationId");
    expect(returnHook).toContain('"confirm-checkout"');
    expect(returnHook).toContain('searchParams.get("session_id")');
    expect(dashboard).toContain("useCheckoutConfirmation()");
    expect(onboarding).toContain("useCheckoutConfirmation()");
  });
});
