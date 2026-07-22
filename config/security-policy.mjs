export const POSTHOG_SCRIPT_ORIGINS = [
  "https://eu-assets.i.posthog.com",
];

export const OBSERVABILITY_CONNECT_ORIGINS = [
  "https://eu.posthog.com",
  "https://eu.i.posthog.com",
  "https://eu-assets.i.posthog.com",
  "https://*.ingest.de.sentry.io",
];

const BASE_DIRECTIVES = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://accounts.google.com ${POSTHOG_SCRIPT_ORIGINS.join(" ")}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://ai.gateway.lovable.dev https://api.stripe.com https://sheets.googleapis.com https://oauth2.googleapis.com https://login.microsoftonline.com ${OBSERVABILITY_CONNECT_ORIGINS.join(" ")}`,
  "worker-src 'self' blob:",
  "frame-src https://accounts.google.com",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

export const normalizeEmbedOrigins = (rawOrigins = "") => {
  const origins = rawOrigins
    .split(/[\s,]+/)
    .map((origin) => origin.trim())
    .filter((origin) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin));

  return origins.length > 0 ? [...new Set(origins)] : ["'none'"];
};

export const buildContentSecurityPolicy = ({
  frameAncestors = ["'none'"],
} = {}) =>
  [...BASE_DIRECTIVES, `frame-ancestors ${frameAncestors.join(" ")}`].join("; ");

export const STANDARD_CSP = buildContentSecurityPolicy();
export const EMBED_CSP = buildContentSecurityPolicy({
  frameAncestors: normalizeEmbedOrigins(process.env.EMBED_ALLOWED_ORIGINS),
});
