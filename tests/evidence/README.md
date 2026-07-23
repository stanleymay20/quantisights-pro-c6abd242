# Quantivis Enterprise Evidence Framework (EE-1)

**Purpose.** Prove — not claim — that every production pipeline is correct
before a release is promoted. This directory is the runtime side of the
framework; the specification lives in `docs/enterprise/`:

- `docs/enterprise/EVIDENCE_MATRIX.md` — every pipeline, its controls, its evidence
- `docs/enterprise/RELEASE_GATE.md` — how evidence blocks releases
- `docs/enterprise/PERFORMANCE_BUDGETS.md` — measured budgets per surface

## Layout

```
tests/evidence/
  README.md              this file
  run-all.mjs            orchestrator; refuses production; validates output
  lib/
    taxonomy.mjs         PASS / WARNING / EXPECTED_DENIAL / …
    artifact.mjs         evidence.json writer + schema validation
    pipeline.mjs         stubResult() + finalize() helpers
  pipelines/
    authentication.mjs   one module per row in EVIDENCE_MATRIX.md
    …
audit-artifacts/
  YYYY-MM-DD/
    <pipeline>/evidence.json + logs, screenshots, timings
```

## Evidence schema

Every pipeline's `verify()` returns a partial record; the runner finalizes
it into the canonical shape:

```json
{
  "pipeline": "authentication",
  "start_time": "2026-07-01T00:00:00.000Z",
  "end_time": "2026-07-01T00:00:01.234Z",
  "commit_sha": "abc123",
  "environment": "staging",
  "actor": "ci@quantivis",
  "organization": "org_evidence_test",
  "status": "PASS",
  "positive_controls": [{ "name": "valid_login", "status": "PASS" }],
  "negative_controls": [{ "name": "bad_password", "status": "EXPECTED_DENIAL" }],
  "warnings": [],
  "failures": [],
  "evidence_files": ["session.json", "profile.json"]
}
```

Unknown `status` values are rejected by `lib/taxonomy.mjs`.

## Producing evidence

```bash
EVIDENCE_ENV=preview \
EVIDENCE_COMMIT=$GITHUB_SHA \
EVIDENCE_ACTOR=$GITHUB_ACTOR \
EVIDENCE_ORG=org_evidence_test \
  node tests/evidence/run-all.mjs
```

- `EVIDENCE_ENV` is required and must be `staging` or `preview`.
  The runner exits non-zero for any other value. Production is never a valid
  target.
- Every pipeline writes to `audit-artifacts/<YYYY-MM-DD>/<pipeline>/`.

## Archiving evidence

`audit-artifacts/` is the durable record. In CI it should be uploaded as a
build artifact and retained per compliance policy. Locally, prune old dates
manually; the framework never overwrites a prior day.

## Reviewing evidence

1. Open `audit-artifacts/<date>/<pipeline>/evidence.json`.
2. Confirm every positive control is `PASS`.
3. Confirm every negative control is `EXPECTED_DENIAL`.
4. Cross-reference `evidence_files` against `EVIDENCE_MATRIX.md`.
5. Run `docs/enterprise/RELEASE_GATE.md` sign-off checklist.

## Blocking a release

A release is blocked when any pipeline reports one of:

`FRAMEWORK_INVALID`, `API_FAILURE`, `PERFORMANCE_FAILURE`, `SECURITY_FAILURE`, `CRITICAL_LEAK`, `CRITICAL_FAILURE`.

Downgraded (WARNING) findings do not block but must be acknowledged in the
release ticket.

## Current status

- **Framework:** in place. `run-all.mjs` orchestrates 34 pipelines.
- **Pipeline implementations:** authentication, authorization, decision
  lifecycle, evidence/audit trail, and mocked AI recommendation/explanation/
  confidence are evidence-consuming pipelines. Remaining unwired pipelines
  return `FRAMEWORK_INVALID` with a `STUB` warning until connected to staging
  evidence.
- **CI:** not wired. `run-all.mjs` is ready for GitHub Actions but no
  workflow has been added in this sprint.

## Relationship to other harnesses

- `tests/tenant-isolation/` — feeds the `tenant-isolation` pipeline.
- `tests/e2e/` (Playwright/Python) — feeds `dashboard-loading`, `protected-routes`, etc.
- `tests/load/` (k6) — feeds `scalability` inputs for `PERFORMANCE_BUDGETS.md`.

Each of those already exists; wiring them into pipeline modules is the
remaining work.
