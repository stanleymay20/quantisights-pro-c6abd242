import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260817175105_harden_security_definer_tenant_boundaries.sql"),
  "utf8",
);

describe("SECURITY DEFINER tenant-boundary hardening", () => {
  it("binds membership helper lookups to the authenticated caller or service role", () => {
    expect(migration).toContain("auth.uid() = _user_id");
    expect(migration).toContain("auth.jwt() ->> 'role'");
    expect(migration).toContain("= 'service_role'");
    expect(migration).toContain("ELSE false");
    expect(migration).toContain("ELSE NULL::public.org_role");
  });

  it("runs tenant-readable aggregate/profile RPCs with invoker privileges", () => {
    for (const signature of [
      "public.count_measured_outcomes(uuid)",
      "public.get_active_governance_profile(uuid)",
      "public.get_iq_composite_score(uuid, uuid)",
      "public.get_my_org_security_settings()",
    ]) {
      expect(migration).toContain(`ALTER FUNCTION ${signature} SECURITY INVOKER;`);
    }
  });

  it("removes signed-in direct access to global cron health", () => {
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.get_cron_health(text[]) FROM authenticated;");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.get_cron_health(text[]) TO service_role;");
  });

  it("pins hardened function search paths", () => {
    expect(migration.match(/SET search_path = pg_catalog, public/g)?.length).toBeGreaterThanOrEqual(6);
  });
});
