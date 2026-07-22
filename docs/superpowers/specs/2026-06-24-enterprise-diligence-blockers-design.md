# Enterprise Diligence Blockers — Design

## Objective

Remove four buyer-facing diligence blockers before additional Phase 3 work:

1. Restore browser observability for PostHog and Sentry.
2. Deliver CSP only through valid HTTP response headers, including worker and framing rules.
3. Make `/trust` a live public trust surface.
4. Give key procurement and product routes distinct metadata.

The change must preserve the existing application behavior and green production build.

## Scope

### Included

- Centralized route metadata for:
  - `/security`
  - `/how-ai-is-used`
  - `/ai-system-classification`
  - `/impressum`
  - `/pricing`
  - `/compare`
  - `/copilot`
  - `/embed`
  - `/trust`
- A public `/trust` route backed by the existing `TrustCenter` implementation.
- Internal trust links standardized on `/trust`.
- CSP corrections across Vercel, Cloudflare Pages, and static-host header configuration.
- PostHog EU and Sentry ingestion connectivity.
- Blob worker support required by browser observability SDKs.
- Route-specific framing policy for `/embed`.
- Automated regression coverage and production-build verification.

### Excluded

- Expanding the content of the AI governance pages.
- Creating the public integrations page.
- Creating a public Copilot teaser.
- Redesigning the embed experience.
- Changing telemetry consent behavior.
- Adding or changing vendors.

## Metadata Architecture

Create a small reusable `PageMetadata` component that owns runtime document-head updates. It accepts:

- `title`
- `description`
- `canonicalPath`
- optional Open Graph type
- optional robots directive

It updates and restores:

- document title
- meta description
- canonical link
- Open Graph title, description, URL, and type
- Twitter title and description
- robots metadata when supplied

The audited routes will render this component with route-specific copy. This avoids adding another dependency and follows the existing runtime metadata approach used by `DecisionIntelligencePlatforms`, while removing duplication for future pages.

Authenticated surfaces such as `/copilot` remain protected. Their metadata still describes the product surface, but `/copilot` will use `noindex, nofollow` because logged-out visitors cannot access its content. `/embed` will also use `noindex, nofollow` because it is a token-authenticated rendering endpoint rather than a buyer landing page.

## Trust Route

Add `/trust` as the canonical public route for the existing `TrustCenter` component. Keep `/trust-center` as a compatibility redirect to `/trust` so existing external links do not break.

Update public navigation, procurement content, Copilot destination mappings, and other direct internal references from `/trust-center` to `/trust`. Textual historical references in documentation may remain when they are not runtime links.

The trust page will receive its own metadata and canonical URL at `https://www.quantivis.io/trust`.

## CSP and Security Headers

Remove the CSP meta element from `index.html`. `frame-ancestors` is ineffective in a meta-delivered policy and CSP should have one authoritative delivery mechanism per deployment target.

Maintain equivalent policies in:

- `vercel.json`
- `public/_headers`
- `public/_worker.js`

The standard policy will add:

- PostHog EU script and connection origins.
- Sentry regional ingestion origins.
- `worker-src 'self' blob:`.
- `frame-ancestors 'none'`.

The `/embed` response policy will replace `frame-ancestors 'none'` with an environment-configured origin list. If no allowlist is configured, it fails closed with `'none'`.

For Cloudflare, the worker reads a comma- or whitespace-delimited environment value such as `EMBED_ALLOWED_ORIGINS`. For static/Vercel configuration, deployment configuration must contain the corresponding explicit origins because those files cannot interpolate runtime environment variables. The initial checked-in policy will fail closed until approved customer origins are configured.

`X-Frame-Options` remains protective on standard routes. It must not be emitted on `/embed`, because legacy frame restrictions would otherwise override the intended customer embedding behavior.

## Telemetry Origins

PostHog requires its EU application and ingestion hosts in the appropriate directives. Sentry requires the configured `ingest.de.sentry.io` endpoint in `connect-src`.

The policy will be narrow: only the hosts used by the current configured SDK endpoints are allowed. Wildcards will be used only where Sentry project subdomains require them and where supported by CSP host matching.

## Tests

Add focused tests that fail before implementation and pass afterward:

1. Route metadata map contains unique titles and descriptions for all audited routes.
2. `/trust` is registered publicly and `/trust-center` redirects to it.
3. Runtime trust links no longer target `/trust-center`.
4. CSP sources contain PostHog, Sentry, and blob worker allowances.
5. `index.html` contains no CSP meta element.
6. Standard routes deny framing; `/embed` uses the dedicated framing policy and omits `X-Frame-Options`.

Existing unit and integration tests remain unchanged unless they encode the obsolete route.

## Verification

Run:

- focused regression tests
- full Vitest suite
- production build
- Playwright navigation checks for `/trust` and audited metadata routes
- browser console inspection confirming no CSP violations for PostHog, Sentry, or blob workers when telemetry is configured
- response-header inspection for a standard route and `/embed`

## Acceptance Criteria

- `/trust` renders the trust center and returns the SPA successfully.
- `/trust-center` resolves to `/trust` without a 404.
- Each audited route has distinct title and description metadata.
- No CSP is delivered through a meta tag.
- Browser telemetry requests are permitted by CSP.
- Blob workers are permitted.
- `frame-ancestors` is delivered by HTTP header.
- Standard pages cannot be framed.
- `/embed` can be framed only by configured customer origins and fails closed otherwise.
- Tests and production build pass.
