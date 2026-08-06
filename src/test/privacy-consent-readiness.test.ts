import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  hasAnalyticsConsent,
  PRIVACY_CONSENT_EVENT,
  PRIVACY_CONSENT_KEY,
  readPrivacyConsent,
  setPrivacyConsent,
} from "@/lib/privacy-consent";

describe("privacy consent readiness", () => {
  beforeEach(() => localStorage.clear());

  it("defaults optional analytics to denied", () => {
    expect(readPrivacyConsent()).toBeNull();
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("persists a versioned analytics choice and notifies the runtime", () => {
    const listener = vi.fn();
    window.addEventListener(PRIVACY_CONSENT_EVENT, listener);

    const record = setPrivacyConsent("analytics");

    expect(record).toMatchObject({ version: 1, choice: "analytics", analytics: true });
    expect(readPrivacyConsent()).toMatchObject(record);
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(PRIVACY_CONSENT_EVENT, listener);
  });

  it("withdraws analytics and retains only the explicit essential choice", () => {
    setPrivacyConsent("analytics");
    const withdrawn = setPrivacyConsent("essential_only");

    expect(withdrawn.analytics).toBe(false);
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("normalizes the legacy accepted record without losing prior user intent", () => {
    localStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify({ choice: "accepted", timestamp: "2026-01-01T00:00:00.000Z" }));
    expect(readPrivacyConsent()).toMatchObject({ choice: "analytics", analytics: true });
  });

  it("keeps the analytics SDK behind the consent check", () => {
    const source = readFileSync("src/lib/analytics.ts", "utf8").replace(/\r\n/g, "\n");
    expect(source).toContain("!hasAnalyticsConsent()) return");
    expect(source).toContain('await import("posthog-js" as any)');
    expect(source.indexOf("!hasAnalyticsConsent()) return")).toBeLessThan(source.indexOf('await import("posthog-js" as any)'));
  });

  it("does not claim complete DPA coverage when registry evidence is absent", () => {
    const source = readFileSync("src/pages/Subprocessors.tsx", "utf8");
    expect(source).not.toContain("100% DPAs signed");
    expect(source).toContain("This does not imply that the service uses no vendors");
    expect(source).toContain("Registry unavailable");
  });
});
