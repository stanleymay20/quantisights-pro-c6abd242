# Tenant Isolation Test

Self-contained, checked-in test that produces **enterprise-grade evidence**
of tenant isolation: a user in org A cannot read or write data belonging to
org B (and vice versa) on every tenant-scoped surface the app exposes to a
seeded admin.

**Read this before running:** the harness is only valid if every positive
control passes. A run that skips positive controls or that treats non-2xx as
proof of denial is *not* evidence — it is theater. This suite refuses to
report PASS in either of those situations.

## Safety guarantees (enforced by `lib/guard.mjs`)

- **Allow-list environment check**: `LOAD_TARGET` must be exactly `staging`
  or `preview`. Anything else — `production`, `prod`, `live`, `main`,
  `release`, empty, or a typo — is rejected before any network call.
- **Shared guard**: `seed.mjs`, `run.mjs`, and `teardown.mjs` all import the
  same `guardOrExit()` helper. No script-local drift.
- **Hard-fail teardown**: any cleanup error causes exit code 1 and the
  state file is preserved so operators can retry. Nothing is silently left
  behind.
- Does not call live AI, does not send email, does not depend on k6.
- Exactly two users are created (one admin per org). No 50/100/1000-VU load.

## Seeded role and why

Users are seeded as **`admin`** on their org (`organization_members.role = 'admin'`).

Rationale — this is the minimum role that can exercise every policy the
suite probes:

| Surface | Policy | Roles that satisfy it |
| --- | --- | --- |
| `decision_ledger` SELECT | `Leadership can view decisions` | owner, admin, executive |
| `decision_ledger` INSERT | `Admins/owners can insert decisions` | owner, admin |
| `audit_log` SELECT       | `Org admins can view audit log` | owner, admin |

Using `member` would collapse every positive control on the read side and
render the negative cross-tenant probes vacuous.

## Evidence surface actually tested

`public.evidence_sources` does **not** exist in this schema. Evidence is
stored as **`decision_ledger.evidence_sources` (JSONB)** on each decision.
`seed.mjs` writes a non-empty `evidence_sources` array into each org's
canary decision row and verifies the JSONB persisted. Because the JSONB
column is governed by `decision_ledger` RLS, cross-tenant evidence access
is fully covered by the `decision_ledger` read/write probes. There is no
separate evidence table to probe.

## Files

| File | Purpose |
| --- | --- |
| `lib/guard.mjs` | Shared allow-list guard used by all three scripts. |
| `seed.mjs`      | Two orgs + one admin user each + mandatory canaries on `decision_ledger` (with evidence JSONB) and `audit_log`. Writes `.state.json`. |
| `run.mjs`       | Signs in each user, runs **6 positive controls first**, then cross-tenant read/write probes. Exits non-zero on any leak, framework error, or unexpected API failure. |
| `teardown.mjs`  | Deletes seeded rows, users, and orgs. Exits 1 on any failure. |

`.state.json` (created by `seed.mjs`, consumed by `run.mjs` and `teardown.mjs`)
contains the run tag, seeded role, evidence surface, org IDs, seeded user
credentials, and canary row ids. It is git-ignored and cleared on
successful teardown.

## Required credentials

```
LOAD_TARGET=staging                 # or "preview" — anything else is refused
LOAD_SUPABASE_URL=https://<ref>.supabase.co
LOAD_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service-role key, staging only>
```

`SUPABASE_SERVICE_ROLE_KEY` is **not** available on Lovable Cloud managed
projects. If you host on Lovable Cloud you must run this against a staging
Supabase project that you own directly.

## Usage

```bash
node tests/tenant-isolation/seed.mjs
node tests/tenant-isolation/run.mjs
node tests/tenant-isolation/teardown.mjs   # always run, even on failure
```

## What `run.mjs` checks

### 1. Positive controls (must all pass, else FRAMEWORK_INVALID → exit 1)

Run **before** any cross-tenant probe. If any of these fail the suite
aborts — a negative result is meaningless when we can't first prove the
user can access their own data.

