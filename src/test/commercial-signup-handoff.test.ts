import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const register = read("src/pages/Register.tsx");
const authContext = read("src/contexts/AuthContext.tsx");
const authCallback = read("src/pages/AuthCallback.tsx");
const onboarding = read("src/pages/Onboarding.tsx");
const intent = read("src/lib/commercial-intent.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const confirm = read("supabase/functions/confirm-checkout/index.ts");
const config = read("supabase/config.toml");

describe("commercial signup handoff", () => {
  it("persists only allow-listed plan and billing navigation intent", () => {
    expect(intent).toContain('value === "starter" || value === "growth"');
    expect(intent).toContain('parsed.billingInterval === "month" || parsed.billingInterval === "year"');
    expect(intent).toContain("COMMERCIAL_INTENT_TTL_MS");
    expect(register).toContain("saveCommercialSignupIntent(selectedPlan, selectedBillingInterval)");
    expect(register).toContain("clearCommercialSignupIntent()");
  });

  it("does not use user-editable auth metadata as signup authority", () => {
    expect(authContext).not.toContain("quantivis_onboarding_started");
    expect(authCallback).not.toContain("quantivis_onboarding_started");
    expect(authCallback).not.toContain("supabase.auth.updateUser");
    expect(authCallback).toContain("opaque server-issued intent");
  });

  it("resumes a selected paid plan only after server-verified tenant provisioning", () => {
    expect(onboarding).toContain("hasVerifiedSignupProvenance(currentOrgId)");
    expect(onboarding).toContain("readCommercialSignupIntent()");
    expect(onboarding).toContain('invokeWithRetry<{ url?: string }>("create-checkout"');
    expect(onboarding).toContain("window.location.assign(checkout.url)");
    expect(onboarding).toContain("clearCommercialSignupIntent()");
  });

  it("returns incomplete buyers through exact Checkout Session confirmation", () => {
    expect(checkout).toContain('client_reference_id: organizationId');
    expect(checkout).toContain('purchaser_user_id: user.id');
    expect(checkout).toContain('/onboarding?checkout=success&session_id={CHECKOUT_SESSION_ID}');
    expect(onboarding).toContain('"confirm-checkout"');
    expect(onboarding).toContain("body: { session_id: checkoutSessionId }");
  });

  it("confirms only a completed tenant- and purchaser-bound supported subscription", () => {
    expect(confirm).toContain('session.status !== "complete"');
    expect(confirm).toContain("session.client_reference_id !== organizationId");
    expect(confirm).toContain("session.metadata?.purchaser_user_id !== userId");
    expect(confirm).toContain("subscription.metadata?.organization_id !== organizationId");
    expect(confirm).toContain("PRICE_CATALOG.get(priceId)");
    expect(confirm).toContain('{ onConflict: "stripe_subscription_id" }');
    expect(config).toContain("[functions.confirm-checkout]");
    expect(config).toMatch(/\[functions\.confirm-checkout\]\s+verify_jwt = false/);
  });
});
