# Enterprise Readiness Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a locally verified, deployment-ready foundation that removes the public enterprise diligence blockers and makes the repository release gate reproducible.

**Architecture:** Separate buyer-facing metadata, routing, and security policy into testable modules instead of page-local side effects and duplicated deployment configuration. Repair the existing ingestion regressions and dependency lock before treating the release gate as authoritative. Keep deployment outside this plan; the final output is a verified commit ready for explicit deployment approval.

**Tech Stack:** React 18, React Router 6, TypeScript, Vite, Vitest, Playwright, Cloudflare/Lovable response headers.

---

### Task 1: Add enterprise-readiness regression tests

**Files:**
- Create: `src/test/enterprise-readiness-foundation.test.ts`
- Create: `e2e/enterprise-readiness.spec.ts`
- Inspect: `src/routes/index.tsx`
- Inspect: `index.html`
- Inspect: `public/_headers`
- Inspect: `public/_worker.js`
- Inspect: `vercel.json`

- [ ] **Step 1: Write failing source-level tests**

Add Vitest assertions that:

- the `/trust` route exists;
- `/trust-center` redirects to `/trust`;
- metadata definitions are unique for the audited routes;
- `index.html` has no CSP meta element;
- every checked-in CSP policy includes Sentry, PostHog, and `worker-src 'self' blob:`;
- standard framing is denied and embed framing has a dedicated policy.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec vitest run src/test/enterprise-readiness-foundation.test.ts
```

Expected: FAIL because the metadata module and `/trust` route do not exist and CSP is still meta-delivered.

- [ ] **Step 3: Write failing deployed-behavior E2E tests**

Add Playwright checks for:

- `/trust` renders `Trust Center`;
- `/trust-center` resolves to `/trust`;
- audited routes have distinct rendered titles and canonical URLs;
- `/embed` is `noindex`;
- browser console contains no CSP violations for Sentry, PostHog, or blob workers.

- [ ] **Step 4: Run the focused E2E test against the current production URL**

Run:

```powershell
$env:E2E_BASE_URL='https://www.quantivis.io'
npx playwright test e2e/enterprise-readiness.spec.ts --project=chromium --reporter=line
```

Expected: FAIL on trust routing, metadata, and CSP console errors. This records the live pre-fix baseline.

- [ ] **Step 5: Commit the red tests**

```powershell
git add src/test/enterprise-readiness-foundation.test.ts e2e/enterprise-readiness.spec.ts
git commit -m "test: define enterprise readiness foundation"
```

### Task 2: Centralize page metadata and trust routing

**Files:**
- Create: `src/lib/page-metadata.ts`
- Create: `src/components/PageMetadata.tsx`
- Modify: `src/routes/index.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/DecisionIntelligencePlatforms.tsx`
- Modify audited pages under `src/pages/`
- Modify runtime trust links under `src/`
- Test: `src/test/enterprise-readiness-foundation.test.ts`

- [ ] **Step 1: Define typed metadata records**

Create a route metadata map with title, description, canonical path, and optional robots values for:

- `/trust`
- `/security`
- `/how-ai-is-used`
- `/ai-system-classification`
- `/impressum`
- `/pricing`
- `/compare`
- `/copilot`
- `/embed`
- `/decision-intelligence-platforms`

Use `noindex, nofollow` for `/copilot` and `/embed`.

- [ ] **Step 2: Implement `PageMetadata`**

Implement one component that updates title, description, canonical, Open Graph, Twitter, and robots tags and restores previous values on unmount.

- [ ] **Step 3: Apply metadata at the route wrapper**

Read the current location with `useLocation`, look up metadata, and render `PageMetadata` once near the router. Remove the duplicated metadata effect from `DecisionIntelligencePlatforms`.

- [ ] **Step 4: Add canonical trust routing**

Register `/trust` as the public `TrustCenter` route. Replace `/trust-center` with `<Navigate to="/trust" replace />`.

- [ ] **Step 5: Standardize runtime links**

Replace user-facing and runtime navigation references to `/trust-center` with `/trust`, including landing navigation, procurement pages, and Copilot destination mappings.

- [ ] **Step 6: Run focused tests**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec vitest run src/test/enterprise-readiness-foundation.test.ts
```

