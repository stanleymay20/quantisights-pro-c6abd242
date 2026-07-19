# Decision Workflow Integrity Hardening — Design Report (Revision 3)

**Status: PROPOSED. No migration has been applied to any database.**
Companion artefacts:
- `supabase/migrations/20260719140000_harden_decision_workflow_integrity.sql` (forward, not applied)
- `supabase/rollback/20260719140000_harden_decision_workflow_integrity_rollback.sql` (outside `supabase/migrations/`, never auto-applied)

**Supersedes** `supabase/migrations/20260719130000_decision_ledger_transition_integrity.sql`, a prior review-only proposal that is also still unapplied. This migration is self-contained (`CREATE OR REPLACE` / `DROP ... IF EXISTS` throughout) and does not require that file to have been applied first. **Recommendation: delete or clearly mark `20260719130000` as superseded before this proposal is ever considered for application** — not done here, since this task's scope is additive only ("add only the three review artefacts"). The two files must never both be applied; see "Rollback scope" below for why.

## 1. Reconstructed live definitions

Reconstructed from the restored migration history (`supabase/migrations/*.sql` up to the confirmed live tip `20260713110640`) plus Lovable's direct-inspection findings. `20260719130000` is excluded from this reconstruction — it is a proposal, not a live object, exactly like this document's own migration.

**`decision_ledger` table** — created `20260225182540`, with columns added by 10 subsequent migrations (calibration scoring, simulation linkage, learning calibration, `decision_context_id`, explanation fields, counterfactual linkage, `required_approvals`/`approval_chain`/governance columns, `is_suppressed`/`suppression_reason`, AICIS linkage). Full column list not reproduced here — see the migration files cited by timestamp in the design derivation below.

**RLS policies (live, current — confirmed unchanged by any migration after their creation):**

| Policy | Command | Rule | Source |
|---|---|---|---|
| "Leadership can view decisions" | SELECT | `get_user_org_role() IN (owner, admin, executive)` | `20260303085806` (replaced the original SELECT policy) |
| "Admins/owners can insert decisions" | INSERT | `get_user_org_role() IN (owner, admin)` — **no check on `decision_status`'s value** | `20260225182540`, unchanged since |
| "Admins/owners can update decisions" | UPDATE | `get_user_org_role() IN (owner, admin)` — **no check on which columns or values** | `20260225182540`, unchanged since |
| "Admins/owners can delete decisions" | DELETE | `get_user_org_role() IN (owner, admin)` | `20260225182540`, unchanged since |

The INSERT policy's lack of a value check on `decision_status` is exactly the mechanism behind Codex's finding: any owner/admin can `INSERT ... decision_status = 'approved'` directly and it satisfies RLS.

**Triggers on `decision_ledger` (live, current — 3 total):**

1. `update_decision_ledger_updated_at` — `BEFORE UPDATE`, unconditional, `update_updated_at_column()`. From `20260225182540`.
2. `trg_intel_writeback_on_decision_resolved` — `AFTER UPDATE`, self-guarded (only acts if `execution_status` changes to a terminal value or `outcome_measured_at` changes). From `20260521093847`.
3. `trg_enforce_decision_approval_gate` — `BEFORE UPDATE`, self-guarded (only acts if `decision_status` changes). Original (buggy, `NEW.status`) body from `20260530194703`; **corrected body (`NEW.decision_status`) from `20260713101124`, confirmed live-correct by Lovable.**

**RPCs (live, current, full bodies reproduced verbatim in the migration file's Step 5 comments and reused as the base for this proposal's extension):**

- `approve_decision(uuid, uuid, text, int, text)` — `20260713053125`. `SECURITY DEFINER`, `search_path = public`, row-locks via `SELECT ... FOR UPDATE`, checks `get_user_org_role`, checks `decision_status = 'pending'`, writes `decision_status/decided_at/decided_by`, inserts `audit_log`, inserts `execution_plans`, conditionally inserts `decision_outcomes`. `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO authenticated`.
- `reject_decision(uuid, text)` — same migration, same pattern, no execution-plan/outcome side effects.
- `enforce_decision_approval_gate()` — see triggers above.
- `count_measured_outcomes(uuid)` — `20260713101124`, read-only, unrelated to this hardening's write path.
- `get_user_org_role(uuid, uuid)`, `is_org_member(uuid, uuid)`, `check_decision_evaluability(...)` — pre-existing dependencies, confirmed present, signatures unchanged.

**Status-related constraints (live, current): none.** No `CHECK` constraint on `decision_status` or `execution_status` exists anywhere in the 181 tracked, live-applied migrations.

