/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * analytics.ts — PostHog product analytics
 *
 * Build-safe: compiles even when posthog-js is not installed.
 * Privacy-first: no PII, GDPR-compliant EU endpoint.
 * Activate by setting POSTHOG_KEY in Lovable → Environment Variables.
 * (Lovable exposes env vars without the VITE_ prefix)
 */

declare global {
  interface Window {
    posthog?: {
      capture: (event: string, props?: Record<string, unknown>) => void;
      identify: (id: string, traits?: Record<string, unknown>) => void;
      reset: () => void;
      opt_in_capturing: () => void;
      opt_out_capturing: () => void;
    };
  }
}

// PostHog project token — write-only, intentionally public (PostHog docs: "Safe to use in public apps")
// EU Cloud · Project ID 200654 · https://eu.posthog.com
// Lovable exposes env vars as POSTHOG_KEY (no VITE_ prefix); VITE_POSTHOG_KEY kept as fallback
const POSTHOG_KEY = String(
  import.meta.env.POSTHOG_KEY ??
  import.meta.env.VITE_POSTHOG_KEY ??
  "phc_DjH2zrVrNqqrBc74Luh9K6ZG96hkWZoC8kUfUjpHdjJw"
);
const POSTHOG_HOST = String(
  import.meta.env.POSTHOG_HOST ??
  import.meta.env.VITE_POSTHOG_HOST ??
  "https://eu.posthog.com"
);

let initialized = false;
let loaded = false;

async function init() {
  if (initialized || !POSTHOG_KEY || typeof window === "undefined") return;
  initialized = true;
  try {
    // Dynamic import with 'as any' suppresses TS2307 when posthog-js is absent
    const mod: any = await import("posthog-js" as any);
    const ph = mod.default ?? mod;
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      autocapture: false,
      persistence: "localStorage",
      disable_session_recording: true,
      respect_dnt: true,
      loaded(p: any) {
        loaded = true;
        const consent = localStorage.getItem("quantivis_cookie_consent");
        if (consent !== "accepted") p.opt_out_capturing();
      },
    });
    window.posthog = ph;
  } catch {
    // posthog-js not installed — analytics silently disabled
  }
}

export const getPostHogStatus = () => ({
  configured: Boolean(POSTHOG_KEY),
  initialized,
  loaded,
  host: POSTHOG_HOST,
  consent: typeof localStorage === "undefined"
    ? "unavailable"
    : localStorage.getItem("quantivis_cookie_consent") ?? "not-set",
});

if (POSTHOG_KEY) void init();

export const identifyUser = (userId: string, orgId: string, role: string) =>
  window.posthog?.identify(userId, { org_id: orgId, role });

export const track = (event: string, props?: Record<string, unknown>) =>
  window.posthog?.capture(event, props);

export const enableAnalytics = () => {
  window.posthog?.opt_in_capturing();
  track("analytics_enabled");
};

export const disableAnalytics = () => {
  window.posthog?.opt_out_capturing();
  window.posthog?.reset();
};

export const trackLogin = (method: "password" | "google" | "saml") =>
  track("user_login", { method });

export const trackDecisionCreated = (decision_type: string) =>
  track("decision_created", { decision_type });

export const trackDecisionActioned = (action: "approved" | "rejected", decision_type: string) =>
  track("decision_actioned", { action, decision_type });

export const trackConnectorConnected = (connector_type: string) =>
  track("connector_connected", { connector_type });

export const trackBriefGenerated = () => track("executive_brief_generated");
export const trackCopilotQuery = (intent: string) => track("copilot_query", { intent });
export const trackBoardReport = () => track("board_report_viewed");
