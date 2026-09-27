import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const allowlistFile = JSON.parse(
  read("supabase/security/client-callable-definer-functions.json"),
) as { tenantGuardedRpcs: string[]; rlsPolicyHelpers: string[] };
const allowlist = [...allowlistFile.tenantGuardedRpcs, ...allowlistFile.rlsPolicyHelpers].sort();

const lockMigration = read(
  "supabase/migrations/20260927100100_lock_service_only_security_definer_functions.sql",
);
const grantMigration = read("supabase/migrations/20260927100000_converge_data_api_table_grants.sql");
const stagingWorkflow = read(".github/workflows/deploy-supabase-staging.yml");
const productionWorkflow = read(".github/workflows/deploy-edge-functions.yml");

const migrationAllowlist = () => {
  const block = lockMigration.match(/AND p\.proname NOT IN \(([\s\S]*?)\n\s*\)/);
  expect(block).not.toBeNull();
  return [...block![1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
};

describe("SECURITY DEFINER privilege boundary", () => {
  it("keeps the migration allowlist identical to the checked-in allowlist", () => {
    expect(migrationAllowlist()).toEqual(allowlist);
  });

  it("revokes client execution from every non-allowlisted SECURITY DEFINER function", () => {
    expect(lockMigration).toContain("AND p.prosecdef");
    expect(lockMigration).toContain(
      "'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated'",
    );
  });

  it("grants every allowlisted function to authenticated and never to anon", () => {
    for (const name of allowlist) {
      expect(lockMigration).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO authenticated, service_role;`),
      );
      expect(lockMigration).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon;`),
      );
    }
    expect(lockMigration).not.toMatch(/GRANT [^;]* TO [^;]*\banon\b/);
  });

  it("keeps the auth email queue and cross-tenant maintenance off the allowlist", () => {
    for (const name of [
      "read_email_batch",
      "enqueue_email",
      "delete_email",
      "move_to_dlq",
      "exec_cleanup_old_data",
      "cleanup_old_copilot_messages",
      "provision_aicis_for_org",
      "update_dataset_staleness",
    ]) {
      expect(allowlist).not.toContain(name);
    }
  });

  it("tenant-guards the client-called RPCs that previously trusted their arguments", () => {
    for (const name of ["check_workspace_quota", "increment_workspace_usage", "check_decision_evaluability"]) {
      const body = lockMigration.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1]?.split("$function$;")[0];
      expect(body, name).toBeDefined();
      expect(body).toContain("auth.uid() IS NOT NULL");
      expect(body).toContain("public.is_org_member(auth.uid()");
      expect(body).toContain("ERRCODE = '42501'");
    }
    expect(lockMigration).toContain("_increment IS NULL OR _increment <= 0");
  });

  it("makes table grants explicit for authenticated and service_role only", () => {
    expect(grantMigration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public\n  TO authenticated, service_role;",
    );
    expect(grantMigration).not.toMatch(/GRANT [^;]*\banon\b/);
  });

  it("verifies the live boundary and Auth hardening in staging and production deploys", () => {
    for (const workflow of [stagingWorkflow, productionWorkflow]) {
      const migrate = workflow.indexOf("supabase db push --linked --include-all --password \"$SUPABASE_DB_PASSWORD\" --yes");
      const verify = workflow.indexOf("node scripts/verify-supabase-privilege-boundary.mjs");
      const harden = workflow.indexOf("node scripts/configure-supabase-auth-hardening.mjs configure");
      expect(migrate).toBeGreaterThan(-1);
      expect(verify).toBeGreaterThan(migrate);
      expect(harden).toBeGreaterThan(migrate);
    }
  });
});
