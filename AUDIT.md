# Repository Audit — Remediation Status

Updated: 2026-08-14

> This document supersedes the 2026-07-02 audit snapshot. The repository has changed substantially since that review; findings that described missing tests, failing lint, mixed lockfiles, or a minimal release gate are no longer current.

## Current release-quality baseline

The repository now treats quality and decision integrity as release requirements rather than advisory checks.

The normal CI path includes:

- `npm ci`
- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:trusted`
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

`npm run typecheck:trusted` is required by CI and the production release gate. The initial strict boundary covers evidence-contract, decision-maturity, and safe-navigation primitives and should be expanded incrementally.

## Remaining work

### A. Expand strict typing beyond the initial trusted kernel

`tsconfig.app.json` still uses relaxed compatibility options outside the trusted kernel. Do not flip the entire repository to strict mode in one change. Expand `tsconfig.trusted.json` iteratively to additional decision-critical modules, fixing each newly exposed error before widening the boundary.

Priority candidates include recommendation generation, cost-of-delay logic, outcome prediction, calibration utilities, and other pure decision-domain modules.

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

`main` is currently receiving frequent concurrent edits. CI uses `cancel-in-progress: true`, so a healthy run may be marked cancelled when a newer commit supersedes it. Treat the newest descendant run as authoritative and distinguish supersession from an actual failing step.

## Current remediation priority

1. Keep the existing quality/security gates mandatory.
2. Configure staging deployment credentials outside source control.
3. Run the real tenant-isolation harness against staging.
4. Expand strict TypeScript coverage across the trusted decision kernel.
5. Remove `@ts-nocheck` from privileged Edge Functions iteratively.
6. Continue performance/bundle and warning cleanup after decision/security integrity work remains green.
