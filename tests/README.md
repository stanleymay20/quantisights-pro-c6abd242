# Quantivis Test Suite

End-to-end and load-testing framework. **No scenario runs automatically.** All execution is manual and gated.

## Layout

```
tests/
├── e2e/                  # Playwright browser tests (smoke, 10-VU, long-session)
├── load/                 # k6 API load tests + supporting Node scripts
│   ├── lib/              # shared k6 helpers (auth, guard, observability, ...)
│   ├── scenarios/        # k6 entrypoints per stage
│   ├── workflows/        # composable per-stage steps
│   ├── inventory/        # edge-function coverage matrix
│   ├── integrity/        # post-run DB integrity checks
│   ├── release-gate/     # GO/NO-GO aggregator
│   ├── seed-users.mjs
│   ├── teardown.mjs
│   └── verify-teardown.mjs
├── PREREQUISITES.md      # MUST be satisfied before any run
└── README.md             # this file
```

## Prerequisites (HARD GATE)

Read [`PREREQUISITES.md`](./PREREQUISITES.md). Until **F-1** and **F-2** are fixed or
`LOAD_PREREQ_WAIVED=yes` is set, scripts refuse to run.

## Tools

- **k6** for API load (install: `brew install k6` / [k6.io/docs/getting-started/installation](https://k6.io/docs/get-started/installation/))
- **Playwright** for browser tests (`npx playwright install chromium`)
- **Node 20+** for seed/teardown/integrity/inventory scripts

## Environment

Copy `.env.loadtest.example` to `.env.loadtest` and fill in:

```
LOAD_TARGET=staging
LOAD_BASE_URL=https://staging.quantivis.io
LOAD_SUPABASE_URL=
LOAD_SUPABASE_ANON_KEY=
LOAD_ORG_A_ID=
LOAD_ORG_B_ID=
LOAD_USERS_FILE=tests/load/.users.json
LOAD_AI=mock
LOAD_AI_BUDGET_USD=5
LOAD_PREREQ_WAIVED=
SUPABASE_SERVICE_ROLE_KEY=   # staging only
```

Production is locked: requires both `LOAD_TARGET=production` and `LOAD_CONFIRM_PROD=I_UNDERSTAND`.

## Running stages (manual only)

```bash
# 0. Verify gate + inventory
npm run load:matrix          # generates reports/edge-function-matrix.csv

# 1. Seed (staging service role required)
npm run load:seed

# 2. Smoke (1 VU, browser) — requires F-1/F-2 fixed or waived
npm run test:e2e:smoke
npm run load:smoke           # k6 1-VU API smoke

# 3. Small (10 VU)
npm run test:e2e:small
npm run load:small

# 4. Load (require approval)
npm run load:50
npm run load:100

# 5. Stress (1000 VU, API only, staging only, capped 10 min)
npm run load:1000

# 6. Chaos
npm run load:ai-chaos

# 7. Long browser session
npm run test:e2e:long

# 8. Integrity + teardown + gate
npm run load:integrity
npm run load:teardown
npm run load:verify-teardown
npm run load:gate            # emits GO / NO GO
```

## Safety

- Two-org tenant isolation enforced (`org_loadtest_a` / `org_loadtest_b`).
- Email senders, connector pulls, demo seeders, exports — name-blocked.
- AI calls mocked unless `LOAD_AI=live` with explicit budget.
- Writes scoped to load-test org ids; teardown verified.
- 1000-VU run is hard-capped: 10-min duration, 150k iterations, no unbounded ramping.

## Reports

All scripts write to `tests/load/reports/` (gitignored). Each report carries
`x-request-id`, `traceparent`, user id, org id, edge function name for every failure.

## Release gate

`npm run load:gate` parses the latest reports and emits **GO** or **NO GO** with
per-criterion justification. Use as the pilot-deployment gate.