Expected: metadata and trust-routing assertions PASS; CSP assertions remain FAIL.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/page-metadata.ts src/components/PageMetadata.tsx src/routes/index.tsx src/App.tsx src/pages src/hooks/useCopilotTelemetry.ts src/lib/copilot-answer-engine.ts src/test/enterprise-readiness-foundation.test.ts
git commit -m "feat: add canonical trust route and page metadata"
```

### Task 3: Create one authoritative CSP policy

**Files:**
- Create: `config/security-policy.mjs`
- Create: `scripts/render-security-config.mjs`
- Modify: `index.html`
- Modify: `public/_headers`
- Modify: `public/_worker.js`
- Modify: `vercel.json`
- Modify: `package.json`
- Test: `src/test/enterprise-readiness-foundation.test.ts`

- [ ] **Step 1: Define standard and embed policies**

The standard policy must include:

```text
script-src ... https://eu-assets.i.posthog.com
connect-src ... https://eu.posthog.com https://eu.i.posthog.com https://eu-assets.i.posthog.com https://*.ingest.de.sentry.io
worker-src 'self' blob:
frame-ancestors 'none'
```

The embed policy must replace the standard `frame-ancestors` value with configured customer origins and fail closed with `'none'`.

- [ ] **Step 2: Remove CSP meta delivery**

Delete the CSP `<meta>` element from `index.html`. Keep referrer and content-type meta fallbacks only where valid.

- [ ] **Step 3: Generate deployment configurations**

Use `scripts/render-security-config.mjs` to render equivalent policies into Vercel, static headers, and the Cloudflare worker. The worker must omit `X-Frame-Options` on `/embed`.

- [ ] **Step 4: Add configuration verification script**

Add:

```json
"verify:security-config": "node scripts/render-security-config.mjs --check"
```

The check exits non-zero when generated files drift from the canonical policy.

- [ ] **Step 5: Run focused tests and config verification**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec vitest run src/test/enterprise-readiness-foundation.test.ts
& 'C:\Program Files\nodejs\npm.cmd' run verify:security-config
```

Expected: all source-level enterprise-readiness tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add config/security-policy.mjs scripts/render-security-config.mjs index.html public/_headers public/_worker.js vercel.json package.json src/test/enterprise-readiness-foundation.test.ts
git commit -m "fix: enforce deployable observability CSP"
```

### Task 4: Make public claims evidence-safe

**Files:**
- Modify: `src/components/auth/AuthLayout.tsx`
- Modify: `src/pages/SystemStatus.tsx`
- Modify: `src/pages/Security.tsx`
- Modify: `src/pages/EnterpriseReadiness.tsx`
- Test: `src/test/enterprise-readiness-foundation.test.ts`
- Test: `e2e/enterprise-readiness.spec.ts`

- [ ] **Step 1: Add failing wording and status tests**

Assert that:

- login does not imply Quantivis holds SOC 2 Type II certification;
- SSO and SCIM are described as available only when configured;
- no-data status is `Awaiting telemetry`, not `All Systems Operational`;
- jobs with no recorded runs do not contribute to a healthy status.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' exec vitest run src/test/enterprise-readiness-foundation.test.ts
```

Expected: FAIL on current wording and no-data status behavior.

- [ ] **Step 3: Implement evidence-safe wording**

Replace absolute claims with:

- “Controls aligned to SOC 2; independent audit in progress.”
- “Enterprise SSO, SCIM, and MFA available when configured.”

Keep infrastructure-provider certifications clearly separate from Quantivis entity certification.

- [ ] **Step 4: Implement truthful status state**

Add an explicit `unknown` state when no monitoring evidence exists or required queries fail. Render “Awaiting telemetry” with explanatory copy. Do not report operational status from an empty failure list.

- [ ] **Step 5: Run focused tests**

