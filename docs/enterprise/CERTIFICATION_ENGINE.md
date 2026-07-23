# Quantivis Enterprise Certification Engine (EC-1 + EC-2)

The Certification Engine is the **single authority** that decides whether a
Quantivis release candidate is enterprise-ready. It does not generate
evidence — it governs it.

- **EE-1**: Enterprise Evidence Framework — produces evidence artifacts.
- **EC-1**: Certification Engine — reads those artifacts and issues one
  certification per release.
- **EC-2**: Hardening — immutable run-scoped artifacts, run IDs, safe
  history, docs parity, regression tests, release provenance.

## 1. Inputs

The engine reads exactly one directory:

```
audit-artifacts/<YYYY-MM-DD>/<pipeline>/evidence.json
```

Each `evidence.json` is produced by a pipeline module registered in
`tests/evidence/pipelines/` and validated against the schema in
`tests/evidence/lib/artifact.mjs`. The reserved subdirectory
`certifications/` is skipped by the reader.

Nothing else is consulted. The engine will not contact the backend, hit an
edge function, or call an AI model. If evidence is missing, the missing
pipelines are treated as blocking (`FRAMEWORK_INVALID`).

## 2. Outputs (immutable, run-scoped)

Every certification writes into a run-scoped folder — never overwriting a
prior run:

```
audit-artifacts/<YYYY-MM-DD>/certifications/<run_id>/
  CERTIFICATION.json
  CERTIFICATION.md
  EXECUTIVE_SUMMARY.md
```

Plus one appended entry in `audit-artifacts/history.json`.

If a run folder already exists, the engine **refuses to overwrite** it and
exits with code 3. Pass `--force` to override (audit trail is preserved
because a new run_id would normally be generated).

## 3. Run ID

Every certification is stamped with a unique `run_id` of the form:

```
2026-07-01T06-45-02-210Z-<8 hex>
```

The hex suffix is `crypto.randomUUID()`; a `randomBytes(4)` and
`Math.random` fallback exist to keep the engine dependency-free. `run_id`
appears in every artifact, in `history.json`, and in the folder path.

Tests inject a deterministic `run_id`, `timestamp`, and `duration_ms`.

## 4. Release provenance

Every certification artifact embeds:

- `run_id`
- `release`
- `commit`         (env: `EVIDENCE_COMMIT` or `GITHUB_SHA`)
- `branch`         (env: `EVIDENCE_BRANCH` or `GITHUB_REF_NAME`)
- `repository`     (env: `EVIDENCE_REPOSITORY` or `GITHUB_REPOSITORY`)
- `environment`    (must be `staging` or `preview` — production is refused)
- `generated_by`   (env: `EVIDENCE_ACTOR` or `GITHUB_ACTOR`)
- `certification_engine_version`
- `timestamp`

## 5. Certification decisions

| Decision | Meaning | Recommendation |
|---|---|---|
| `PASS` | Every gate PASS, no warnings | Ship |
| `PASS_WITH_WARNINGS` | Every gate PASS but ≥1 warning | Ship with acknowledgement |
| `CONDITIONAL_RELEASE` | Exactly one blocked non-critical gate | Hold — conditional |
| `BLOCKED` | Multiple blocked gates | Hold |
| `CRITICAL_BLOCK` | Any `SECURITY_FAILURE` / `CRITICAL_LEAK` / `CRITICAL_FAILURE`, or a disallowed environment | Rollback / do not deploy |

## 6. Gates

Gates and weights live in `tests/evidence/lib/gates.mjs` — the **single
source of truth**. Both `docs/enterprise/RELEASE_GATE.md` and
`docs/enterprise/EVIDENCE_MATRIX.md` contain an auto-generated block that
is validated by:

```bash
npm run evidence:docs          # exits 1 on drift
npm run evidence:docs:write    # regenerate the auto-generated block
```

## 7. Scoring (normalized 0–100)

```
score = round( Σ (weight_i × factor_i) / TOTAL_WEIGHT × 100 )
```

- Factor per gate: `PASS` → 1.0, `PASS_WITH_WARNINGS` → 0.5, `BLOCKED` → 0.
- Weights are **not** required to sum to 100. The current TOTAL_WEIGHT and
  the full weight table are auto-generated from `tests/evidence/lib/gates.mjs`
  in the block below and validated by `npm run evidence:docs`.
- Non-scoring gates (weight 0) can still hard-block a release
  (`audit`, `notifications`, `billing`) — they must PASS but do not move
  the score.
- Any change to weights or scoring math **requires bumping
  `CERTIFICATION_ENGINE_VERSION`** in `tests/evidence/lib/provenance.mjs`.

<!-- AUTO-GENERATED:GATES:START (do not edit — run npm run evidence:docs:write) -->

### Canonical weights (generated from `tests/evidence/lib/gates.mjs`)

**TOTAL_WEIGHT = 110** (score denominator).

