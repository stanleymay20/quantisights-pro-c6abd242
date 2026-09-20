# Quantivis Intelligence OS — Phase 0 / Phase 0.1 Controlled Baseline

**Checkpoint:** 2026-09-20  
**Canonical repository:** `stanleymay20/quantisights-pro-c6abd242`  
**Canonical branch at Phase-0 inspection:** `main`  
**Phase-0 inspected HEAD:** `cfc9eca2f303ec75e17d412f83ed443bace262e9`  
**Phase-0.1 repair branch:** `repair/quantivis-phase0-1-authority-20260920`  
**Repair PR:** #46

## Mission

Evolve the existing Quantivis platform into **Quantivis Intelligence OS**, a production-grade autonomous decision-intelligence and multi-agent platform. Preserve existing production-grade architecture where evidence supports it. Do not rebuild the platform as a toy chatbot, thin LLM wrapper, or generic RAG demo.

## Phase 0 findings

### Repository

- Default branch: `main`
- Phase-0 HEAD: `cfc9eca2f303ec75e17d412f83ed443bace262e9`
- Repository visibility: public
- `main` was not branch-protected at Phase-0 inspection.
- CI on the Phase-0 HEAD was green:
  - 183 test files
  - 1,364 tests
  - 0 lint errors
  - 72 lint warnings
- The downstream staging deployment failed during migration preview.

### Live Supabase environments

**Staging**
- Project ref: `cmnihsbdbpubznlkmjbc`
- 216 public tables
- RLS enabled on 216/216 public tables
- 480 public policies
- 252 applied migrations
- 126 active Edge Functions

**Production**
- Project ref: `izgfrekdamlgigehxoqs`
- 216 public tables
- RLS enabled on 216/216 public tables
- 481 public policies
- 249 applied migrations
- 123 active Edge Functions

### Canonical source drift discovered

At Phase-0 HEAD:
- Repository migration files: 251
- Repository Edge Function directories: 126
- Generated Supabase TypeScript types: 210 public tables

**Staging remote-only migration**
- `20260902173140_fail_closed_tenant_control_plane`

**Production missing migrations present in source**
- `20260901003000_harden_service_only_runtime_execute`
- `20260901113000_decision_ledger_dataset_scope`

**Production missing Edge Functions present in source/staging**
- `decision-value-summary`
- `process-metric-ingest-queue`
- `queued-metric-ingest`

**Generated TypeScript types missing six live tables**
- `decision_value_attributions`
- `execution_action_receipts`
- `execution_compensation_requests`
- `metric_ingest_chunk_results`
- `metric_ingest_queue_health_events`
- `metric_ingest_queue_state`

## Recovered tenant-control-plane authority

The exact SQL for staging migration `20260902173140` was recovered from:

`supabase_migrations.schema_migrations`

The stored SQL matches the security migration developed historically in PR #34; the historical branch file used a different timestamp (`20260902153000`).

Live staging verifies the recovered migration's intended effects:

- `auth.users` trigger `on_auth_user_created` is absent.
- `anon` and `authenticated` cannot execute `public.handle_new_user()`.
- Direct authenticated organization creation policy is absent.
- Organization membership insertion requires target-organization owner/admin authority.
- Admins cannot grant the owner role.
- Membership updates include a `WITH CHECK` preventing admin-to-owner escalation.
- `public.accept_invitation(uuid)` remains authenticated-only and validates the authenticated email against the invitation.

Live production still had the older control plane at this checkpoint:
- `on_auth_user_created` present.
- authenticated execution of `handle_new_user()` present.
- direct organization creation policy present.
- self-enrolment bypass present.
- membership update policy lacked `WITH CHECK`.

## Phase 0.1 repair scope

PR #46 intentionally does **not** introduce Intelligence OS Phase-1 runtime schema.

It:
1. restores the exact staging-applied migration version to canonical source;
2. makes organization discovery read-only;
3. removes browser-side tenant manufacturing;
4. fails onboarding closed when tenant evidence/provenance is absent;
5. prevents Dashboard first-run UI from appearing until onboarding completion is positively verified;
6. extends staging tenant-isolation probes to cover:
   - cross-tenant reads/writes,
   - self-enrolment,
   - admin-to-owner escalation,
   - direct organization creation;
7. preserves the current exact-SHA GA staging validation chain.

On the Phase-0.1 branch, migration version sets are now:
- local source: 252
- staging: 252
- local-only: none
- staging-only: none

## Important deferred work

The fail-closed repair intentionally does not restore self-serve tenant creation.

The intended successor design exists in the historical first-paying-customer branch and uses:
- server-issued short-lived signup intents;
- `public.provision_verified_signup(uuid)`;
- server-side Auth timestamps;
- one-time/idempotent tenant creation;
- returning identities rejected into restoration rather than replacement tenant creation.

That design must be re-audited and ported onto current `main` as a separate controlled tranche. Do not re-enable browser-authorized tenant creation.

## Security findings still open

Supabase advisor findings at Phase 0 included:

**Staging**
- 14 authenticated-callable `SECURITY DEFINER` warnings.

**Production**
- 14 anon-callable `SECURITY DEFINER` warnings.
- 70 authenticated-callable `SECURITY DEFINER` warnings.
- leaked-password protection disabled.

Both environments also reported:
- two RLS-enabled service-only tables with no policies:
  - `execution_action_receipts`
  - `execution_compensation_requests`
- large RLS performance-advisor backlog;
- unindexed foreign keys;
- multiple permissive-policy warnings;
- duplicate indexes.

Do not interpret "RLS enabled on 100% of public tables" as proof that authorization review is complete.

## Existing architecture to preserve

Do not replace without evidence:
- React/Vite frontend
- Supabase/Postgres
- multi-tenant organization/workspace model
- RLS/RBAC foundation
- Decision Ledger
- evidence/outcome/calibration loop
- governed approval flow
- execution plans/events
- durable action receipts and compensation model
- Agent Gateway contracts
- AG-3 runtime abstractions
- pgmq / pg_cron infrastructure
- evidence certification framework
- tenant-isolation harness
- existing connector ecosystem

## Phase 1 entry gate

Do not start the Intelligence OS execution-kernel migration until:
1. PR #46 CI is green;
2. the recovered migration is canonical;
3. staging deployment preview no longer fails on remote migration `20260902173140`;
4. exact-SHA staging tenant-control-plane probes pass;
5. staging and canonical source migration versions match;
6. production drift is explicitly planned rather than silently promoted.

## Phase 1 direction

Phase 1 should complete the existing AG-3 architecture against durable Postgres/pgmq infrastructure rather than introducing an unrelated orchestration framework.

Minimum future execution-kernel capabilities:
- execution IDs
- typed tasks
- DAG dependencies
- explicit state machine
- durable attempts/retries
- idempotency
- checkpoints
- cancellation
- pause/resume
- timeouts
- dead-letter state
- approval waits
- immutable events
- tenant-scoped auditability
- crash recovery
- exact reconstruction of execution history

Unknown must remain unknown. Prediction is not causality. No benchmark number may be reported unless it was actually measured.