**Grants on `decision_ledger` table itself: not found in any migration.** See "Gap" below.

### Gap explicitly documented (per requirement 1)

**Table-level `GRANT`/default-privilege on `decision_ledger` for `anon`/`authenticated` is never set by any tracked migration.** This repository relies on Supabase's project-level default privilege grant (set at project bootstrap, outside the migrations directory) rather than an explicit per-table `GRANT`. This is consistent with every other table in the schema (no table in this repo has an explicit `GRANT ... TO authenticated` for ordinary CRUD — only special append-only/service-role-only tables like `audit_log` and `context_governance_audit` get explicit grants, precisely because they *withhold* the default). **This is not a blocker**: this proposal's enforcement point is a trigger, which fires regardless of which role's grant/RLS path let the write through in the first place — so the exact grant configuration doesn't change the design. Preflight query 6 in the migration file lets the operator confirm the actual grant state against this assumption before applying.

No other live-definition gap was found. Every object this proposal depends on or extends was reconstructed from an actual migration file, not assumed.

## 2. Status vocabulary (re-derived, re-justified)

Unchanged from the prior proposal's derivation, re-verified against the current repository state (post lint-remediation commit `e8fc8f66a...`, which touched no decision-status logic):

**`decision_status`** (6 values): `pending` (default), `approved`, `rejected`, `dismissed`, `executable`, `executed`.

**`dismissed` is included because it is justified by a real production write path**, per the instruction not to add unjustified values: `DecisionQueue.tsx:219` inserts `decision_status: "dismissed"` for the advisory/signal dismissal flow. **`deferred` is not included** — no write site anywhere in `src/`, `supabase/functions/`, or `supabase/migrations/` produces it.

**`execution_status`** (6 values): `not_started` (default), `in_progress`, `completed`, `failed`, `cancelled`, `blocked`.