| Gate key | Label | Weight | Pipelines |
|---|---|---:|---|
| `authentication` | Authentication | 10 | `authentication`, `mfa`, `oauth`, `session-recovery` |
| `authorization` | Authorization | 10 | `authorization` |
| `tenant_isolation` | Tenant Isolation | 15 | `tenant-isolation`, `edge-functions`, `realtime` |
| `decision_pipeline` | Decision Pipeline | 10 | `decision-lifecycle` |
| `evidence_pipeline` | Evidence Pipeline | 10 | `evidence-attachment`, `evidence-retrieval`, `evidence-export` |
| `governance` | Governance | 10 | `governance-workflow`, `confidence-scoring` |
| `ai` | AI Pipeline | 10 | `ai-recommendation`, `ai-explanation` |
| `audit` | Audit | 0 | `audit-trail` |
| `reports` | Reports | 5 | `reports`, `executive-exports` |
| `notifications` | Notifications | 0 | `notifications` |
| `billing` | Billing | 0 | `billing`, `credits` |
| `scalability` | Scalability | 10 | `dashboard-loading`, `background-jobs` |
| `recovery` | Recovery | 10 | `recovery`, `rollback` |
| `system_health` | System Health | 10 | `deployment-verification`, `system-health`, `search`, `data-import`, `dataset-versioning` |

<!-- AUTO-GENERATED:GATES:END -->


## 8. Blocking logic

Any of the following blocks a release:

1. A pipeline reports a blocking taxonomy status (`FRAMEWORK_INVALID`,
   `API_FAILURE`, `PERFORMANCE_FAILURE`, `SECURITY_FAILURE`,
   `CRITICAL_LEAK`, `CRITICAL_FAILURE`).
2. A pipeline reports `PASS` with zero controls (vacuous pass).
3. A required pipeline has no evidence artifact on disk.
4. `environment` is not `staging` or `preview` — production is refused
   outright.
5. Any negative control that should have been denied is reported as
   allowed.

## 9. History (safe append)

`audit-artifacts/history.json` is:

- written **atomically** (temp file + rename);
- **quarantined** to `history.corrupt.<timestamp>.json` if unparseable —
  never silently discarded;
- **deduped** by `(release, commit, environment, run_id)` so re-running
  a run replaces its entry instead of appending a duplicate.

## 10. Determinism contract

Deterministic (stable across identical evidence + provenance):

- `overall_status`, `recommendation`, `score`, `score_breakdown`
- `pipelines_passed`, `pipelines_failed`, `warnings_total`,
  `critical_issues`
- `pipeline_results`, `blocking_items`, `warnings`
- `certification_engine_version`

Non-deterministic (may be injected in tests):

- `timestamp`, `duration_ms`, `run_id`

`deterministicView(cert)` returns only the deterministic subset for
reproducibility checks.

## 11. CI usage

```bash
# 1. produce evidence (still prints a warning that it does NOT certify)
EVIDENCE_ENV=preview EVIDENCE_COMMIT=$GITHUB_SHA npm run evidence:run

# 2. certify what was produced (immutable run folder + history)
EVIDENCE_ENV=preview EVIDENCE_COMMIT=$GITHUB_SHA npm run evidence:certify

# or both in one shot:
EVIDENCE_ENV=preview EVIDENCE_COMMIT=$GITHUB_SHA npm run evidence:release
```

Exit codes for `evidence:certify`:

| Code | Meaning |
|---:|---|
| 0 | `PASS` or `PASS_WITH_WARNINGS` — safe to ship |
| 1 | `CONDITIONAL_RELEASE`, `BLOCKED`, or `CRITICAL_BLOCK` |
| 2 | Fatal engine error |
| 3 | Refusing to overwrite existing run folder (pass `--force`) |

## 12. API

```js
import {
  getCertification,
  writeCertification,
  historyEntry,
} from "./tests/evidence/eval-gate.mjs";

const cert = getCertification({
  day: "2026-07-01",
  release: "v1.42.0",
  commit: process.env.GITHUB_SHA,
  branch: process.env.GITHUB_REF_NAME,
  repository: process.env.GITHUB_REPOSITORY,
  environment: "staging",
});

writeCertification({ day: "2026-07-01", cert });
```

## 13. Certification engine version

Set in `tests/evidence/lib/provenance.mjs`:

```
CERTIFICATION_ENGINE_VERSION = "1.0.0"
```

Bump it any time gate weights, gate composition, scoring math, blocking
logic, or the artifact schema changes. Version is stamped into every
certification artifact and every history entry.

## 14. Regression tests

`node --test tests/evidence/__tests__/*.test.mjs` covers:

- environment allow-list → `CRITICAL_BLOCK`
- missing day directory → `CRITICAL_BLOCK`
- vacuous `PASS` → `FRAMEWORK_INVALID`
- normalized score math (all-pass → 100, earned = TOTAL_WEIGHT)
- artifact overwrite protection (and `force: true` override)
- corrupt history quarantine + recovery
- history dedupe on `(release, commit, environment, run_id)`
- `run_id` shape + uniqueness across 50 calls
- deterministic-field reproducibility across two invocations
- provenance completeness in artifacts + history
- docs parity (gates.mjs ↔ RELEASE_GATE.md ↔ EVIDENCE_MATRIX.md)

Run with `npm run evidence:test`.

## 15. What this engine deliberately does not do

- It does not call production.
- It does not execute tests — it only reads their output.
- It does not send emails, charge cards, or invoke live AI.
- It does not modify product features.
- It does not accept an environment outside the allow-list.
- It does not overwrite prior certification runs.
