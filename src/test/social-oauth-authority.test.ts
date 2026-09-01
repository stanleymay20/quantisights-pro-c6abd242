import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const adapter = readFileSync(
  resolve(root, "src/integrations/lovable/index.ts"),
  "utf8",
);
const callback = readFileSync(resolve(root, "src/pages/AuthCallback.tsx"), "utf8");
const googleButton = readFileSync(resolve(root, "src/components/auth/GoogleButton.tsx"), "utf8");
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

  it("does not advertise an unverified Google provider as available", () => {
    expect(googleButton).toContain("/auth/v1/settings");
    expect(googleButton).toContain('type ProviderState = "checking" | "available" | "unavailable"');
    expect(googleButton).toContain('settings.external?.google === true ? "available" : "unavailable"');
    expect(googleButton).toContain('"Google sign-in unavailable"');
    expect(googleButton).toContain("disabled={isDisabled}");
  });

  it("keeps Login and Register on the same social-login adapter", () => {
    expect(login).toContain('import("@/integrations/lovable")');
    expect(register).toContain('import("@/integrations/lovable")');
    expect(login).toContain('signInWithOAuth("google"');
    expect(register).toContain('signInWithOAuth("google"');
  });

  it("does not reintroduce the retired Lovable OAuth broker architecture", () => {
    for (const source of [login, register]) {
      expect(source).not.toContain("Lovable Cloud Managed Social Login");
      expect(source).not.toContain("/~oauth/callback");
      expect(source).not.toContain("lovable broker");
      expect(source).toContain("compatibility adapter delegates Google OAuth");
      expect(source).toContain("Supabase's hosted callback");
      expect(source).toContain("/auth/callback PKCE route");
    }
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
