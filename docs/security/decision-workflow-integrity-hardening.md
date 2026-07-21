# Decision workflow integrity hardening

**Status:** implementation-ready, not applied to any database.

The authoritative forward migration is
`supabase/migrations/20260719140000_harden_decision_workflow_integrity.sql`; its
manual rollback is outside the auto-applied migration directory. The superseded
proposal, report, and rollback were removed, so a clean checkout has only one
hardening path.

## Review classification

### Confirmed implementation defects

- Direct owner/admin updates and non-pending inserts could bypass the approval
  RPCs. The hardening trigger now denies them for every database role.
- A caller-settable transaction-local GUC is not a defensible authorization
  capability. It was replaced by private, RLS-enabled, privilege-revoked tables
  containing single-use capabilities bound to transaction, backend, operation,
  and decision ID. Only fixed-search-path `SECURITY DEFINER` workflow functions
  issue capabilities; the trigger consumes each capability atomically.
- `DecisionLedger`, `ModifyDecisionDialog`, and `DecisionQueue` wrote approved,
  rejected, or dismissed states directly. They now create pending rows where
  needed and call `approve_decision`, `reject_decision`, or `dismiss_decision`.
- Demo seed functions inserted resolved rows directly. They now use the
  idempotent `create_predecided_decision(jsonb,text)` RPC for every non-pending
  row and retain ordinary inserts only for pending rows.
- Preflight previously replaced objects based on names. The migration now aborts
  if new hardening objects already exist, compares exact reviewed function
  sources and catalog metadata, verifies the complete trigger/policy inventory,
  and rejects NULL or unsupported live status values before DDL.
- Pre-decided creation had no retry protection. A private unique key scoped by
  organization and caller returns the first decision ID on retries and
  serializes concurrent duplicate requests. Its nullable decision reference has
  an `ON DELETE CASCADE` foreign key, and the RPC defensively verifies the
  referenced decision before returning it, so a reset followed by key reuse
  creates one replacement rather than returning a stale UUID.

### Deployment-order and operational requirements

1. Deploy database migration before the frontend and Edge Functions that call
   the new RPCs. During that short interval, old direct resolved-state writes
   will fail closed rather than bypass controls.
2. Run the documented inventory queries and take a database backup. The
   migration itself repeats the safety-critical object and data checks.
3. Regenerate production Supabase types after application and verify RPC grants,
   trigger enablement, constraints, direct-write rejection, and retry behavior
   in a disposable/staging database.
4. Before rollback, revert the frontend and Edge Functions to a version that
   does not call `dismiss_decision` or `create_predecided_decision`. The rollback
   preflight aborts on a partial/mismatched installation, but SQL cannot prove
   that external application versions have been reverted.
5. Rollback deliberately retains decisions and audit rows created while the
   hardening was live. It drops `decision_audit_source` and idempotency metadata;
   take an export first if that provenance must remain directly queryable.

`event-stream` remains compatible because it creates only `pending` decisions.
`execute-decision-action` changes execution plans/status, not
`decision_status`, so it remains compatible.

### Documentation inconsistencies corrected

The controlled `decision_status` vocabulary is `pending`, `approved`,
`rejected`, `dismissed`, `executable`, and `executed`. `dismissed` is a real
terminal review outcome and has an authenticated, audited RPC. The controlled
`execution_status` vocabulary is `not_started`, `in_progress`, `completed`,
`failed`, `cancelled`, and `blocked`. Both columns reject NULL.

The migration grants approval, rejection, and dismissal RPCs only to
`authenticated`; pre-decided creation is granted only to `service_role` for
seed/import callers (while retaining a defensive owner/admin check should that
grant ever be deliberately expanded). Trigger and
private-state access is revoked from `PUBLIC`, `anon`, `authenticated`, and
`service_role`. All added or replaced security-definer functions use
`search_path = pg_catalog, public` and no user-controlled dynamic SQL.

### Unsupported or not applicable

- RLS alone cannot protect service-role writes, but the claim that service-role
  can bypass PostgreSQL triggers is not applicable: the trigger is the
  enforcement point and runs for service-role table writes.
- `event-stream` does not need a resolved-state RPC because repository evidence
  shows it normalizes incoming decisions to `pending`/`not_started`.
- `execute-decision-action` does not directly transition `decision_status`; no
  compatibility modification is justified.
- Existing approved rows with a NULL `decided_by` cannot be truthfully
  attributed after the fact. They remain unchanged and receive only the honest
  constant provenance `legacy`.

## Test expectations

Repository tests are explicitly **static source-regression checks**. They verify
that required catalog checks and caller patterns remain in source, but do not
prove PostgreSQL locking, concurrency, DDL, or rollback behavior.

## Staging integration-test matrix

| Scenario | Required result |
|---|---|
| Two consecutive `seed-demo-data` runs | Both runs leave the complete expected decision set; the second run does not return deleted UUIDs. |
| Delete then reuse an idempotency key | Cascade removes the completed reservation; one replacement decision and audit row are created. |
| Concurrent identical idempotency keys | Exactly one decision/audit pair is created and every caller receives its ID. |
| Direct writes and GUC spoof attempts | Resolved inserts/status updates fail for authenticated and service roles; pending and execution-only writes behave normally. |
| RPC authorization and NULL cases | Owner/admin transitions succeed atomically; unauthorized callers and NULL/unsupported statuses fail; optional NULL reasons remain valid. |
| Forward provenance mutations | Mutating each reviewed function body, owner, search path, grant, trigger, column, or inventory makes preflight abort before DDL. |
| Rollback provenance mutations | Mutating each hardened function, grant, table, constraint, foreign key, trigger, or provenance column makes rollback abort without dropping anything. |
| Forward then rollback | Decision/audit rows remain, documented provenance/idempotency metadata is removed, and historical RPC definitions/grants are restored. |

No migration in this change is applied to a live database.
