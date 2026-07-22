# Live COO Readiness Audit

**Audit date:** June 24, 2026  
**Target:** `https://www.quantivis.io`  
**Assessment:** Public application is not ready for enterprise COO diligence.

## Method

This audit inspected the deployed application rather than repository claims or roadmap documents. Evidence included:

- live HTTP responses and headers;
- JavaScript-rendered page content and metadata;
- browser console errors;
- failed browser network requests;
- logged-out route behavior.

Authenticated product workflows were not assessed because no test account was available.

## Meeting Blockers

### 1. Browser observability is blocked

Sentry envelope requests are rejected by the active Content Security Policy on every tested page.

PostHog configuration scripts, feature-flag requests, and ingestion connections are also rejected when the SDK initializes.

The deployed application therefore cannot substantiate claims of functioning browser monitoring from the tested public session.

### 2. Production CSP delivery is invalid and incomplete

The live HTTP responses do not include a `Content-Security-Policy` header or `X-Frame-Options`.

The application instead delivers CSP through a `<meta http-equiv="Content-Security-Policy">` element. Browsers report that `frame-ancestors` is ignored when delivered this way.

The policy also has no `worker-src` directive. Blob workers used by the observability SDKs fall back to `script-src` and are blocked.

### 3. `/trust` is a live 404

`https://www.quantivis.io/trust` returns the SPA shell with HTTP 200 but renders:

- `<h1>404</h1>`;
- “Page not found”;
- “The page /trust doesn't exist.”

The substantive trust content currently exists at `/trust-center`.

### 4. Procurement metadata is duplicated

The following rendered routes retain the generic homepage title, description, and homepage canonical URL:

- `/security`
- `/how-ai-is-used`
- `/ai-system-classification`
- `/impressum`
- `/pricing`
- `/compare`
- `/copilot`
- `/embed`
- `/trust-center`

`/decision-intelligence-platforms` is the verified exception and renders route-specific metadata.

### 5. Certification wording is inconsistent

The logged-out sign-in experience claims “SOC 2 Type II controls.”

The live Trust Center states:

- “SOC 2 Type II — In progress”;
- audit firm engagement targeted for Q3 2026;
- controls assessment underway.

This distinction must be made explicit. Current wording can be interpreted as claiming completed certification.

## Buyer-Surface Gaps

### `/compare`

Logged-out visitors are redirected to `/login`. There is no public comparison surface at that route.

### `/copilot`

Logged-out visitors are redirected to `/login`. There is no public natural-language product teaser at that route.

### `/embed`

Logged-out visitors see only:

> Access Denied  
> Missing embed token

There is no public explainer for the embedded or white-label capability.

## Verified Strengths

- Tested routes load without a React error-boundary failure.
- HSTS is present with a one-year `includeSubDomains` policy.
- `X-Content-Type-Options: nosniff` is present.
- `Referrer-Policy: strict-origin-when-cross-origin` is present.
- `/security`, `/pricing`, and `/trust-center` contain substantive procurement content.
- `/decision-intelligence-platforms` renders a distinct title, description, canonical URL, and H1.

## Recommendation

Do not add more Phase 3 buyer surfaces until the diligence blockers are fixed:

1. move CSP entirely to production HTTP headers;
2. allow the required PostHog, Sentry, and blob-worker sources;
3. implement `/trust` and retain `/trust-center` only as a compatibility redirect;
4. add unique metadata and canonical URLs to procurement routes;
5. correct certification wording so implemented controls and completed attestations are not conflated;
6. rerun this audit against the deployed build.

## Conclusion

The application may be suitable for a controlled authenticated demonstration, but the public diligence surface would currently fail an enterprise security, procurement, or executive review before evaluators reach the product.