Expected: wording and status tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/components/auth/AuthLayout.tsx src/pages/SystemStatus.tsx src/pages/Security.tsx src/pages/EnterpriseReadiness.tsx src/test/enterprise-readiness-foundation.test.ts e2e/enterprise-readiness.spec.ts
git commit -m "fix: align enterprise claims with live evidence"
```

### Task 5: Restore reproducible dependencies and the release gate

**Files:**
- Modify: `package-lock.json`
- Modify: `src/lib/semantic-column-classifier.ts`
- Modify: `src/lib/ingestion-auto-fix.ts`
- Modify: `src/lib/ingestion-remediation.ts`
- Modify: related tests only when an expectation is demonstrably invalid
- Modify: `eslint.config.js`
- Modify: `package.json`

- [ ] **Step 1: Regenerate the lockfile without changing declared versions**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' install --package-lock-only
& 'C:\Program Files\nodejs\npm.cmd' ci --dry-run
```

Expected: clean-install dry run succeeds.

- [ ] **Step 2: Reproduce each failing ingestion test individually**

Run the four failing files separately and document the failure category:

- semantic classification precedence;
- locale-aware numeric normalization;
- date parsing timezone drift;
- PII/remediation issue generation.

- [ ] **Step 3: Fix production behavior using red-green cycles**

Implement the smallest corrections in the classifier, normalizer, and remediation workflow. Do not weaken assertions that protect PII detection, German numeric parsing, or semantic KPI classification.

- [ ] **Step 4: Run the full test suite**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run test
```

Expected: 405/405 tests PASS.

- [ ] **Step 5: Establish an honest lint gate**

Split lint into:

- `lint`: production frontend and shared libraries changed by normal PRs;
- `lint:functions`: Supabase function debt tracked separately until remediated;
- `lint:all`: complete repository.

Do not suppress parser errors, `@ts-nocheck`, or new violations. Record the current legacy function debt as a finite baseline and fail when it increases.

- [ ] **Step 6: Run build and release checks**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' ci
& 'C:\Program Files\nodejs\npm.cmd' run test
& 'C:\Program Files\nodejs\npm.cmd' run lint
& 'C:\Program Files\nodejs\npm.cmd' run build
& 'C:\Program Files\nodejs\npm.cmd' run verify:security-config
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add package-lock.json package.json eslint.config.js src/lib src/test
git commit -m "fix: restore reproducible enterprise release gate"
```

### Task 6: Verify the complete pre-deploy candidate

**Files:**
- Modify if needed: `e2e/enterprise-readiness.spec.ts`
- Modify: `docs/release-gate.md`
- Create: `docs/ENTERPRISE_READINESS_PHASE_1_EVIDENCE.md`

- [ ] **Step 1: Run local production preview**

Build and serve the candidate locally, then point Playwright at the preview URL.

- [ ] **Step 2: Run public E2E suites**

Run:

```powershell
$env:E2E_BASE_URL='http://127.0.0.1:4173'
npx playwright test e2e/navigation.spec.ts e2e/enterprise-readiness.spec.ts --project=chromium --reporter=line
```

Expected: all public and enterprise-readiness checks PASS.

- [ ] **Step 3: Inspect headers in the deployment-equivalent harness**

Verify standard routes emit the standard policy and `/embed` emits the embed policy without `X-Frame-Options`.

- [ ] **Step 4: Run the complete release gate**

Run:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run release-gate
```

Expected: exit 0 and certification status PASS.

- [ ] **Step 5: Write evidence report**

Record command outputs, test counts, known residual risks, and explicit unverified authenticated controls. Do not assign a 10/10 score until authenticated tenant, MFA, SSO/SCIM, deletion, and recovery testing passes in later phases.

- [ ] **Step 6: Commit**

```powershell
git add e2e/enterprise-readiness.spec.ts docs/release-gate.md docs/ENTERPRISE_READINESS_PHASE_1_EVIDENCE.md
git commit -m "docs: record enterprise readiness foundation evidence"
```
