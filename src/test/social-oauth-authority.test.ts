import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const adapter = readFileSync(
  resolve(root, "src/integrations/lovable/index.ts"),
  "utf8",
);
const callback = readFileSync(resolve(root, "src/pages/AuthCallback.tsx"), "utf8");
const login = readFileSync(resolve(root, "src/pages/Login.tsx"), "utf8");
const register = readFileSync(resolve(root, "src/pages/Register.tsx"), "utf8");

describe("social OAuth authority", () => {
  it("routes Google social login through Supabase rather than Lovable Cloud Auth", () => {
    expect(adapter).toContain("supabase.auth.signInWithOAuth");
    expect(adapter).toContain('provider: "google"');
    expect(adapter).toContain("skipBrowserRedirect: true");
    expect(adapter).not.toContain("createLovableAuth");
    expect(adapter).not.toContain("@lovable.dev/cloud-auth-js");
  });

  it("preflights the active Supabase Auth provider before redirecting", () => {
    expect(adapter).toContain("/auth/v1/settings");
    expect(adapter).toContain("settings.external?.google !== true");
    expect(adapter).toContain("await ensureGoogleProviderEnabled()");
    expect(adapter.indexOf("await ensureGoogleProviderEnabled()")).toBeLessThan(
      adapter.indexOf("supabase.auth.signInWithOAuth"),
    );
  });

  it("keeps Login and Register on the same social-login adapter", () => {
    expect(login).toContain('import("@/integrations/lovable")');
    expect(register).toContain('import("@/integrations/lovable")');
    expect(login).toContain('signInWithOAuth("google"');
    expect(register).toContain('signInWithOAuth("google"');
  });

  it("requires an HTTPS authorization URL before browser navigation", () => {
    expect(adapter).toContain('destination.protocol !== "https:"');
    expect(adapter).toContain("window.location.assign(destination.toString())");
  });

  it("accepts only the Supabase PKCE session flow at the OAuth callback", () => {
    expect(callback).toContain("detectSessionInUrl + PKCE");
    expect(callback).toContain("supabase.auth.onAuthStateChange");
    expect(callback).toContain("supabase.auth.getSession");
    expect(callback).not.toContain("supabase.auth.setSession");
    expect(callback).not.toContain('readOAuthParam(url, "access_token")');
    expect(callback).not.toContain('readOAuthParam(url, "refresh_token")');
  });
});
