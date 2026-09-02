import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const organizationHook = readFileSync(resolve(root, "src/hooks/useOrganization.ts"), "utf8");
const onboardingGate = readFileSync(resolve(root, "src/pages/Onboarding.tsx"), "utf8");
const onboardingWizard = readFileSync(resolve(root, "src/pages/OnboardingWizard.tsx"), "utf8");
const register = readFileSync(resolve(root, "src/pages/Register.tsx"), "utf8");
const authContext = readFileSync(resolve(root, "src/contexts/AuthContext.tsx"), "utf8");
const authCallback = readFileSync(resolve(root, "src/pages/AuthCallback.tsx"), "utf8");

describe("tenant provisioning boundary", () => {
  it("keeps ordinary organization discovery read-only unless signup onboarding explicitly authorizes provisioning", () => {
    expect(organizationHook).toContain('const ONBOARDING_PROVISION_KEY = "quantivis_onboarding_provisioning"');
    expect(organizationHook).toContain('sessionStorage.getItem(ONBOARDING_PROVISION_KEY) === "allowed"');
    expect(organizationHook).toContain("user?.user_metadata?.quantivis_onboarding_started === true");
    expect(organizationHook).toContain("if (orgs.length === 0 && provisioningAuthorized)");
    expect(organizationHook).not.toContain("if (orgs.length === 0) {\n      const fallbackOrg = await ensurePersonalTenant()");
  });

  it("re-checks membership before a one-shot tenant creation and removes future creation authority", () => {
    const membershipRecheck = organizationHook.indexOf("const existing = await fetchMembershipOrgs()");
    const orgInsert = organizationHook.indexOf('.from("organizations")\n      .insert');
    expect(membershipRecheck).toBeGreaterThan(-1);
    expect(orgInsert).toBeGreaterThan(membershipRecheck);
    expect(organizationHook).toContain('sessionStorage.removeItem(ONBOARDING_PROVISION_KEY)');
    expect(organizationHook).toContain("quantivis_onboarding_started: false");
    expect(organizationHook).toContain("quantivis_onboarding_provisioned: true");
  });

  it("records explicit signup provenance for password and Google registration only", () => {
    expect(authContext).toContain("quantivis_onboarding_started: true");
    expect(register).toContain('sessionStorage.setItem("quantivis_oauth_signup", "1")');
    expect(authCallback).toContain('googleSignupIntent && next === "/onboarding"');
    expect(authCallback).toContain("supabase.auth.getUser()");
    expect(authCallback).toContain("isFreshGoogleSignup(verifiedUserData.user.created_at)");
    expect(authCallback).toContain("GOOGLE_SIGNUP_FRESHNESS_MS");
    expect(authCallback).toContain("Existing Google account cannot acquire new-tenant signup provenance");
  });

  it("blocks incomplete tenants without verified onboarding provenance instead of showing setup", () => {
    expect(onboardingGate).toContain('type GateStatus = "checking" | "ready" | "restoration" | "blocked"');
    expect(onboardingGate).toContain("Workspace restoration required");
    expect(onboardingGate).toContain("Setup is blocked to avoid creating replacement data");
    expect(onboardingGate).toContain("if (onboardingStarted || onboardingProvisioned)");
    expect(onboardingGate).toContain("return <OnboardingWizard />");
  });

  it("authorizes first-tenant provisioning only from the onboarding gate", () => {
    expect(onboardingGate).toContain('sessionStorage.setItem(ONBOARDING_PROVISION_KEY, "allowed")');
    expect(onboardingGate).toContain("if (!onboardingStarted)");
    expect(onboardingGate).toContain("await refreshOrganizationsRef.current()");
    expect(onboardingGate).toContain('sessionStorage.removeItem(ONBOARDING_PROVISION_KEY)');
  });

  it("preserves the existing onboarding wizard rather than mixing restoration logic into it", () => {
    expect(onboardingGate).toContain('import OnboardingWizard from "@/pages/OnboardingWizard"');
    expect(onboardingWizard).toContain("Set Up Your Organization");
    expect(onboardingWizard).toContain("complete-onboarding");
    expect(onboardingWizard).not.toContain("Workspace restoration required");
  });
});
