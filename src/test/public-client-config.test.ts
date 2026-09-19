import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PUBLIC_CLIENT_CONFIG,
  STAGING_PUBLIC_CLIENT_CONFIG,
  resolveDefaultPublicClientTarget,
  resolvePublicClientConfig,
  validatePublicClientConfig,
} from "../../config/public-client-config";

const encodeJwt = (payload: Record<string, unknown>) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.test-signature`;
};

describe("public client bootstrap configuration", () => {
  it("pins the checked-in production fallback to the active production project", () => {
    expect(PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl).toBe(
      "https://izgfrekdamlgigehxoqs.supabase.co",
    );
    expect(PRODUCTION_PUBLIC_CLIENT_CONFIG.supabasePublishableKey).toMatch(
      /^sb_publishable_[A-Za-z0-9_-]{20,}$/,
    );
    expect(JSON.stringify(PRODUCTION_PUBLIC_CLIENT_CONFIG)).not.toContain(
      "itpwpnwzzitkelffttyx",
    );
  });

  it("pins the checked-in staging fallback to the active staging project", () => {
    expect(STAGING_PUBLIC_CLIENT_CONFIG.supabaseUrl).toBe(
      "https://cmnihsbdbpubznlkmjbc.supabase.co",
    );
    expect(STAGING_PUBLIC_CLIENT_CONFIG.supabasePublishableKey).toMatch(
      /^sb_publishable_[A-Za-z0-9_-]{20,}$/,
    );
    expect(JSON.stringify(STAGING_PUBLIC_CLIENT_CONFIG)).not.toContain(
      "itpwpnwzzitkelffttyx",
    );
    expect(STAGING_PUBLIC_CLIENT_CONFIG.supabaseUrl).not.toBe(
      PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl,
    );
  });

  it("falls back to the checked-in production public config when build env is absent", () => {
    const resolved = resolvePublicClientConfig({});

    expect(resolved).toEqual({
      supabaseUrl: PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl,
      supabasePublishableKey: PRODUCTION_PUBLIC_CLIENT_CONFIG.supabasePublishableKey,
      source: "checked-in-public-default",
    });
  });

  it("supports a staging fallback without weakening environment overrides", () => {
    expect(resolvePublicClientConfig({}, STAGING_PUBLIC_CLIENT_CONFIG)).toEqual({
      supabaseUrl: STAGING_PUBLIC_CLIENT_CONFIG.supabaseUrl,
      supabasePublishableKey: STAGING_PUBLIC_CLIENT_CONFIG.supabasePublishableKey,
      source: "checked-in-public-default",
    });
  });

  it("sends hosting-provider deploy previews to staging even when Vite mode is production", () => {
    expect(resolveDefaultPublicClientTarget({
      mode: "production",
      deploymentContext: "deploy-preview",
    })).toBe(STAGING_PUBLIC_CLIENT_CONFIG);

    expect(resolveDefaultPublicClientTarget({
      mode: "production",
      deploymentContext: "branch-deploy",
    })).toBe(STAGING_PUBLIC_CLIENT_CONFIG);

    expect(resolveDefaultPublicClientTarget({
      mode: "production",
      deploymentContext: "preview",
    })).toBe(STAGING_PUBLIC_CLIENT_CONFIG);
  });

  it("keeps an explicit hosting-provider production context on production", () => {
    expect(resolveDefaultPublicClientTarget({
      mode: "production",
      deploymentContext: "production",
    })).toBe(PRODUCTION_PUBLIC_CLIENT_CONFIG);
  });

  it("preserves the local Vite fallback when no hosting-provider context exists", () => {
    expect(resolveDefaultPublicClientTarget({ mode: "production" })).toBe(
      PRODUCTION_PUBLIC_CLIENT_CONFIG,
    );
    expect(resolveDefaultPublicClientTarget({ mode: "development" })).toBe(
      STAGING_PUBLIC_CLIENT_CONFIG,
    );
  });

  it("records provider deployment context in the Vite release provenance", () => {
    const viteConfig = readFileSync(resolve(__dirname, "../../vite.config.ts"), "utf8");
    expect(viteConfig).toContain("process.env.CONTEXT");
    expect(viteConfig).toContain("process.env.VERCEL_ENV");
    expect(viteConfig).toContain("resolveDefaultPublicClientTarget");
    expect(viteConfig).toContain("deploymentContext");
    expect(viteConfig).toContain("supabaseProjectRef");
    expect(viteConfig).toContain("supabaseConfigSource");
  });

  it("prefers a complete environment override", () => {
    const ref = "abcdefghijklmnopqrst";
    const key = encodeJwt({ role: "anon", ref });

    expect(resolvePublicClientConfig({
      VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    }, STAGING_PUBLIC_CLIENT_CONFIG)).toEqual({
      supabaseUrl: `https://${ref}.supabase.co`,
      supabasePublishableKey: key,
      source: "environment",
    });
  });

  it("rejects partial environment overrides instead of mixing projects", () => {
    expect(() => resolvePublicClientConfig({
      VITE_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
    })).toThrow(/must be supplied together/i);
  });

  it("rejects malformed URLs and malformed keys", () => {
    expect(() => validatePublicClientConfig(
      "http://abcdefghijklmnopqrst.supabase.co",
      PRODUCTION_PUBLIC_CLIENT_CONFIG.supabasePublishableKey,
    )).toThrow(/HTTPS project URL/i);

    expect(() => validatePublicClientConfig(
      PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl,
      "not-a-publishable-key",
    )).toThrow(/unsupported format/i);
  });

  it("rejects a JWT whose project ref does not match the Supabase URL", () => {
    const key = encodeJwt({ role: "anon", ref: "differentprojectref" });

    expect(() => validatePublicClientConfig(
      "https://abcdefghijklmnopqrst.supabase.co",
      key,
    )).toThrow(/different projects/i);
  });

  it("rejects service-role credentials before they can enter a browser build", () => {
    const ref = "abcdefghijklmnopqrst";
    const key = encodeJwt({ role: "service_role", ref });

    expect(() => validatePublicClientConfig(
      `https://${ref}.supabase.co`,
      key,
    )).toThrow(/Privileged Supabase credentials/i);
  });

  it("keeps validation errors free of the full key material", () => {
    const sensitive = encodeJwt({ role: "service_role", ref: "abcdefghijklmnopqrst" });

    try {
      validatePublicClientConfig("https://abcdefghijklmnopqrst.supabase.co", sensitive);
      throw new Error("expected validation failure");
    } catch (error) {
      expect(String(error)).not.toContain(sensitive);
    }
  });
});
