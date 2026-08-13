import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { safeHttpsUrl, safeInternalNavigation } from "@/lib/safe-navigation";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("safe navigation boundaries", () => {
  it("preserves normalized same-origin application paths", () => {
    expect(safeInternalNavigation("/dashboard?view=top#today", "/fallback"))
      .toBe("/dashboard?view=top#today");
  });

  it.each([
    "https://attacker.example/phish",
    "//attacker.example/phish",
    "/\\attacker.example/phish",
    "/%5cattacker.example/phish",
    "/%255cattacker.example/phish",
    "/dashboard%0d%0aLocation:%20https://attacker.example",
    " /dashboard",
  ])("rejects unsafe internal destination %s", (destination) => {
    expect(safeInternalNavigation(destination, "/fallback")).toBe("/fallback");
  });

  it("accepts only credential-free HTTPS SSO destinations", () => {
    expect(safeHttpsUrl("https://idp.example.com/saml/login"))
      .toBe("https://idp.example.com/saml/login");
    expect(safeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpsUrl("http://idp.example.com/saml")).toBeNull();
    expect(safeHttpsUrl("https://user:pass@idp.example.com/saml")).toBeNull();
    expect(safeHttpsUrl("https://idp.example.com/\\evil")).toBeNull();
  });
});

describe("SSO database hardening", () => {
  const migration = read("supabase/migrations/20260813124440_harden_sso_redirects.sql");

  it("constrains stored redirects and moves privileged lookup out of public", () => {
    expect(migration).toContain("sso_configs_https_redirect_check");
    expect(migration).toContain("private.resolve_sso_for_email");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.resolve_sso_for_email(text) FROM PUBLIC");
  });

  it("returns no organization identifier from the anonymous resolver", () => {
    const types = read("src/integrations/supabase/types.ts");
    const signature = types.match(/resolve_sso_for_email:[\s\S]*?try_cron_advisory_lock/)?.[0] ?? "";
    expect(signature).not.toContain("organization_id");
    expect(signature).not.toContain("provider_type");
  });
});
