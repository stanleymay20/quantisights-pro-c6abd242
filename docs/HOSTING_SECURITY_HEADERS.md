# Hosting security headers

As of June 25, 2026, the Lovable custom-domain deployment does not return the
repository's CSP or framing policy as HTTP response headers. Files such as
`public/_headers` are present in the repository but are not evidence that the
active hosting layer applies them.

The production origin must return these headers:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://eu-assets.i.posthog.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://ai.gateway.lovable.dev https://api.stripe.com https://sheets.googleapis.com https://oauth2.googleapis.com https://login.microsoftonline.com https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.de.sentry.io; worker-src 'self' blob:; frame-src https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

`frame-ancestors` is effective only in an HTTP CSP header. A meta tag cannot
enforce it.

## Lovable/custom-domain setup

1. Configure these values in the response-header controls for the actual
   Lovable production origin and custom domain.
2. If Lovable cannot set them, place a controlled CDN or reverse proxy such as
   Cloudflare in front of the custom domain and add a Response Header Transform
   Rule or Worker that supplies the exact headers.
3. Do not mark the control verified until the custom-domain HTTP response
   contains the headers.
4. Recheck Sentry, PostHog, authentication, and application assets after
   enabling CSP. Add sources only when a browser violation demonstrates they
   are required.

Verify with:

```bash
curl -sS -I https://www.quantivis.io/
curl -sS -I https://www.quantivis.io/security
```

Both responses must contain the required header names and effective values.

## Embedded route exception

If `/embed` is intentionally frameable, it needs a separate response policy
with an explicit customer allowlist in `frame-ancestors` and must not receive
`X-Frame-Options: DENY`. Do not loosen the global policy for this exception.
