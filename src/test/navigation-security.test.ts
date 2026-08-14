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

  it("only enforces SSO when the resolver returns a validated HTTPS destination", () => {
    const login = read("src/pages/Login.tsx");
    expect(login).toContain("const destination = safeHttpsUrl(ssoConfig.idp_sso_url);");
    expect(login).toContain("setSsoEnforced(Boolean(destination && ssoConfig.enforce_sso));");
    expect(login).not.toContain("setSsoEnforced(ssoConfig.enforce_sso);");
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

  it("defines the anonymous resolver contract with no organization identifier", () => {
    // The migration is the executable schema contract. Generated Supabase types
    // may lag a migration until the target project has been migrated and types
    // are regenerated, so security assertions must verify the actual DDL rather
    // than trusting a generated snapshot.
    const publicResolver = migration.match(
      /CREATE FUNCTION public\.resolve_sso_for_email\(_email text\)[\s\S]*?GRANT EXECUTE ON FUNCTION public\.resolve_sso_for_email\(text\)/,
    )?.[0] ?? "";

    expect(publicResolver).toContain("RETURNS TABLE(idp_sso_url text, enforce_sso boolean)");
    expect(publicResolver).not.toContain("organization_id");
    expect(publicResolver).not.toContain("provider_type");
  });
});
