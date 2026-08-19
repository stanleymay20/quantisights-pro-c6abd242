import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PUBLIC_CLIENT_CONFIG,
  resolvePublicClientConfig,
  validatePublicClientConfig,
} from "../../config/public-client-config";

const encodeJwt = (payload: Record<string, unknown>) => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.test-signature`;
};

describe("public client bootstrap configuration", () => {
  it("falls back to the checked-in production public config when build env is absent", () => {
    const resolved = resolvePublicClientConfig({});

    expect(resolved).toEqual({
      supabaseUrl: PRODUCTION_PUBLIC_CLIENT_CONFIG.supabaseUrl,
      supabasePublishableKey: PRODUCTION_PUBLIC_CLIENT_CONFIG.supabasePublishableKey,
      source: "checked-in-public-default",
    });
  });

  it("prefers a complete environment override", () => {
    const ref = "abcdefghijklmnopqrst";
    const key = encodeJwt({ role: "anon", ref });

    expect(resolvePublicClientConfig({
      VITE_SUPABASE_URL: `https://${ref}.supabase.co`,
      VITE_SUPABASE_PUBLISHABLE_KEY: key,
    })).toEqual({
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
