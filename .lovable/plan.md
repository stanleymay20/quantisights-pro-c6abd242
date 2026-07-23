# Pilot-Readiness Plan — Phases 6–10

The remaining audit findings, grouped by risk and shippability. Each phase is independently deployable and verifiable.

## Phase 6 — Quick wins (low risk, high visibility)

- **Broken SAP Connector link** — sidebar points to `/admin/sap-connector` but route is `/admin/connectors/sap`. Update sidebar entry in `DashboardSidebar.tsx`.
- **Duplicate sidebar Trust Center entries** — both "Governance" and "Governance & Compliance" route to `/trust`. Remove the duplicate.
- **Bridge Health tense bug** — "Next retry: about 4 hours ago" for a future timestamp. Swap `formatDistanceToNow(..., { addSuffix: true })` for a future-aware helper.

## Phase 7 — Dataset ingestion cleanup

16 datasets stuck in `status='processing'` since March 2026 (11× "Middle_East_Economic_Data", 7× "results"). None will ever complete — worker was cancelled long ago.

- Migration: mark all `datasets` with `status='processing' AND created_at < now() - interval '24 hours'` as `status='failed'`, set `error_message='Ingestion worker abandoned; timeout after 24h'`.
- Add a nightly cleanup job (`retention-cleanup` already exists) or a Postgres function `mark_stuck_datasets_failed()` invoked hourly, so this doesn't recur.
- Data Catalog summary stats bug: header shows "0 Active Datasets" contradicting 31 rows. Root-caused in `DataCatalog.tsx` — likely counting `status='active'` but seed data has mixed cases. Verify and fix the aggregation.

## Phase 8 — System Health cron visibility

Investigation shows cron_run_log has 4,765 rows in 7 days: `health-check` 2012, `pipeline-orchestrator` 2011, `alert-monitor` 672, `convergence-reconcile` 28, `evaluate-outcomes` 28, `adaptive-calibration` 14. But `useSystemHealth` shows "no runs" for all six critical jobs.

Two possible causes:
1. **RLS**: `cron_run_log` may not be readable to org members (system-scoped table). Check policies; if so, expose via `SECURITY DEFINER` RPC `get_cron_health_last_24h(_job_names text[])`.
2. **Job name mismatch**: `CRITICAL_JOBS` array lists `retention-cleanup` and `morning-brief`, neither present in `cron_run_log`. Verify these jobs actually exist in `pg_cron.job`; either re-enable or remove from the critical list.

Also fix the Procurement Pack "7 autonomous orchestration jobs" claim — reduce to reflect reality (6 or actual live count).

## Phase 9 — Governance audit + Trust evidence

- **`context_governance_audit` is empty** (verified: 0 rows). The writer `recordGovernanceUse` in `_shared/governance-audit.ts` exists but is not called from any edge function currently active in the decision pipeline. Wire it into `auto-create-decisions` and `prescriptive-advisory` so every new decision/advisory writes one row.
- **One-shot backfill** for existing 697 decisions: insert synthetic audit rows citing the org's current governance profile with `backfilled=true` in `decision_path`.
- **Trust Center "Evidence unavailable"** — `trust-center.ts` returns hardcoded "Evidence unavailable" for control source/method/owner. Populate from real values: SOC2 refs, ISO27001 refs, `subprocessor_registry`, `procurement_readiness_items` (which already exist).

## Phase 10 — AICIS + Advisory timeout

- **AICIS 221-failure streak**: pull last 20 `sync-aicis-bridge` edge function logs to identify the actual error (expected 401 from stale key or endpoint 4xx). Either rotate `AICIS_API_KEY` secret or disable the connector's schedule until credentials are refreshed. Add a "Paused — no valid credential" state to `/aicis-sync` so UI reflects reality instead of showing "Idle" indefinitely.
- **Advisory `Run Analysis` timeout**: `prescriptive-advisory` currently runs synchronously past the 60s edge function ceiling on datasets with >200 rows. Refactor to enqueue via `pipeline_runs` and return a `job_id` immediately; polling UI already exists in similar flows.

## Deferred (not blocking pilot but tracked)

- Item 10 (internal_reference_data quality — 107% renewable share): needs domain-specific validators per metric, out of scope this pass.
- Item 11 (German localization completion): user is running this in parallel.
- Item 12–15 (SSO not configured, encryption inherited, retention not configured, governance maturity 0/18): configuration tasks for the pilot org, not code bugs.
- Item 16 (Intelligence Inbox trust badges): needs schema wiring across `aicis_intelligence_items` — depends on Phase 10 AICIS fix landing first.

## Technical details

- Sidebar path fix: single-line edit in `src/components/dashboard/DashboardSidebar.tsx`.
- Stuck datasets migration: `UPDATE public.datasets SET status='failed'...` — must go through migration tool since it changes rows via schema-level ops (or via `supabase--insert`).
- Cron RPC: `create or replace function get_cron_health(_jobs text[], _since timestamptz) returns setof cron_run_log language sql security definer`.
- Trust Center evidence: replace `evidenceUnavailable` sentinel in `src/lib/trust-center.ts` with structured sources.
- AICIS pause state: add `paused_reason` column to `connector_configs` (nullable text) and surface on `AicisSync.tsx`.

## Sequencing

Phase 6 first (10 min, pure UI). Then 7 (data cleanup migration). Then 8 (RLS/RPC). Then 9 (largest, governance). Phase 10 last — AICIS needs log inspection which may reveal we can't fix without new credentials.

## Non-goals

- Not fixing the underlying advisory recommendation semantics (Amazon → EU AI Act mismatch).
- Not building new UI for governance maturity onboarding.
- Not touching the German translation runtime file.
