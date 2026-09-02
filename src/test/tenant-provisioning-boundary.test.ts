import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const organizationHook = readFileSync(resolve(root, "src/hooks/useOrganization.ts"), "utf8");
const onboardingGate = readFileSync(resolve(root, "src/pages/Onboarding.tsx"), "utf8");
const controlPlaneMigration = readFileSync(
  resolve(root, "supabase/migrations/20260902153000_fail_closed_tenant_control_plane.sql"),
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
    expect(onboardingGate).not.toContain("user_metadata");
    expect(onboardingGate).not.toContain("quantivis_onboarding_started");
    expect(onboardingGate).not.toContain("quantivis_onboarding_provisioned");
    expect(onboardingGate).not.toContain("quantivis_onboarding_provisioning");
    expect(organizationHook).not.toContain("user_metadata");
  });

  it("fails closed for missing or incomplete tenant evidence", () => {
    expect(onboardingGate).toContain('type GateStatus = "checking" | "restoration" | "blocked"');
    expect(onboardingGate).toContain("if (!currentOrgId)");
    expect(onboardingGate).toContain("Workspace restoration required");
    expect(onboardingGate).toContain("no server-verified signup-onboarding provenance");
    expect(onboardingGate).not.toContain("OnboardingWizard");
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

  it("removes self-enrolment and admin-to-owner membership escalation", () => {
    expect(controlPlaneMigration).toContain('DROP POLICY IF EXISTS "Owners/admins can insert members"');
    expect(controlPlaneMigration).toContain('DROP POLICY IF EXISTS "Owners/admins can update members"');
    expect(controlPlaneMigration).not.toContain("OR user_id = auth.uid()");
    expect(controlPlaneMigration).toContain("AND role <> 'owner'::public.org_role");
    expect(controlPlaneMigration).toContain("WITH CHECK (");
  });
});
