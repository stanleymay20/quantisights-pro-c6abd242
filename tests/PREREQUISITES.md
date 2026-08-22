# Prerequisites

Before any test stage (including smoke), confirm each item.

## Hard gate — deployed auth/cache prerequisites

The current source tree contains fixes for both historical blockers:

- **F-1** `/auth/callback` PKCE double-exchange: current callback deliberately relies on Supabase URL/session handling and does not manually call `exchangeCodeForSession`.
- **F-2** stale dynamic chunk reload: `installChunkReloadGuard()` handles Vite preload/dynamic-import chunk failures with a guarded hard reload.

Those source fixes are **not** proof that the load-test target is running them. Before a certifying run, verify that the target environment is deployed from the intended SHA and set:

```bash
LOAD_PREREQ_CONFIRMED=yes
```

`LOAD_PREREQ_WAIVED=yes` remains available only for an explicitly non-certifying diagnostic run. A waived run must not be used as enterprise-scale or release evidence.

## Environment

- [ ] `LOAD_TARGET` set to `staging` or `preview` (never `production` without `LOAD_CONFIRM_PROD=I_UNDERSTAND`).
- [ ] Target release/SHA verified and `LOAD_PREREQ_CONFIRMED=yes` set for a certifying run.
- [ ] `LOAD_BASE_URL`, `LOAD_SUPABASE_URL`, `LOAD_SUPABASE_ANON_KEY` set.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` available (staging only) for seed/teardown/integrity verification.
- [ ] `LOAD_AI=mock` (default) — set `live` only with `LOAD_AI_BUDGET_USD`.

### Enterprise queued-ingestion certification

For `npm run load:enterprise-ingest` and its verifier, also set:

- [ ] `LOAD_INGEST_API_KEY` — API key belonging to the dedicated staging load-test data source.
- [ ] `LOAD_INGEST_DATASET_ID` — staging dataset owned by the same organization as that API key.
- [ ] `LOAD_RUN_ID` — unique stable ID reused by both the k6 run and the verifier.
- [ ] Optional `LOAD_INGEST_RPS` (default `20`).
- [ ] Optional `LOAD_INGEST_BATCH` (default `500`).
- [ ] Optional `LOAD_INGEST_DURATION` (default `1m`).
- [ ] Optional `LOAD_INGEST_DRAIN_TIMEOUT_MS` (default 10 minutes for verification).

The default offered load is **20 requests/sec × 500 records = 10,000 records/sec**. This is a test target, not a performance claim; Quantivis is enterprise-scale certified only after the staged run and integrity verifier pass with recorded evidence.

## Data

- [ ] Two staging organizations exist and are flagged `is_demo=true`:
  - `org_loadtest_a` → `LOAD_ORG_A_ID`
  - `org_loadtest_b` → `LOAD_ORG_B_ID`
- [ ] `npm run load:seed` succeeded; `tests/load/.users.json` populated.
- [ ] `npm run load:matrix` shows no silent edge-function omissions.
- [ ] Enterprise ingest uses an isolated staging dataset that can be safely cleaned after the run.

## Tooling

- [ ] k6 installed (`k6 version`).
- [ ] Playwright chromium installed (`npx playwright install chromium`).
- [ ] Node 20+ available.

## Network

- [ ] Source IP (or GitHub Actions runner egress) whitelisted in Cloudflare WAF, or k6 traffic confirmed not to trip bot rules.

## Kill switch

- [ ] You know the kill command: `pkill -f k6` for k6, `Ctrl+C` for Playwright.
