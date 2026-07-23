# Prerequisites

Before any test stage (including smoke), confirm each item.

## Hard gate — auth blockers

- [ ] **F-1** `/auth/callback` double-exchange race fixed **or** explicitly waived.
- [ ] **F-2** Stale dynamic chunk reload / cache issue fixed **or** explicitly waived.

If waived, set `LOAD_PREREQ_WAIVED=yes` in your environment. Scripts refuse to run otherwise.

## Environment

- [ ] `LOAD_TARGET` set to `staging` or `preview` (never `production` without `LOAD_CONFIRM_PROD=I_UNDERSTAND`).
- [ ] `LOAD_BASE_URL`, `LOAD_SUPABASE_URL`, `LOAD_SUPABASE_ANON_KEY` set.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` available (staging only) for seed/teardown.
- [ ] `LOAD_AI=mock` (default) — set `live` only with `LOAD_AI_BUDGET_USD`.

## Data

- [ ] Two staging organizations exist and are flagged `is_demo=true`:
  - `org_loadtest_a` → `LOAD_ORG_A_ID`
  - `org_loadtest_b` → `LOAD_ORG_B_ID`
- [ ] `npm run load:seed` succeeded; `tests/load/.users.json` populated.
- [ ] `npm run load:matrix` shows no silent edge-function omissions.

## Tooling

- [ ] k6 installed (`k6 version`).
- [ ] Playwright chromium installed (`npx playwright install chromium`).
- [ ] Node 20+ available.

## Network

- [ ] Source IP (or GitHub Actions runner egress) whitelisted in Cloudflare WAF, or k6 traffic confirmed not to trip bot rules.

## Kill switch

- [ ] You know the kill command: `pkill -f k6` for k6, `Ctrl+C` for Playwright.