Every value traced to a concrete write site (application code, Edge Function, or the `enforce_decision_approval_gate` trigger's own guard logic for `executable`/`executed`) — full citation table available in this repo's prior lint-debt and decision-integrity audit reports. The migration's preflight queries are the actual authority; if live data contains a value not listed, the operator must stop before running `VALIDATE CONSTRAINT`.

## 3. Deny-by-default UPDATE protection

Unchanged in principle from the prior proposal: **any `UPDATE` that changes `decision_status`, to any value, requires the trusted transaction-local flag** — no enumerated transition list. A full write-site trace (repeated fresh for this revision) confirms zero legitimate direct-`UPDATE` writers of `decision_status` outside `approve_decision`/`reject_decision`. Unrelated-field updates and `execution_status` progression are explicitly unaffected (the trigger's first check is `IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN RETURN NEW`).

**Service-role coverage**: this repository's own migrations repeatedly and explicitly document that `service_role` bypasses RLS (comments in `20260401045214`, `20260401045403`, `20260401050718`, `20260426062247`, `20260526102504`, `20260526192942`, `20260606164442`, `20260619073534`) but **triggers are not subject to `BYPASSRLS`** — a `BEFORE`/`AFTER` trigger fires for every writer regardless of role. This is precisely why the enforcement mechanism is a trigger and not an RLS `WITH CHECK`: RLS alone would leave `service_role` completely unconstrained (as it already is for every other table), but the trigger closes that gap too.

## 4. Terminal-status INSERT bypass

**Chosen design: (A) deny-by-default for ordinary INSERTs, layered with (B) a dedicated audited creation RPC (`create_predecided_decision`) for the legitimate exception.** Not a pure choice of one over the other — both are structurally required together:

- **(A) alone, unconditionally**, would break the three Edge Functions (`create-demo-session`, `seed-demo-data`, `event-stream`) that legitimately insert decisions already `approved`/`rejected` as demo/seed data — with no path forward, since "preserve legitimate demo/seed/import workflows" was explicit.
- **(B) alone, without (A) as the baseline INSERT rule**, would not actually close Codex's bypass — an ordinary owner/admin could still `INSERT ... decision_status = 'approved'` directly against the table, ignoring the new RPC's existence entirely, since nothing would stop them.
- **A pure "(A) + raw `set_config` escape hatch" design does not work technically**: the three Edge Functions call `supabase-js`'s `.from("decision_ledger").insert(...)` over PostgREST's REST API. There is no way for a single REST `INSERT` call to first execute an arbitrary `SELECT set_config(...)` statement in the same transaction — PostgREST does not expose that. The only way to "chain" a `set_config` call before a decision-row `INSERT` is inside a single database function invoked via RPC — which is exactly `create_predecided_decision`.

`create_predecided_decision(_organization_id, _decision_status, _recommended_action, _chosen_action, _decision_type, _execution_status, _decided_by, _confidence_at_decision)`:
- Rejects any `_decision_status` other than `approved`/`rejected`/`executable`/`executed` (a "pre-decided" record is never created as `pending` — that's what the ordinary INSERT path is for — or `dismissed`, which remains insert-only via the existing ordinary path).
- For authenticated (non-service-role) callers, enforces the identical owner/admin membership check the existing INSERT RLS policy already requires. For `service_role` callers (`auth.uid() IS NULL` — no JWT to check a role against), skips that check, matching this repo's established convention.
- Sets the trusted flag, inserts, stamps `decision_audit_source = 'rpc'`, resets the flag, writes an `audit_log` entry — mirroring `approve_decision`/`reject_decision`'s pattern exactly.
- `decided_at` is always database-generated (`now()`), never caller-supplied, even though this is a backend/service-role trust boundary rather than a browser one. `decided_by` is accepted as an explicit parameter for this RPC specifically, since demo/seed data legitimately needs to represent a specific (or absent) historical decision-maker — this is **not** the same as trusting browser-supplied `decided_by`, which never reaches this function (no browser code path calls it; see §9).
- Granted to `service_role` only — the sole current callers of a non-pending-at-creation INSERT are all three service-role-keyed Edge Functions (verified directly against their source: all three construct their Supabase client with `SUPABASE_SERVICE_ROLE_KEY`).

## 5. Trusted workflow context

`quantivis.internal.decision_transition_authorized`, exactly as specified:
- `pg_catalog.set_config('quantivis.internal.decision_transition_authorized', 'true'/'false', true)` — explicitly schema-qualified (belt-and-suspenders against a hypothetical `public.set_config` shadow, on top of `search_path = pg_catalog, public` putting `pg_catalog` first regardless).
- `pg_catalog.current_setting('quantivis.internal.decision_transition_authorized', true)` — the `true` second argument returns `NULL` instead of erroring when unset, which is the common case (most transactions on this table never touch this GUC).
- `is_local = true` (the third `set_config` argument): transaction-local. Cleared automatically at `COMMIT`/`ROLLBACK`, including an aborted transaction from an unhandled exception — so a failed RPC call cannot leave the flag set for any subsequent statement, with or without the explicit reset.
- Set immediately before the guarded write in every function that legitimately needs it (`approve_decision`, `reject_decision`, `create_predecided_decision`); reset to `'false'` immediately after, as defense in depth on top of the transaction-scoping guarantee.
- No caller-controlled setting name anywhere — the string is a literal in three function bodies, never constructed from input.
- No dynamic SQL anywhere in this proposal.
- No generic/exposed `set_config` wrapper exists or is introduced.
- The trigger function (`enforce_decision_status_trusted_transition`) has `REVOKE ALL ... FROM PUBLIC` and no `GRANT` at all — it must only ever run as a trigger body.

## 6. RPC safety

All properties in the requirement list were already present in the live `approve_decision`/`reject_decision` bodies and are **preserved unchanged**, except one deliberate strengthening: `search_path` is upgraded from `public` alone to `pg_catalog, public` on both functions (and on the two new functions) — a reviewed, intentional change, called out explicitly rather than folded silently into "unrelated" edits. Every other line of both RPC bodies is byte-identical to the live version deployed by `20260713053125`, confirmed by direct diff against that file's content during authoring. `create_predecided_decision` follows the same shape: `SECURITY DEFINER`, fixed `search_path`, row-appropriate authorization check, atomic single-transaction write + audit insert, database-generated `decided_at`.

## 7. Legacy provenance

**No row-by-row backfill.** `decision_audit_source` is added as `NOT NULL DEFAULT 'legacy'` — in Postgres 11+, adding a column with a non-volatile constant default is a **catalog-only operation**: no table rewrite, no row physically touched, no trigger fired (including `update_decision_ledger_updated_at`), no WAL bulk-write. Every pre-existing row reports `'legacy'` for this column without ever having been the target of an `UPDATE` statement. `decided_by`/`decided_at` are never written by this migration — Step 2 touches no existing row's data at all.

**A single constant label (not two, unlike the superseded `20260719130000` proposal's `legacy_attributed`/`legacy_unattributed` split) truthfully represents all pre-existing rows equally** — every one of them predates the RPC-only enforcement regime this migration introduces, regardless of whether `decided_by` happens to be populated. The `decided_by IS NULL` split among `'legacy'` rows remains fully queryable (preflight query 2, post-migration verification query 5) without needing it baked into the column's value.

**Existing approved rows with `decided_by IS NULL`** (345 per Lovable's report): represented as `decision_audit_source = 'legacy'`, exactly like every other pre-existing row. Their `decided_by` remains `NULL` — never fabricated, never inferred, never defaulted to a synthetic value.

## 8. Trigger interaction safety

Full inventory (3 pre-existing + 1 new = 4 triggers on `decision_ledger` after this migration):

| Trigger | Timing | Guard | Interaction with the new trigger |
|---|---|---|---|
| `update_decision_ledger_updated_at` | `BEFORE UPDATE` | none (unconditional) | Reads/writes only `updated_at`. No shared state with the new trigger's `decision_status` check. Order-independent. |
| `trg_intel_writeback_on_decision_resolved` | `AFTER UPDATE` | `execution_status`→terminal or `outcome_measured_at` change | Reads only `execution_status`/`outcome_measured_at`/`outcome_delta`. Never inspects `decision_status`. Fires after all `BEFORE` triggers and the row write regardless of what the new trigger did. Order-independent. |
| `trg_enforce_decision_approval_gate` | `BEFORE UPDATE` | `decision_status` change | Both this trigger and the new one gate on `decision_status` changing, but check *different* things (sequencing of `executable`→`executed` and approval-chain satisfaction, vs. whether the change came from a trusted RPC at all). Neither reads a value the other writes; both can independently `RAISE EXCEPTION`, which aborts the statement regardless of which fired first. **Verified order-independent by tracing both function bodies, not assumed from alphabetical firing order.** |
| `enforce_decision_status_trusted_transition` (new) | `BEFORE INSERT OR UPDATE` | `decision_status` change (UPDATE) / always (INSERT) | See above. Scoped strictly to `decision_status` — the very first check in the `UPDATE` branch is the identity guard (`NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN RETURN NEW`), so it is provably inert for every other column change. |

**Consolidation choice**: one trigger function covering both `INSERT` and `UPDATE` (branching on `TG_OP`), rather than two separate triggers — this was a deliberate choice to minimize the new trigger-ordering surface rather than adding a second independent object to reason about. No other trigger on `decision_ledger` fires on `INSERT` at all, so there is no INSERT-side ordering question to analyze.

**No notification/realtime side effect from Step 1–2** (constraints and the metadata-only column add touch no row, emit no WAL row-change event). Step 3's trigger and Step 4/5's RPCs, once *used*, behave exactly like the pre-existing `approve_decision`/`reject_decision` calls already do with respect to `decision_ledger`'s membership in the `supabase_realtime` publication (`20260308145445`) — this migration does not change that membership or add any new realtime-relevant write pattern.

## 9. Frontend and application compatibility plan

**This migration, once applied, will break the following current writers.** No application code is changed in this task — this is the exact follow-up work required before application:

| Writer | Current behavior | Required change |
|---|---|---|
| `src/pages/DecisionLedger.tsx` (`updateDecision()`) | `supabase.from("decision_ledger").update({ decision_status: "approved"/"rejected", ... })` directly | Must call `supabase.rpc("approve_decision", {...})` / `supabase.rpc("reject_decision", {...})` instead, exactly as `approve_decision`/`reject_decision` already exist to support (this is the same fix identified as the P0 headline finding of this workstream's earlier Stage 2 audit — the RPCs have been live-correct and unused by the frontend this whole time) |
| `src/components/dashboard/ModifyDecisionDialog.tsx` | Direct `decision_status: "approved"` update | Same — route through `approve_decision` |
| `src/components/dashboard/DecisionQueue.tsx` (approve path, line ~163) | Direct `decision_status: "approved"` update on an existing row | Same — route through `approve_decision` |
| `src/components/dashboard/DecisionQueue.tsx` (dismiss path, line ~219) | Direct `INSERT` with `decision_status: "dismissed"` | **No change required** — this is an `INSERT` with `decision_status = 'dismissed'`, not `'approved'`/`'rejected'`/`'executable'`/`'executed'`, so it is outside `create_predecided_decision`'s terminal-status definition and is also **not** blocked by the new `BEFORE INSERT` trigger, since that trigger only blocks non-`'pending'` inserts — wait: `'dismissed'` **is** non-`'pending'`, so this path **will** break too. Must be routed through a trusted path — either extended to call `create_predecided_decision` (which would need `'dismissed'` added to its accepted status list) or a narrower alternative. **This is a real, previously-unflagged compatibility gap this design report surfaces**: recommend extending `create_predecided_decision`'s accepted `_decision_status` list to include `'dismissed'` in the actual implementation PR, or building a small parallel `dismiss_decision` RPC, before this migration is applied — not resolved in this proposal, since it requires an application-code decision this task is explicitly not authorized to make. |
| `supabase/functions/create-demo-session/index.ts` | Direct `service_role` `INSERT` with `decision_status: "approved"/"pending"` | Non-`'pending'` inserts must switch to `create_predecided_decision`; `'pending'` inserts are unaffected |
| `supabase/functions/seed-demo-data/index.ts` | Same pattern, `approved`/`pending`/`rejected` | Same |
| `supabase/functions/event-stream/index.ts` | `INSERT` with `decision_status: "pending"` only | **No change required** — already `'pending'` |
| `supabase/functions/execute-decision-action/index.ts` | Writes `execution_status` only, never `decision_status` | **No change required** |

**No other Edge Function, RPC, trigger, or service-role writer touches `decision_status`** (full trace repeated fresh for this revision, matching the prior audit's findings exactly).

## 10. Security review (spoofing, dynamic SQL, broad grants)

Repeated fresh against the current repository state:

| Check | Result |
|---|---|
| Existing `set_config` callers | None, other than the superseded `20260719130000` proposal (also unapplied). This migration introduces the only live usages. |
| Existing `current_setting` callers | Two unrelated usages found (`app.settings.service_role_key` in `20260418013648`, `request.jwt.claim.role` in `20260419025047`) — neither is caller-controllable, neither interacts with the new GUC name. |
| Generic SQL execution RPC | None (`exec_sql`/`execute_sql`/`run_sql` search: zero results). |
| Arbitrary config setters | None — no RPC forwards a caller-supplied name/value pair to `set_config`. |
| Dynamic SQL in new/modified functions | None. |
| `GRANT EXECUTE ... TO PUBLIC` anywhere in the schema | None. |
| Service-role bypass assumptions | Confirmed as this repository's own well-documented, repeatedly-cited convention (see §3) — not merely assumed. |

**Conclusion unchanged from the prior revision**: no existing authenticated-reachable code path can set or spoof `quantivis.internal.decision_transition_authorized`.

## 11. Tests and verification

All included as manual, transaction-wrapped SQL blocks directly in the migration file (matching this repository's own established Phase 2/decision-integrity documentation convention), covering every item on the required list: direct `approved`/`rejected`/`executable`/`dismissed` UPDATE rejection, unrelated-field and `execution_status` update compatibility, terminal-status INSERT rejection for ordinary users plus the legitimate `create_predecided_decision` path, `approve_decision`/`reject_decision` success, unauthorized-role rejection (RPC and direct-UPDATE both), same-transaction and cross-connection flag-leakage checks, a failed-RPC-clears-the-flag check, legacy-row compatibility, and constraint validation. See the migration file's own section headers for the exact queries.

## 12. Rollback scope

- Lives at `supabase/rollback/20260719140000_harden_decision_workflow_integrity_rollback.sql`, outside `supabase/migrations/`.
- Removes only: `create_predecided_decision()`, `enforce_decision_status_trusted_transition()` + its trigger, `decision_audit_source` + its constraint, the two status `CHECK` constraints.
- Restores `approve_decision`/`reject_decision` to their exact pre-this-migration bodies (verbatim from `20260713053125`).
- Does not touch `enforce_decision_approval_gate`, any pre-existing RLS policy, or any pre-existing trigger — none were modified by the forward migration.
- Irreversible/data implications documented in the rollback file's header: the `'legacy'`/`'rpc'` provenance label is discarded but re-derivable; rows created via `create_predecided_decision` while this migration was live are **not** deleted by the rollback, only the function that created them is; any Edge Function migrated to call `create_predecided_decision` (per §9) must be reverted to its pre-migration form **before** running this rollback, or it will start failing the moment the function is dropped.

## What was not done

- The migration was not applied to any database.
- Supabase types were not regenerated.
- No application code was modified — the four frontend/Edge Function paths identified in §9 as needing follow-up changes are listed, not touched.
- `20260713010000_fix_decision_approval_atomicity.sql` was not copied, referenced as a source of truth, or reapplied.
- `20260719130000_decision_ledger_transition_integrity.sql` was not deleted or modified — flagged as superseded, recommended for removal in a future cleanup, but out of this task's additive-only scope.
