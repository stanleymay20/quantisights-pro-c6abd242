import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

const authContext = read("src/contexts/AuthContext.tsx");
const register = read("src/pages/Register.tsx");
const callback = read("src/pages/AuthCallback.tsx");
const onboarding = read("src/pages/Onboarding.tsx");
const signupIntent = read("src/lib/signup-intent.ts");
const signupIntentEdge = read("supabase/functions/begin-signup-intent/index.ts");
const supabaseConfig = read("supabase/config.toml");
const migration = read("supabase/migrations/20260903103000_verified_signup_and_commercial_entitlements.sql");

describe("verified fresh-signup provenance", () => {
  it("never uses user-editable metadata as tenant provisioning authority", () => {
    expect(authContext).not.toContain("quantivis_onboarding_started");
    expect(callback).not.toContain("supabase.auth.updateUser");
    expect(callback).not.toContain("GOOGLE_SIGNUP_FRESHNESS_MS");
  });

  it("issues a server intent before password and Google account creation", () => {
    const intentPos = register.indexOf("await beginVerifiedSignupIntent();");
    const passwordSignupPos = register.indexOf("await signUp(email, password, fullName);");
    expect(intentPos).toBeGreaterThan(-1);
    expect(passwordSignupPos).toBeGreaterThan(intentPos);
    expect(register).toContain("clearVerifiedSignupIntent();");
  });

  it("survives cross-device email confirmation without trusting user metadata", () => {
    expect(authContext).toContain('callbackUrl.searchParams.set("signup_intent", signupIntent)');
    expect(authContext).toContain("emailRedirectTo: callbackUrl.toString()");
    expect(register).toContain("await signUp(email, password, fullName, signupIntent)");
    expect(callback).toContain('searchParams.get("signup_intent")');
    expect(callback).toContain("restoreVerifiedSignupIntent(redirectSignupIntent)");
    expect(callback.indexOf("restoreVerifiedSignupIntent(redirectSignupIntent)")).toBeGreaterThan(callback.indexOf("if (ok)"));
    expect(signupIntent).toContain("restoreVerifiedSignupIntent");
    expect(signupIntent).toContain("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
  });

  it("keeps the intent ledger private and short lived", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS tenant_control");
    expect(migration).toContain("REVOKE ALL ON SCHEMA tenant_control FROM PUBLIC");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("ALTER TABLE tenant_control.signup_intents ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON tenant_control.signup_intents FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.issue_signup_intent_internal()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.issue_signup_intent_internal() FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.issue_signup_intent_internal() TO service_role");
    expect(migration).not.toContain("GRANT EXECUTE ON FUNCTION public.begin_signup_intent() TO anon");
  });

  it("binds tenant creation to a freshly created confirmed Auth identity", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.provision_verified_signup");
    expect(migration).toContain("v_user.email_confirmed_at IS NULL");
    expect(migration).toContain("v_user.created_at < v_intent.created_at");
    expect(migration).toContain("existing_identity_requires_restoration");
    expect(migration).toContain("existing_tenant_relationship");
    expect(migration).toContain("FOR UPDATE");
  });

  it("provisions exactly one org/workspace relationship and supports idempotent retry", () => {
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("INSERT INTO public.organizations");
    expect(migration).toContain("INSERT INTO public.organization_members");
    expect(migration).toContain("INSERT INTO public.workspaces");
    expect(migration).toContain("INSERT INTO public.workspace_members");
    expect(migration).toContain("consumed_by = v_uid");
  });

  it("supports zero-downtime adoption only for the exact fresh legacy tenant shape", () => {
    expect(migration).toContain("adopted_legacy");
    expect(migration).toContain("o.created_by = v_uid");
    expect(migration).toContain("o.created_at >= v_intent.created_at");
    expect(migration).toContain("p.created_at >= v_intent.created_at");
    expect(migration).toContain("w.created_at >= v_intent.created_at");
    expect(migration).toContain("(SELECT count(*) FROM public.organization_members omx WHERE omx.user_id = v_uid) = 1");
    expect(migration).toContain("(SELECT count(*) FROM public.workspace_members wmx WHERE wmx.user_id = v_uid) = 1");
    expect(migration).toContain("existing_tenant_relationship");
    expect(onboarding).toContain("if (!provenance.verified)");
    expect(onboarding).toContain("provisionVerifiedSignup(intentToken)");
  });

  it("onboarding provisions only from the opaque intent and verifies private provenance", () => {
    expect(signupIntent).toContain('functions.invoke<{ token?: string }>("begin-signup-intent"');
    expect(signupIntentEdge).toContain('rpc("issue_signup_intent_internal")');
    expect(signupIntentEdge).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(supabaseConfig).toContain("[functions.begin-signup-intent]");
    expect(supabaseConfig).toContain("verify_jwt = false");
    expect(signupIntent).toContain('rpc("provision_verified_signup"');
    expect(signupIntent).toContain('rpc("has_verified_signup_provenance"');
    expect(onboarding).toContain("readVerifiedSignupIntent()");
    expect(onboarding).toContain("provisionVerifiedSignup(intentToken)");
    expect(onboarding).toContain("hasVerifiedSignupProvenance(currentOrgId)");
    expect(onboarding).toContain('if (status === "ready") return <OnboardingWizard />');
  });
});
