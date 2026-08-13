import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const migrationPath =
  "supabase/migrations/20260813153935_harden_public_function_execute.sql";
const migration = readFileSync(resolve(root, migrationPath), "utf8");

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
});
