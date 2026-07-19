# Decision Ledger Transition Integrity — Design Report

**Status: PROPOSED. No migration has been applied to any database.**
Companion artefacts:
- `supabase/migrations/20260719130000_decision_ledger_transition_integrity.sql` (forward, not applied)
- `supabase/rollback/20260719130000_decision_ledger_transition_integrity_rollback.sql` (outside `supabase/migrations/`, never auto-applied)

This is revision 2 of the proposal, incorporating a mandatory review pass. Revision 1 was never committed to this repository — it existed only as a scratch draft. Everything below reflects the final, committed design.

## 1. Why this exists

Live findings confirmed by Lovable:
- `approve_decision()`/`reject_decision()` are already correctly deployed (`20260713053125_8fdc265c-...sql`).
- `enforce_decision_approval_gate()` already correctly references `decision_status` live, matching `20260713101124_c24694df-...sql` (already in this repo's history).
- `20260713010000_fix_decision_approval_atomicity.sql` is fully superseded and is not referenced, copied, or reapplied anywhere in this proposal.
- Owner/admin users can still directly `UPDATE decision_ledger.decision_status` via PostgREST, bypassing the RPC audit path entirely.
- `decision_ledger` has no `CHECK` constraint on `decision_status` or `execution_status`.
- 345 legacy approved rows have `decided_by IS NULL`.

## 2. Status vocabulary (derived from write sites, not guessed)

**`decision_status`** (6 values):

| Value | Evidence |
|---|---|
| `pending` | `decision_ledger` `CREATE TABLE` default (`20260225182540`) |
| `approved` | `DecisionLedger.tsx:716`, `ModifyDecisionDialog.tsx:62`, `DecisionQueue.tsx:163`, `approve_decision()`, `create-demo-session`/`seed-demo-data`/`event-stream` edge functions |
| `rejected` | `DecisionLedger.tsx:588`, `reject_decision()`, `seed-demo-data` |
| `dismissed` | `DecisionQueue.tsx:219` — **insert-only**, confirmed never used as an UPDATE target anywhere in this repository |
| `executable` | `enforce_decision_approval_gate()` guard logic (`20260713101124`) — no current write site produces this value |
| `executed` | same file — no current write site produces this value either |

**`execution_status`** (6 values): `not_started` (default), `in_progress`, `completed` (`DecisionLedger.tsx`, `execute-decision-action`), `failed`, `cancelled` (`20260521093847` CHECK list), `blocked` (`execute-decision-action/index.ts:246`, the `newExecStatus` variable).

This was derived by direct grep of every executable write site in `src/`, `supabase/functions/`, and `supabase/migrations/` — not inferred from naming. The preflight queries in the migration are the actual authority; if live data contains a value not listed here, the migration must be revised before `VALIDATE CONSTRAINT` is run.

## 3. Protected-transition rule: deny-by-default

**Revision 1** of this proposal enumerated four specific transitions to protect (`pending→approved`, `pending→rejected`, `*→executable`, `*→executed`), leaving direct `UPDATE`-based transitions into `dismissed` unblocked — an oversight identified in review.

**Revision 2** adopts deny-by-default instead: **any `UPDATE` that changes `decision_status`, to any value, requires the trusted transaction-local flag.** There is no enumerated exception list.

This was possible because a full trace of every `decision_status` write site in the active repository found **zero legitimate direct-`UPDATE` writers outside `approve_decision()`/`reject_decision()`**:

| Writer | Write type | Affected by the new guard? |
|---|---|---|
| `DecisionLedger.tsx` (`updateDecision()`) | `UPDATE` (direct, the bug this proposal fixes) | Yes — now blocked, must move to the RPC |
| `ModifyDecisionDialog.tsx` | `UPDATE` (direct) | Yes — now blocked |
| `approve_decision()` / `reject_decision()` | `UPDATE`, within a `SECURITY DEFINER` function | No — sets the trusted flag first |
| `DecisionQueue.tsx` (dismiss flow) | `INSERT` only (new row, `decision_status: "dismissed"` at creation) | No — a `BEFORE UPDATE` trigger cannot fire on `INSERT` |
| `create-demo-session`, `seed-demo-data`, `event-stream` edge functions | `INSERT` only | No — same reason |
| `embed-decisions`, `weekly-calibration-digest`, `cognitive-bias-detect` edge functions | Read-only (`SELECT`) | No |
| `execute-decision-action` edge function | Writes `execution_status` only, never `decision_status` | No |
| `enforce_decision_approval_gate()` (existing trigger) | Reads `decision_status`, never writes it | No |

No transition was found that has a real production requirement to remain directly writable. Deny-by-default therefore has no exception to carve out, and is both simpler and strictly stronger than the enumerated-transition design in revision 1.

## 4. How `dismissed` is handled

Confirmed by exhaustive write-site trace (table above): dismissal happens exclusively via **`INSERT`** of a brand-new `decision_ledger` row (`DecisionQueue.tsx:219`), never via `UPDATE` of an existing row, anywhere in the active repository — browser code or edge functions.

Decision: **dismissal remains insert-only.** No new `dismiss_decision` RPC was built, per instruction not to invent one unless required — none is required, since the existing insert-time flow already works and is entirely unaffected by a `BEFORE UPDATE` trigger. The gap the review flagged (an `UPDATE`-based direct transition into `'dismissed'` being possible) is closed by the deny-by-default rule in section 3, not by a new RPC — see the "Direct-update bypass tests" section of the migration for an explicit test of this exact case.

## 5. Trusted-context mechanism

- Setting name: `quantivis.internal.decision_transition_authorized` (application-specific, clearly internal-namespaced, per instruction).
- `approve_decision()`/`reject_decision()` call `PERFORM set_config('quantivis.internal.decision_transition_authorized', 'true', true)` immediately before their `UPDATE`, and reset it to `'false'` immediately after.
- The trigger reads it via `current_setting('quantivis.internal.decision_transition_authorized', true)` (the `true` second argument means "return NULL instead of erroring if unset" — required, since most transactions on this table never set it at all).
- `is_local = true` (the third argument to `set_config`) scopes the value to the current transaction only. It is cleared automatically at `COMMIT`/`ROLLBACK`, which covers both the explicit-reset-skipped-due-to-error case and the connection-pooling case (a pooled connection returned to the pool after `COMMIT` carries no leftover transaction-local GUC state for the next transaction to inherit, regardless of pooling mode).

## 6. Spoofing review (full findings)

Searched the entire migration history and application/function code for every avenue listed in the review request:

| Search | Result |
|---|---|
| Functions wrapping `set_config` | **None found.** No existing function anywhere in this repository's 181 migrations calls `set_config`. This migration introduces the only usages. |
| Generic SQL execution reachable by authenticated users | **None found.** Searched for `exec_sql`/`execute_sql`/`run_sql`/`raw_sql`-style function names — none exist. |
| User-controlled dynamic SQL | Six files use `EXECUTE format(...)`/`EXECUTE '...'`. All six are either (a) one-time migration-time DDL (dropping/creating RLS policies, adding tables to the realtime publication) that only ever runs during `migrate` application, not reachable at runtime by any user, or (b) `match_decision_embeddings()`, a parameterized read-only query (`$1`–`$5` placeholders, no caller text interpolated into the SQL body itself). No injection or config-setting surface in any of them. |
| Arbitrary configuration setters | **None found.** No RPC exists that takes a GUC name/value pair and calls `set_config` on the caller's behalf. |
| Broad `EXECUTE` grants | **None found.** `GRANT EXECUTE ... TO PUBLIC` does not appear anywhere in the schema. |
| Any authenticated RPC capable of setting the trusted context | **None.** The only authenticated-granted function with "config"/"settings" in its name, `get_my_org_security_settings()`, is `LANGUAGE sql STABLE` — read-only by construction, cannot call `set_config`. |

**Conclusion:** no existing authenticated-reachable code path in this repository can set or spoof `quantivis.internal.decision_transition_authorized`. This is a claim about the client/PostgREST attack surface specifically — `service_role` (used by edge functions, not end users) is a separate, higher-trust boundary; if a `service_role` credential were compromised, it could execute arbitrary SQL including `set_config`, but that is a server-side-compromise threat model, not the client-spoofing threat model this mechanism defends against.

## 7. Non-browser writers of `decision_status`

Full trace, every edge function that references `decision_status` in any way:

| Function | Reads or writes? | Write type | Affected by new guard? |
|---|---|---|---|
| `embed-decisions` | Reads | — | No |
| `weekly-calibration-digest` | Reads | — | No |
| `cognitive-bias-detect` | Reads | — | No |
| `event-stream` | Writes | `INSERT` (`decision_status: "pending"`, fixed constant) | No |
| `create-demo-session` | Writes | `INSERT` (fixed constants: `approved`, `pending`) | No |
| `seed-demo-data` | Writes | `INSERT` (fixed constants: `approved`, `pending`, `rejected`) | No |
| `execute-decision-action` | Writes `execution_status` only | `UPDATE` | No — different column entirely |

No cron/scheduled function, and no trigger anywhere in the schema, writes `decision_status`. The only `UPDATE`-based writers of `decision_status` in the entire codebase are `approve_decision()` and `reject_decision()` (both extended by this migration) and the direct browser paths this migration blocks.

## 8. Legacy-classification backfill: trigger side-effect review

Full inventory of triggers attached to `decision_ledger` before this migration:

| Trigger | Timing | Guard condition | Fires on the backfill? | Effect |
|---|---|---|---|---|
| `update_decision_ledger_updated_at` | `BEFORE UPDATE` | None — unconditional | **Yes** | Would bump `updated_at` on every backfilled row |
| `trg_intel_writeback_on_decision_resolved` | `AFTER UPDATE` | Only acts if `execution_status` changes to a terminal value or `outcome_measured_at` changes | No-op (backfill touches neither column) | None — confirmed by reading the function body, not assumed |
| `trg_enforce_decision_approval_gate` | `BEFORE UPDATE` | Only acts if `decision_status` changes | No-op (backfill only writes `decision_audit_source`) | None |

Two real, confirmed side effects were found and are handled as follows:

1. **`updated_at` churn** (from `update_decision_ledger_updated_at`): **suppressed.** The backfill statement is wrapped in `ALTER TABLE ... DISABLE TRIGGER update_decision_ledger_updated_at` / `... ENABLE TRIGGER ...`, tightly scoped to only that one `UPDATE`. This is a standard, well-established pattern for backfills that must not disturb `updated_at`. Trade-off, documented in the migration: `DISABLE`/`ENABLE TRIGGER` are `ALTER TABLE` operations and briefly require an `ACCESS EXCLUSIVE` lock on `decision_ledger` — the migration recommends running during a low-traffic window. The other two pre-existing triggers are deliberately **not** disabled, since they are already self-guarding and confirmed inert for this specific backfill.

2. **Realtime broadcast** (`decision_ledger` is a member of the `supabase_realtime` publication, added in `20260308145445_2e1725ed-...sql`): **not suppressed — accepted and documented.** Publication membership operates at the WAL/logical-replication level, independent of trigger state, so no trigger-level suppression can prevent it; the only way to prevent the broadcast would be to temporarily remove `decision_ledger` from the publication, which has a far wider blast radius (it would silence realtime updates for *all* concurrent readers of the table, not just this migration's own writes) than the one-time backfill it would be protecting against. No current subscriber to `decision_ledger` realtime changes was found anywhere in `src/` (searched for `.on('postgres_changes'` and channel subscriptions referencing the table), and the only column being written (`decision_audit_source`) is not rendered in any UI. Given that, the migration accepts up to ~345 realtime change events as a one-time, low-risk cost rather than introducing the larger risk of touching publication membership.

## 9. Preserved requirements (carried over from revision 1, unchanged)

- Controlled-value constraints, `NOT VALID` + explicit preflight + separate manual `VALIDATE CONSTRAINT` step.
- No fabricated `decided_by`/`decided_at` — the backfill only ever reads them to classify existing rows.
- Fixed `search_path` on every function.
- `SECURITY DEFINER` grants: `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` on the two RPCs (unchanged from the currently-deployed grant); the new trigger function gets `REVOKE ALL FROM PUBLIC` with no grant at all.
- Rollback lives in `supabase/rollback/`, outside `supabase/migrations/`, never auto-applied.
- Full manual test suite embedded in the migration file: direct-update bypass tests (now including the `dismissed` case revision 1 missed), RPC success tests, unauthorised-role tests, connection-pool leakage tests (new — same-transaction and cross-connection variants), legacy-row compatibility tests (now including an explicit `updated_at`-not-bumped check).

## 10. What was not done

- The migration was not applied to any database.
- Supabase types were not regenerated.
- No application code was modified — `DecisionLedger.tsx`/`ModifyDecisionDialog.tsx` still perform the direct `UPDATE` that this migration will block once applied; wiring the UI to `approve_decision()`/`reject_decision()` instead is a separate, follow-on application-code change, out of scope here.
- `20260713010000_fix_decision_approval_atomicity.sql` was not copied, referenced as a source of truth, or reapplied.
