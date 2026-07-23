/**
 * Cloudflare Pages Worker — Security Headers Middleware
 *
 * Injects enterprise-grade security headers on every response.
 * Deployed automatically when quantivis.io is served via Cloudflare Pages.
 * This is the primary mechanism for headers that cannot be set via meta tags
 * (X-Frame-Options, Permissions-Policy, Cross-Origin-Opener-Policy).
 */

const SECURITY_HEADERS = {
  // Prevent MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Clickjacking protection (belt-and-suspenders alongside CSP frame-ancestors)
  'X-Frame-Options': 'SAMEORIGIN',

  // Force HTTPS for 1 year
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Referrer privacy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Restrict browser feature APIs
  'Permissions-Policy': [
    'camera=()',
    'microphone=()',
    'geolocation=()',
    'payment=()',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'interest-cohort=()',
  ].join(', '),

  // Prevent cross-origin window attacks (popup flows allowed for Google OAuth)
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',

  // Restrict cross-origin resource sharing to same site
  'Cross-Origin-Resource-Policy': 'same-site',

  // Enable DNS prefetch for performance
  'X-DNS-Prefetch-Control': 'on',

  // Remove server fingerprint
  'Server': 'quantivis',
};

const BASE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com https://oauth.lovable.app https://eu-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://oauth.lovable.app https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://ai.gateway.lovable.dev https://api.stripe.com https://sheets.googleapis.com https://oauth2.googleapis.com https://login.microsoftonline.com https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.de.sentry.io",
  "worker-src 'self' blob:",
  "frame-src https://accounts.google.com https://oauth.lovable.app",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
];
const STANDARD_CSP = [...BASE_CSP, "frame-ancestors 'none'"].join('; ');
const OAUTH_BROKER_PATH_PREFIX = "/~oauth/";
const OAUTH_CALLBACK_PATH = "/auth/callback";

const embedFrameAncestors = (env) => {
  const origins = String(env.EMBED_ALLOWED_ORIGINS ?? "")
    .split(/[\s,]+/)
    .filter((origin) => /^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin));
  return origins.length > 0 ? origins.join(" ") : "'none'";
};

export default {
  async fetch(request, env) {
    // Forward request to the Cloudflare Pages asset server
    const response = await env.ASSETS.fetch(request);
    const { pathname } = new URL(request.url);
    if (pathname.startsWith(OAUTH_BROKER_PATH_PREFIX) || pathname === OAUTH_CALLBACK_PATH) {
      return response;
    }

    const isEmbed = pathname === "/embed" || pathname.startsWith("/embed/");

    // Clone to make headers mutable
    const newResponse = new Response(response.body, response);

    // Inject all security headers
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      newResponse.headers.set(key, value);
    }
    if (isEmbed) {
      newResponse.headers.delete('X-Frame-Options');
    }
    const csp = isEmbed
      ? [...BASE_CSP, `frame-ancestors ${embedFrameAncestors(env)}`].join('; ')
      : STANDARD_CSP;
    newResponse.headers.set('Content-Security-Policy', csp);

    return newResponse;
  },
};
