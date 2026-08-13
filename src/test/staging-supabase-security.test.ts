import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const migrationPath =
  "supabase/migrations/20260813153935_harden_public_function_execute.sql";
const migration = readFileSync(resolve(root, migrationPath), "utf8");
const stagingWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-supabase-staging.yml"),
  "utf8",
);
const productionWorkflow = readFileSync(
  resolve(root, ".github/workflows/deploy-edge-functions.yml"),
  "utf8",
);

describe("staging Supabase security remediation", () => {
  it("removes inherited anonymous execution from privileged public functions", () => {
    expect(migration).toContain(
      "ALTER DEFAULT PRIVILEGES IN SCHEMA public\n  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC",
    );
    expect(migration).toContain("AND p.prosecdef");
    expect(migration).toContain(
      "'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon'",
    );
  });

  it("keeps public evidence RPCs read-only without SECURITY DEFINER", () => {
    for (const functionName of [
      "get_latest_trust_metrics",
      "get_active_subprocessors",
      "get_procurement_readiness",
    ]) {
      expect(migration).toContain(
        `ALTER FUNCTION public.${functionName}() SECURITY INVOKER`,
      );
      expect(migration).toMatch(
        new RegExp(
          `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\(\\)\\s+TO anon, authenticated, service_role`,
        ),
      );
    }
  });

  it("prevents client roles from invoking internal trigger functions", () => {
    for (const functionName of [
      "create_default_governance_profile",
      "enforce_decision_approval_gate",
      "intel_writeback_on_decision_resolved",
      "intv_writeback_learning",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${functionName}\\(\\)\\s+FROM PUBLIC, anon, authenticated`,
        ),
      );
    }
  });

  it("deploys staging and production through isolated GitHub environments", () => {
    expect(stagingWorkflow).toContain("environment: staging");
    expect(stagingWorkflow).toContain("SUPABASE_PROJECT_REF: cmnihsbdbpubznlkmjbc");
    expect(stagingWorkflow).not.toContain("itpwpnwzzitkelffttyx");
    expect(productionWorkflow).toContain("environment: production");
    expect(productionWorkflow).toContain("SUPABASE_PROJECT_REF: itpwpnwzzitkelffttyx");
    expect(productionWorkflow).toContain("confirm_project_ref");
    expect(productionWorkflow).not.toMatch(/push:\s*\n/);
  });

  it("quarantines the out-of-band review-only migration", () => {
    const marker = readFileSync(
      resolve(
        root,
        "supabase/migrations/20260719140000_harden_decision_workflow_integrity.sql",
      ),
      "utf8",
    );
    expect(marker).toContain("Migration-history quarantine marker");
    expect(marker.replace(/^--.*$/gm, "").trim()).toBe("");
  });

  it("locks down privileged RPCs introduced by pending staging migrations", () => {
    for (const path of [
      "supabase/migrations/20260611160000_auth_rate_limits.sql",
      "supabase/migrations/20260612000001_org_security_settings.sql",
      "supabase/migrations/20260714050200_restore_decision_final_status_guard.sql",
    ]) {
      expect(readFileSync(resolve(root, path), "utf8")).toContain(
        "SET search_path = pg_catalog, public",
      );
    }
    const rateLimits = readFileSync(
      resolve(root, "supabase/migrations/20260611160000_auth_rate_limits.sql"),
      "utf8",
    );
    expect(rateLimits).toContain("FROM PUBLIC, anon, authenticated");
  });
});