- A reads own `decision_ledger` canary row → HTTP 200 + JSON array + row present
- B reads own `decision_ledger` canary row → HTTP 200 + JSON array + row present
- A reads own `audit_log` canary row       → HTTP 200 + JSON array + row present
- B reads own `audit_log` canary row       → HTTP 200 + JSON array + row present
- A inserts a new decision in org A        → HTTP 2xx with row returned
- B inserts a new decision in org B        → HTTP 2xx with row returned

### 2. Negative cross-tenant read probes

For each direction (A→B, B→A) and each table (`decision_ledger`,
`audit_log`), `GET /rest/v1/<table>?organization_id=eq.<other_org>&limit=5`
using the caller's JWT. **Valid `PASS` only when all three hold:**

- HTTP status is exactly `200`
- response parses as a JSON array
- array length is exactly `0`

- Non-200 → `API_FAILURE`
- 200 with non-array body → `FRAMEWORK_INVALID`
- 200 with non-empty array → `CRITICAL_LEAK`

### 3. Negative cross-tenant write probes

`POST /rest/v1/decision_ledger` with `organization_id = <other_org>` using
the caller's JWT.

- `2xx` → `CRITICAL_LEAK`
- `401` / `403`, or PostgREST error code `42501`, or message matching
  `row-level security` / `permission denied` → `EXPECTED_DENIAL`
- Anything else (400, 404, 409, 422, 5xx, malformed) → `API_FAILURE`
  (the write may still be blocked, but the response is not proof of isolation)

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `PASS` | Positive control succeeded, or cross-tenant read returned an empty array with HTTP 200. |
| `EXPECTED_DENIAL` | Cross-tenant write rejected by documented RLS/auth class. |
| `CRITICAL_LEAK` | Cross-tenant read returned rows OR cross-tenant write was accepted. |
| `FRAMEWORK_INVALID` | Positive control failed, canary missing, malformed response, or network error. |
| `API_FAILURE` | Unexpected HTTP status that is neither `PASS` nor a documented denial class. |

Every probe prints: `kind`, `actor`, `actor_org`, `target_org`, `table`,
`op`, `status`, truncated `body`, `verdict`, and optional `note`. The final
summary counts by verdict.

## Exit codes

### `run.mjs`

- `0` — all 6 positive controls PASS **and** every cross-tenant probe is
        `PASS` or `EXPECTED_DENIAL`.
- `1` — configuration error, missing seed file, missing canary, positive
        control failure, `FRAMEWORK_INVALID`, or `API_FAILURE`. Not a
        valid PASS.
- `2` — **CRITICAL**: at least one `CRITICAL_LEAK`.

### `teardown.mjs`

- `0` — every seeded row, user, and org deleted; `.state.json` removed.
- `1` — at least one delete failed; `.state.json` preserved for retry.

## Canary requirement (tests are invalid without it)

`seed.mjs` inserts one canary row per org for `decision_ledger` (with a
non-empty `evidence_sources` JSONB payload) and `audit_log`. Any failure
exits non-zero and no `.state.json` is written.

`run.mjs` refuses to start if `.state.json` is missing a canary for any
required table. This prevents vacuous "0 rows" pass results caused by
probing an empty table.

## The browser harness is *not* tenant-isolation evidence

`tests/e2e/concurrent-browser-sessions.py` (formerly
`multi-user-harness.py`) spawns N Playwright contexts sharing a **single**
pre-minted Supabase session. Every context is the same user in the same
organization.

It proves:

- route/session stability under concurrent browser contexts
- no stale-chunk / preload errors under concurrent nav
- no auth-race regressions in the SPA shell
- route selectors remain stable

It does **not** prove:

- tenant isolation
- row-level security enforcement
- cross-org read/write denial

True tenant-isolation evidence requires distinct seeded users in distinct
orgs probing PostgREST with their own JWTs — that is exactly what this
directory (`tests/tenant-isolation/`) does.
