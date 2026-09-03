import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260903103000_verified_signup_and_commercial_entitlements.sql");
const hardeningMigration = read("supabase/migrations/20260903122500_commercial_boundary_hardening.sql");
const register = read("src/pages/Register.tsx");
const onboarding = read("src/pages/Onboarding.tsx");
const signupIntent = read("src/lib/signup-intent.ts");
const checkout = read("supabase/functions/create-checkout/index.ts");
const portal = read("supabase/functions/customer-portal/index.ts");
const webhook = read("supabase/functions/stripe-webhook/index.ts");
const cors = read("supabase/functions/_shared/cors.ts");
const tiers = read("src/lib/stripe-tiers.ts");
const featureAccess = read("supabase/functions/_shared/feature-access.ts");
const quotaHook = read("src/hooks/useWorkspaceQuota.ts");

describe("first paying customer readiness", () => {
  it("keeps fresh signup authority server-issued and separate from generic Auth triggers", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS tenant_control.signup_intents");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.begin_signup_intent()");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.provision_verified_signup(p_intent_token uuid)");
    expect(migration).toContain("v_uid uuid := auth.uid()");
    expect(migration).toContain("v_user.email_confirmed_at IS NULL");
    expect(migration).toContain("v_user.created_at < v_intent.created_at");
    expect(migration).not.toContain("v_intent.created_at - interval '15 seconds'");
    expect(migration).toContain("existing_identity_requires_restoration");
    expect(migration).toContain("EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = v_uid)");
    expect(migration).not.toMatch(/CREATE\s+TRIGGER[\s\S]*ON\s+auth\.users/i);
  });

  it("does not expose the private signup-intent ledger to browser roles", () => {
    expect(migration).toContain("REVOKE ALL ON SCHEMA tenant_control FROM anon");
    expect(migration).toContain("REVOKE ALL ON SCHEMA tenant_control FROM authenticated");
    expect(migration).toContain("ALTER TABLE tenant_control.signup_intents ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON tenant_control.signup_intents FROM PUBLIC, anon, authenticated");
  });

  it("requires registration to obtain a server intent before either signup method", () => {
    expect(register).toContain("await beginVerifiedSignupIntent();\n      await signUp(email, password, fullName)");
    expect(register).toMatch(/handleGoogleSignUp[\s\S]*await beginVerifiedSignupIntent\(\);[\s\S]*signInWithOAuth/);
    expect(signupIntent).toContain('rpc("begin_signup_intent")');
    expect(signupIntent).toContain('rpc("provision_verified_signup"');
  });

  it("lets onboarding open only after private server provenance is verified", () => {
    expect(onboarding).toContain("provisionVerifiedSignup(intentToken)");
    expect(onboarding).toContain("hasVerifiedSignupProvenance(currentOrgId)");
    expect(onboarding).toContain('setStatus("restoration")');
    expect(onboarding).toContain('if (status === "ready") return <OnboardingWizard />');
    expect(onboarding).not.toContain("user?.user_metadata?.quantivis_onboarding_started");
    expect(onboarding).not.toContain("quantivis_onboarding_provisioning");
  });

  it("keeps paid checkout on a server-owned catalog and verified org authority", () => {
    for (const priceId of [
      "price_1T6Ji8JYFIBeCvef4RkHSCfw",
      "price_1TiqhyJYFIBeCvefcRRwNfor",
      "price_1TCfwlJYFIBeCvefvzY9z5m9",
      "price_1TiqiLJYFIBeCvef3CEFlzIL",
    ]) expect(checkout).toContain(priceId);

    expect(checkout).toContain("PRICE_CATALOG.get(priceId)");
    expect(checkout).toContain("Unsupported Quantivis price");
    expect(checkout).toContain("getAllowedRequestOrigin(req)");
    expect(checkout).toContain('["owner", "admin"].includes(membership.role)');
    expect(checkout).toContain("An active subscription already exists");
    expect(checkout).not.toContain("origin.startsWith");
  });

  it("binds Stripe customer reuse, trial history and purchaser identity to the organization", () => {
    expect(checkout).toContain('.eq("organization_id", organizationId)');
    expect(checkout).toContain("subscriptionHistory");
    expect(checkout).toContain("purchaser_user_id: user.id");
    expect(checkout).toContain("const trialAlreadyUsed = Boolean(pilotRecord) || hadRecordedTrial || hadTrustedStripeTrial");
    expect(checkout).toContain("...(trialAlreadyUsed ? {} : { trial_period_days: 14 })");
    expect(checkout).not.toContain("stripe.customers.list({ email:");
  });

  it("keeps advertised starter and growth workspace limits synchronized", () => {
    expect(tiers).toContain('"5 user seats"');
    expect(tiers).toContain('"Executive Copilot (20 queries/day)"');
    expect(tiers).toContain('"15 user seats"');
    expect(tiers).toContain('"Unlimited Executive Copilot"');

    expect(migration).toMatch(/WHEN 'starter'[\s\S]*v_datasets := 5;[\s\S]*v_simulations := 5;[\s\S]*v_copilot := 20;[\s\S]*v_seats := 5;/);
    expect(migration).toMatch(/WHEN 'growth'[\s\S]*v_datasets := 50;[\s\S]*v_simulations := 50;[\s\S]*v_copilot := 2147483647;[\s\S]*v_seats := 15;/);
    expect(migration).toContain("AFTER INSERT OR UPDATE OF tier, status ON public.subscriptions");
  });

  it("binds checkout and portal actions to exact allowed origins", () => {
    expect(cors).toContain("STAGING_NETLIFY_PREVIEW.test(origin)");
    expect(cors).toContain("supabaseUrl !== STAGING_SUPABASE_URL");
    expect(portal).toContain("getAllowedRequestOrigin(req)");
    expect(portal).toContain('return_url: `${allowedOrigin}/billing`');
  });

  it("manages billing by organization subscription rather than email-only lookup", () => {
    expect(portal).toContain('.from("subscriptions")');
    expect(portal).toContain("const organizationId = profile.organization_id");
    expect(portal).toContain('.eq("organization_id", organizationId)');
    expect(portal).toContain('.not("stripe_subscription_id", "like", "pilot_%")');
    expect(portal).not.toContain("stripe.customers.list({ email:");
  });

  it("makes Stripe webhook attribution tenant-bound and failures retryable", () => {
    expect(webhook).toContain("sub.metadata?.organization_id");
    expect(webhook).toContain("sub.metadata?.purchaser_user_id");
    expect(webhook).toContain('.eq("user_id", purchaserUserId)');
    expect(webhook).toContain('["owner", "admin"].includes(billingMembership.role)');
    expect(webhook).toContain('supabase.rpc("claim_stripe_event"');
    expect(webhook).toContain('supabase.rpc("complete_stripe_event"');
    expect(webhook).toContain('supabase.rpc("fail_stripe_event"');
    expect(webhook).not.toContain("findAuthUserByEmail");
    expect(webhook).not.toContain('TIERS[productId] ?? "starter"');
    expect(hardeningMigration).toContain("status IN ('processing', 'processed', 'failed')");
  });

  it("fails closed on unknown feature and quota state", () => {
    expect(hardeningMigration).toContain("'reason', 'feature_not_configured'");
    expect(hardeningMigration).toContain("'reason', 'quota_not_configured'");
    expect(hardeningMigration).toContain("usage_increment_must_be_positive");
    expect(hardeningMigration).toContain("workspace_organization_mismatch");
    expect(featureAccess).toContain("user.app_metadata?.is_demo === true");
    expect(featureAccess).not.toContain("user.user_metadata?.is_demo");
    expect(quotaHook).toContain("const DENIED_QUOTA");
    expect(quotaHook).not.toContain("quota_limit: 999999, allowed: true");
  });
});
