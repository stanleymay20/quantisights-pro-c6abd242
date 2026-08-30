# Repository Audit — Remediation Status

Updated: 2026-08-24

> This document supersedes the 2026-07-02 audit snapshot. The repository has changed substantially since that review; findings that described missing tests, failing lint, mixed lockfiles, or a minimal release gate are no longer current.

## Current release-quality baseline

The repository now treats quality and decision integrity as release requirements rather than advisory checks.

The normal CI path includes:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:trusted`
- privileged Supabase Edge-function Deno typechecks
- full Vitest suite
- evidence-framework tests
- security-configuration verification
- production build
- `npm audit --audit-level=moderate`

The production `release-gate` also includes the full certification suite before promotion.

A validated Iteration 1 run completed the ordinary CI chain successfully across lint, TypeScript, tests, evidence tests, security verification, build, and dependency audit.

## Remediation completed

### 1. Release and dependency integrity

- npm is the authoritative package-manager path for CI and release validation.
- Conflicting Bun lockfiles were removed from the release path.
- The audited transitive Nano ID vulnerability was repaired by regenerating the npm lockfile; the resolved Nano ID version is 3.3.18.
- Dependency audit is a required CI/release gate rather than an informational check.
- The tracked local `.env` file was removed; environment-specific secrets/configuration remain outside source control, with example files used for documentation.

### 2. Automated testing and evidence gates

The earlier audit statement that no test runner existed is obsolete. The repository now contains a substantial Vitest suite plus separate evidence/certification tooling, tenant-isolation tooling, and end-to-end utilities.

Decision-integrity regressions now cover, among other areas:

- approval atomicity and final-state guards;
- tenant/security boundaries;
- calibration semantics;
- decision-outcome measurement;
- evidence/provenance contracts;
- diagnostic causality language and structural-break evidence;
- institutional-memory/precedent behavior;
- accessibility and executive UX invariants.

### 3. Decision evidence and provenance

The decision-quality gate now fails closed on hard evidence prerequisites. Presentation quality, long prose, or a quantified-looking expected impact cannot compensate for absent observed data or unverified provenance.

Decision-grade recommendations require substantive evidence, a confidence basis with observed data, and verified traceability to stable source entities/datasets. Unverified recommendations are explicitly labelled and prevented from passing the decision gate.

### 4. Diagnostic epistemic integrity

The diagnostic layer no longer treats descriptive or temporal evidence as causal proof.

Current contracts distinguish:

- observed/descriptive findings;
- structural or temporal breaks;
- driver hypotheses / associated evidence;
- causal status and evidence level.

Changepoint detection is integrated as structural-break evidence and is explicitly documented as temporal evidence rather than proof of cause. Trend labels are computed against the KPI's desired direction and are not left to the LLM to override.

### 5. Outcome and calibration correctness

Manual business success, business impact, probability calibration, and forecast accuracy are now separated semantically.

AICIS probability calibration uses a binary adverse-risk-event target. Business/monetary impact is not used as a Brier-score target. Database constraints now enforce:

- binary calibration `actual_value` (`0` or `1`);
- probability-bounded `predicted_value`;
- Brier score in `[0,1]`;
- absolute probability error in `[0,1]`.

Historical invalid calibration values are cleared rather than silently reinterpreted.

### 6. Direction-aware organizational learning

Historical success is no longer inferred from `outcome_delta > 0`.

The learning/prediction path uses the expected outcome direction, so improvements such as lower churn, lower cost, lower mortality, lower fraud, or lower downtime are not misclassified as failures.

Similar-decision precedent accuracy is refreshed from canonical measured `decision_outcomes.accuracy_score` records. Missing accuracy remains unknown instead of being coerced to zero from stale embedding metadata.

### 7. Tenant and privileged-function hardening

User-triggered institutional-memory embedding is tenant-authorized before service-role access. Similar-decision and prediction paths also verify organization membership.

Public-schema privileged-function execution has been hardened so SECURITY DEFINER helpers do not inherit unintended anonymous execution. Trigger-only functions and tenant-scoped privileged RPCs have explicit execution boundaries.

A staging tenant-isolation harness exists with positive own-tenant controls and negative cross-tenant read/write probes. It fails non-zero on leaks, malformed runs, or unexpected API behavior.

### 8. Decision-state governance

Database triggers and sanctioned RPC paths enforce important lifecycle invariants, including approval requirements and final approved/rejected states. Regression coverage protects against direct-update bypasses and migration regressions.

### 9. TypeScript guardrails

The application-wide compatibility configuration remains intentionally relaxed while the codebase is migrated incrementally. However, a separate strict compiler boundary now protects trusted decision/security primitives with:

- `strict: true`;
- `noImplicitAny: true`;
- `noUncheckedIndexedAccess: true`;
- `exactOptionalPropertyTypes: true`.

`npm run typecheck:trusted` is required by CI and the production release gate. The strict boundary has expanded beyond the initial evidence primitives to include decision options, system configuration, cost-of-delay logic, calibration correction, and multiple connector authorization/isolation/validation helpers. It should continue expanding incrementally.

## Remaining work

### A. Expand strict typing beyond the current trusted kernel

`tsconfig.app.json` still uses relaxed compatibility options outside the trusted kernel. Do not flip the entire repository to strict mode in one change. Expand `tsconfig.trusted.json` iteratively to additional decision-critical modules, fixing each newly exposed error before widening the boundary.

Priority candidates include recommendation generation, outcome prediction, additional calibration utilities, and other pure decision-domain modules.

### B. Reduce `@ts-nocheck` in privileged Edge Functions

A number of Supabase Edge Functions still suppress TypeScript checking. Remove these incrementally, starting with functions that:

- use the service-role client;
- accept user-supplied `organization_id` values;
- create/update decisions or outcomes;
- handle connector credentials or privileged external integrations.

Each removal should be accompanied by authorization and regression tests rather than a bulk mechanical deletion.

### C. Configure the staging GitHub Environment

The staging deployment workflow intentionally fails closed unless the GitHub `staging` Environment contains the required deployment credentials, including:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

These are deployment-environment secrets and must not be committed to the repository. Once configured, staging can run migration/deployment verification against the real staging Supabase project.

### D. Run tenant-isolation probes against deployed staging

The tenant-isolation harness requires a real staging/preview Supabase target and service-role credentials for seeding. It should be run after staging deployment once the environment secrets are configured. It should not be replaced with a vacuous offline mock because its purpose is to verify real RLS/API behavior.

### E. Continue warning/maintainability cleanup

Lint is enforced without blocking errors, but non-fatal warnings and legacy `@ts-nocheck` usage remain. Continue reducing these by module without weakening existing release gates.

## Operational note

`main` may receive frequent concurrent edits, but CI now serializes evidence per exact commit SHA with `concurrency.group: ci-${{ github.sha }}` and `cancel-in-progress: false`. This is intentional: staging and GA-readiness checks can verify the exact CI result for the precise deployable SHA instead of inheriting or losing evidence when a newer commit appears. Treat an actual failing step as a failure; do not treat an older run as authoritative for a newer descendant SHA.

## Current remediation priority

1. Keep the existing quality/security gates mandatory.
2. Configure staging deployment credentials outside source control.
3. Run the real tenant-isolation harness against staging.
4. Expand strict TypeScript coverage across the trusted decision kernel.
5. Remove `@ts-nocheck` from privileged Edge Functions iteratively.
6. Continue performance/bundle and warning cleanup after decision/security integrity work remains green.

## 2026-08-30 remediation pass

An independent GA/commercial-readiness audit reproduced the CI chain locally
(clean `npm ci`, lint, both typecheck configs, the full Vitest suite, the
production build, and `npm audit`) rather than relying on this document's
claims, then closed the gaps it found that were fixable from source:

- **CSP drift (fixed).** `netlify.toml`'s Content-Security-Policy had fallen
  out of sync with the canonical policy in `config/security-policy.mjs` — it
  was missing the `oauth.lovable.app` origin the app's Lovable-auth
  integration needs, and still carried stale `api.openai.com` /
  `generativelanguage.googleapis.com` allowances left over from an earlier
  architecture. It's now aligned with `public/_headers` / `public/_worker.js`
  / `vercel.json` (the configs that were already correct), including the
  `Cross-Origin-Resource-Policy` and `X-DNS-Prefetch-Control` headers it was
  missing. `npm run verify:security-config` only checks for required markers,
  not full parity, so this kind of per-target drift can recur — a stronger
  gate would render all four targets from one source instead of hand-copying.
- **Oversized bundle chunks (fixed).** The production build had two chunks
  over Vite's 500 kB warning threshold. Root causes:
  - `src/i18n/runtime-translator.ts` statically imported `de-runtime.json`
    (~350 kB) into the app entry point for every visitor regardless of
    locale. It's now dynamically imported only when the active language is
    German.
  - `src/lib/workbook-parser.ts` statically imported the `xlsx` (SheetJS)
    package, pulling it into the `DataUpload` route chunk even for users who
    only ever upload CSV. `XLSX` is now a type-only import with the runtime
    module loaded via dynamic `import()` inside `parseWorkbookFile`.
  - `vite.config.ts` now assigns large vendor packages (React, the router,
    Radix UI, i18next, framer-motion, Recharts, date-fns, Supabase, PostHog,
    React Query, react-hook-form, zod, axe-core) to named `manualChunks` so
    they cache independently of app-code deploys.
  - Net effect: the main entry chunk dropped from 571 kB to ~188 kB, and the
    production build now emits zero chunks over 500 kB.
- **Stale version string (fixed).** `package.json` reported
  `0.1.0-beta.1`, which undersold the actual state of the codebase
  documented above. Bumped to `1.0.0` (lockfile regenerated to match).
- **Undocumented platform provenance (fixed).** Added a short, factual note
  to the README on the project's Lovable origin and what still comes from
  that platform (`.lovable/`, `lovable-tagger`, the Lovable OAuth/gateway
  origins in the CSP) versus what is maintained independently in this repo.
- **Lint regression (fixed).** `src/integrations/supabase/previewAuthStorage.ts`
  had picked up a `prefer-const` error (`timer` assigned once via `let`) from
  an intervening commit between the audit and this remediation pass — this
  was blocking `npm run lint`, the first step of every gate in this document.
  Fixed by declaring `timer` at its single assignment site.

### Correction: items C and D were already resolved

The paragraph above (and item **C**/**D** earlier in this document) claimed
the `staging` GitHub Environment secrets were unconfigured. That was stale.
Checked directly against GitHub Actions run history: `Deploy Supabase
Staging` and `GA Staging Validation` (which runs the real tenant-isolation
harness against the live staging Supabase project) have both been
succeeding regularly for days. Cross-tenant RLS behavior has in fact been
verified against staging, repeatedly, not merely reviewed. Do not re-flag
these as configuration gaps without checking current run history first.

## 2026-08-30 remediation pass — Client Acceptance authentication gate

`Client Acceptance` — the gate between `GA Staging Validation` and `GA
Readiness` — has been failing on every run for days, always on the
authentication evidence controls (AUTH-004, AUTH-011, AUTH-013), which
blocked `GA Readiness` from ever completing and blocked real GA
certification for any commit. Root-caused directly against the live
staging project rather than guessed at:

- **The Auth "Send Email" hook was never wired up (fixed).** `auth-email-hook`
  was deployed and active, but Supabase Auth had never been told to call it
  on staging *or* production: `public.email_send_log` had zero rows ever on
  both projects, `pgmq.metrics('auth_emails')` showed zero messages ever on
  staging, and GoTrue's own logs during a failing run showed it sending
  magic-link/recovery mail directly via its default mailer
  (`noreply@mail.app.supabase.io`) — no webhook call anywhere in the log.
  Every real user, on both environments, was getting Supabase's generic
  unbranded auth emails instead of the app's branded templates. Enabling the
  hook (Dashboard → Authentication → Hooks → Send Email, documented in
  `docs/AUTH_EMAIL_SEND_HOOK_SETUP.md`) and setting the matching
  `SEND_EMAIL_HOOK_SECRET` on staging fixed AUTH-004 immediately — confirmed
  by re-running `Client Acceptance` (run 513): the PKCE evidence capture that
  had timed out after 60s on every prior run since started succeeding in
  ~13s.
- **A second, previously-masked bug surfaced once the first was fixed
  (fixed).** With AUTH-004 no longer stalling for 60 seconds, AUTH-011's
  recovery-email request now fires against the same disposable test address
  only ~14 seconds after AUTH-004's magic-link email — inside Supabase
  Auth's built-in per-address email-send cooldown. Confirmed directly in
  GoTrue's logs: `429`, `error_code: over_email_send_rate_limit`, "you can
  only request this after 44 seconds." `e2e/auth.spec.ts`'s AUTH-011 now
  recognizes that specific 429, waits out the reported cooldown, and retries
  the recovery request once — a bounded retry of one HTTP call, not a rerun
  of the test, and it does not touch the cooldown itself (a legitimate
  anti-abuse control).
- **Production has the same hook gap, unresolved.** `izgfrekdamlgigehxoqs`
  (`quantivis-production`) also has zero rows ever in `email_send_log`. The
  setup doc covers both projects; only staging has been fixed so far.
- **Still open: AUTH-013** (recovery round-trip: new password succeeds, old
  password is rejected) failed with the same signature both before and after
  the hook fix — the "invalid login credentials" text never appeared after
  signing in with the old password. Unlike AUTH-011, AUTH-013 completes its
  own recovery via `admin.generateLink` (not the rate-limited `/recover`
  endpoint), so this is not explained by the same cooldown and needs its own
  investigation. Re-run `Client Acceptance` after the AUTH-011 fix lands to
  see whether it was a downstream effect or an independent bug.
- **Also worth reconciling:** `docs/DEPLOYMENT_SECRETS.md` names the
  production project ref as `itpwpnwzzitkelffttyx`; the account's actual
  live projects are `izgfrekdamlgigehxoqs` (production) and
  `cmnihsbdbpubznlkmjbc` (staging). `itpwpnwzzitkelffttyx` does not resolve
  via this session's Supabase access (permission error, not "not found" —
  it may belong to a different org, or `production` may in fact be served
  through a different mechanism entirely: the live `quantivis.io` frontend
  was observed showing a "Powered by Netlify" badge, which doesn't match the
  Lovable+Cloudflare hosting path described in
  `docs/CLOUDFLARE_ENTERPRISE_SECURITY.md` / `docs/HOSTING_SECURITY_HEADERS.md`.
  Confirm which hosting path and which project ref are actually current
  before trusting either doc.
