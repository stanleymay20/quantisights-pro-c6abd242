import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const organizationHook = readFileSync(resolve(root, "src/hooks/useOrganization.ts"), "utf8");
const onboardingGate = readFileSync(resolve(root, "src/pages/Onboarding.tsx"), "utf8");
const stagingValidation = readFileSync(resolve(root, ".github/workflows/ga-staging-validation.yml"), "utf8");
const signupIntent = readFileSync(resolve(root, "src/lib/signup-intent.ts"), "utf8");
const verifiedSignupMigration = readFileSync(
  resolve(root, "supabase/migrations/20260903103000_verified_signup_and_commercial_entitlements.sql"),
  "utf8",
);
const controlPlaneMigration = readFileSync(
  resolve(root, "supabase/migrations/20260902173140_fail_closed_tenant_control_plane.sql"),
  "utf8",
);

describe("tenant provisioning boundary", () => {
  it("keeps browser organization discovery strictly read-only", () => {
    expect(organizationHook).toContain("promise = fetchMembershipOrgs()");
    expect(organizationHook).toContain("Organization discovery is intentionally read-only");
    expect(organizationHook).not.toContain("ensurePersonalTenant");
    expect(organizationHook).not.toContain('ONBOARDING_PROVISION_KEY');
    expect(organizationHook).not.toContain('.from("organizations")\n      .insert');
    expect(organizationHook).not.toContain('.from("organization_members")\n      .insert');
    expect(organizationHook).not.toContain('.from("workspaces")\n      .insert');
  });

  it("does not treat browser storage or user-editable metadata as onboarding authority", () => {
    // Descriptive comments may name user_metadata; the security contract is that
    // application code never reads it as a provisioning/authorization signal.
    expect(onboardingGate).not.toContain("user.user_metadata");
    expect(onboardingGate).not.toContain("user?.user_metadata");
    expect(onboardingGate).not.toContain("user_metadata?.");
    expect(onboardingGate).not.toContain("quantivis_onboarding_started");
    expect(onboardingGate).not.toContain("quantivis_onboarding_provisioned");
    expect(onboardingGate).not.toContain("quantivis_onboarding_provisioning");
    expect(organizationHook).not.toContain("user.user_metadata");
    expect(organizationHook).not.toContain("user?.user_metadata");
    expect(organizationHook).not.toContain("user_metadata?.");
  });

  it("fails closed unless missing or incomplete tenant evidence is backed by verified signup provenance", () => {
    expect(onboardingGate).toContain('type GateStatus = "checking" | "ready" | "restoration" | "blocked"');
    expect(onboardingGate).toContain("if (!currentOrgId)");
    expect(onboardingGate).toContain("readVerifiedSignupIntent()");
    expect(onboardingGate).toContain("provisionVerifiedSignup(intentToken)");
    expect(onboardingGate).toContain("hasVerifiedSignupProvenance(currentOrgId)");
    expect(onboardingGate).toContain('if (provenance.verified)');
    expect(onboardingGate).toContain('setStatus("ready")');
    expect(onboardingGate).toContain('if (status === "ready") return <OnboardingWizard />');
    expect(onboardingGate).toContain("Workspace restoration required");
    expect(onboardingGate).toContain("no server-verified signup-onboarding provenance");

    // Browser storage preserves only the opaque capability. Tenant authority is
    // established by server-side Auth timestamps and the private intent ledger.
    expect(signupIntent).toContain('rpc("provision_verified_signup"');
    expect(verifiedSignupMigration).toContain("v_user.email_confirmed_at IS NULL");
    expect(verifiedSignupMigration).toContain("v_user.created_at < v_intent.created_at");
    expect(verifiedSignupMigration).toContain("interval '24 hours'");
    expect(verifiedSignupMigration).toContain("existing_identity_requires_restoration");
    expect(verifiedSignupMigration).toContain("existing_tenant_relationship");
  });

  it("preserves access for an already completed verified organization", () => {
    expect(onboardingGate).toContain("if (data.onboarding_completed)");
    expect(onboardingGate).toContain('navigate("/executive", { replace: true })');
  });

  it("stops auth-user creation from implicitly manufacturing tenant state", () => {
    expect(controlPlaneMigration).toContain("DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users");
    expect(controlPlaneMigration).toContain("REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated");
    expect(controlPlaneMigration).toContain('DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations');
    expect(controlPlaneMigration).not.toContain("CREATE POLICY \"Users can create organizations\"");
  });

  it("preserves verified invitations without restoring generic tenant auto-provisioning", () => {
    expect(controlPlaneMigration).toContain("CREATE OR REPLACE FUNCTION public.accept_invitation(_token uuid)");
    expect(controlPlaneMigration).toContain("IF auth.uid() IS NULL THEN");
    expect(controlPlaneMigration).toContain("lower(current_email) <> lower(inv.email)");
    expect(controlPlaneMigration).toContain("INSERT INTO public.profiles (user_id, full_name, organization_id)");
    expect(controlPlaneMigration).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(controlPlaneMigration).toContain("VALUES (inv.organization_id, auth.uid(), inv.role)");
    expect(controlPlaneMigration).toContain("GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated");
  });

  it("removes self-enrolment and admin-to-owner membership escalation", () => {
    expect(controlPlaneMigration).toContain('DROP POLICY IF EXISTS "Owners/admins can insert members"');
    expect(controlPlaneMigration).toContain('DROP POLICY IF EXISTS "Owners/admins can update members"');
    expect(controlPlaneMigration).not.toContain("OR user_id = auth.uid()");
    expect(controlPlaneMigration).toContain("AND role <> 'owner'::public.org_role");
    expect(controlPlaneMigration).toContain("WITH CHECK (");
  });

  it("proves the tenant control plane on the exact staged SHA before GA certification", () => {
    const checkout = stagingValidation.indexOf("- name: Checkout staged release");
    const verifySha = stagingValidation.indexOf("- name: Verify checked-out staging target");
    const seed = stagingValidation.indexOf("- name: Seed isolated staging organizations");
    const tenantProof = stagingValidation.indexOf("- name: Prove tenant isolation");
    const teardown = stagingValidation.indexOf("- name: Teardown tenant-isolation fixtures");
    const publish = stagingValidation.indexOf("- name: Publish tenant-isolation SHA proof");

    expect(stagingValidation).toContain('workflows: ["Deploy Supabase Staging"]');
    expect(stagingValidation).toContain("LOAD_TARGET: staging");
    expect(stagingValidation).toContain("LOAD_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}");
    expect(stagingValidation).toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}");
    expect(stagingValidation).toContain("ref: ${{ steps.release.outputs.sha }}");
    expect(stagingValidation).toContain("npm run tenant-isolation:run");
    expect(checkout).toBeGreaterThan(-1);
    expect(verifySha).toBeGreaterThan(checkout);
    expect(seed).toBeGreaterThan(verifySha);
    expect(tenantProof).toBeGreaterThan(seed);
    expect(teardown).toBeGreaterThan(tenantProof);
    expect(publish).toBeGreaterThan(teardown);
  });
});
