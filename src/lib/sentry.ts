/**
 * Sentry integration for enterprise-grade frontend observability.
 *
 * To activate: set VITE_SENTRY_DSN in your environment.
 * Without a DSN, Sentry is a no-op — the app runs normally.
 */
import * as Sentry from "@sentry/react";

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || "https://5635ca5fa91da3f54c611bd47fc7723b@o4511149684228096.ingest.de.sentry.io/4511149708869712";

function detectEnvironment(): string {
  const explicit = import.meta.env.VITE_SENTRY_ENVIRONMENT;
  if (explicit) return explicit;

  if (import.meta.env.DEV) return "development";

  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host.includes("preview") || host.includes("localhost") || host.includes("127.0.0.1"))
    return "development";
  if (host.includes("staging") || host.includes("beta"))
    return "staging";
  return "production";
}

function detectRelease(): string {
  const explicit = import.meta.env.VITE_APP_RELEASE;
  if (explicit) return `quantivis@${explicit}`;

  const sha = import.meta.env.VITE_GIT_SHA;
  if (sha) return `quantivis@${String(sha).slice(0, 7)}`;

  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `quantivis@${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

const SENTRY_ENV = detectEnvironment();
const SENTRY_RELEASE = detectRelease();
let initialized = false;

export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.info("[Sentry] No DSN configured — running without external error monitoring.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENV,
    release: SENTRY_RELEASE,

    // Performance
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 1.0,

    // Filtering
    ignoreErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
      "AbortError",
      /Loading chunk \d+ failed/,
    ],

    beforeSend(event) {
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((bc) => {
          if (bc.data?.url) {
            try {
              const url = new URL(bc.data.url as string);
              url.searchParams.delete("token");
              url.searchParams.delete("key");
              bc.data.url = url.toString();
            } catch { /* ignore */ }
          }
          return bc;
        });
      }
      return event;
    },

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
  initialized = true;

  console.info(`[Sentry] env=${SENTRY_ENV} release=${SENTRY_RELEASE}`);
}

export function recordObservabilityStartup(): void {
  if (!initialized || typeof window === "undefined") return;
  const key = "quantivis_sentry_startup_recorded";
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "true");
  Sentry.captureMessage("quantivis_frontend_initialized", {
    level: "info",
    tags: { diagnostic: "startup" },
  });
}

export const getSentryStatus = () => ({
  configured: Boolean(SENTRY_DSN),
  initialized,
  environment: SENTRY_ENV,
  release: SENTRY_RELEASE,
});

/** Set user context after authentication */
export function setSentryUser(userId: string, email?: string, orgId?: string): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser({ id: userId, email });
  if (orgId) Sentry.setTag("organization_id", orgId);
}

/** Clear user on logout */
export function clearSentryUser(): void {
  if (!SENTRY_DSN) return;
  Sentry.setUser(null);
}

/** Capture a manual error with context */
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.captureException(error, { extra: context });
}

/** Add breadcrumb for important actions */
export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
  if (!SENTRY_DSN) return;
  Sentry.addBreadcrumb({ message, category, data, level: "info" });
}

export { Sentry };
