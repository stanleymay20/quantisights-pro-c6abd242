-- REVIEW-ONLY PROPOSAL -- decision_ledger transition integrity hardening.
-- STATUS: PROPOSED. NOT APPLIED to any database. Committed to main as a
-- review artefact only -- do not run without explicit approval.
-- Companion rollback:
--   supabase/rollback/20260719130000_decision_ledger_transition_integrity_rollback.sql
-- (kept outside supabase/migrations/ so it is never auto-applied).
-- Design report: docs/security/decision-ledger-transition-integrity.md
--
-- Revision 2 of this proposal. Changes from revision 1 (never committed):
--   1. Deny-by-default: ANY UPDATE that changes decision_status now
--      requires the trusted flag, not just an enumerated list of
--      transitions. Investigation (see design report) found zero
--      legitimate write sites that update an EXISTING row's
--      decision_status outside approve_decision()/reject_decision() --
--      so there is no transition to carve out as an exception.
--   2. 'dismissed' is confirmed insert-only across the entire active
--      repo (browser and edge functions) -- no dedicated RPC added; a
--      BEFORE UPDATE trigger cannot affect INSERT, so DecisionQueue.tsx's
--      existing dismiss-by-insert flow is untouched.
--   3. Trusted flag renamed to quantivis.internal.decision_transition_authorized.
--   4. Spoofing review added (see design report) -- no existing
--      authenticated-reachable code path can set or spoof this GUC.
--   5. Backfill now explicitly suppresses updated_at churn via a
--      tightly-scoped trigger disable/enable around only the backfill
--      statement. Realtime-publication broadcast from the backfill
--      UPDATE is documented as an accepted, unavoidable-without-
--      disproportionate-risk side effect (see design report) -- no
--      current subscriber was found for decision_ledger, and the
--      touched column is not rendered anywhere.
--
-- Explicitly NOT included: any reapplication of
-- 20260713010000_fix_decision_approval_atomicity.sql (superseded --
-- enforce_decision_approval_gate() is already correct live, matching
-- supabase/migrations/20260713101124_c24694df-...sql already in this
-- repo's history; approve_decision()/reject_decision() are already
-- correctly deployed via 20260713053125_8fdc265c-...sql). This migration
-- does not touch enforce_decision_approval_gate() at all.

-- ============================================================================
-- PREFLIGHT (run manually BEFORE applying; NOT executed automatically)
-- ============================================================================
--
-- 1. Confirm the decision_status / execution_status vocabularies below
--    are complete against live data -- derived from every executable
--    write site found in src/, supabase/functions/, and
--    supabase/migrations/ (full citations in the design report), not
--    guessed:
--
--      SELECT decision_status, count(*) FROM public.decision_ledger
--      GROUP BY decision_status ORDER BY 1;
--      -- Expected set: pending, approved, rejected, dismissed, executable, executed
--
--      SELECT execution_status, count(*) FROM public.decision_ledger
--      GROUP BY execution_status ORDER BY 1;
--      -- Expected set: not_started, in_progress, completed, failed, cancelled, blocked
--
--    If either query returns a value not listed, STOP -- do not run the
--    VALIDATE CONSTRAINT statements in Step 1 until this file is revised.
--
-- 2. Confirm the reported 345 legacy rows (informational -- this
--    migration never writes decided_by/decided_at):
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status IN ('approved','rejected') AND decided_by IS NULL;
--      -- Expected: 345. If materially different, the backfill below
--      -- still runs correctly (derived from live data, not hardcoded),
--      -- but investigate the drift before proceeding.
--
-- 3. Confirm objects this migration assumes already exist (none are
--    created here):
--
--      SELECT column_name FROM information_schema.columns
--      WHERE table_name = 'decision_ledger' AND column_name = 'required_approvals';
--      SELECT tablename FROM pg_tables WHERE tablename = 'approval_chain_stages';
--      SELECT proname FROM pg_proc WHERE proname = 'check_decision_evaluability';
--      SELECT tablename FROM pg_tables WHERE tablename IN ('execution_plans','decision_outcomes','audit_log');
--
-- 4. Confirm approve_decision/reject_decision current signatures:
--
--      SELECT proname, pg_get_function_identity_arguments(oid)
--      FROM pg_proc WHERE proname IN ('approve_decision', 'reject_decision');
--      -- Expected: approve_decision(uuid, uuid, text, int, text),
--      --           reject_decision(uuid, text)
--
-- 5. Confirm the trigger inventory on decision_ledger matches what this
--    migration's side-effect analysis assumes (see design report for the
--    full rationale for each):
--
--      SELECT tgname, tgtype FROM pg_trigger
--      WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal;
--      -- Expected: update_decision_ledger_updated_at,
--      --           trg_intel_writeback_on_decision_resolved,
--      --           trg_enforce_decision_approval_gate
--      -- If any OTHER trigger exists that this file's author did not
--      -- see, STOP -- the side-effect analysis in the design report may
--      -- not be complete.
-- ============================================================================

-- ============================================================================
-- Step 1: controlled-value constraints. NOT VALID -- validate separately,
-- as an explicit manual step, only after preflight query 1 confirms
-- clean data.
-- ============================================================================

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_decision_status_check
  CHECK (decision_status IN ('pending','approved','rejected','dismissed','executable','executed'))
  NOT VALID;

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_execution_status_check
  CHECK (execution_status IN ('not_started','in_progress','completed','failed','cancelled','blocked'))
  NOT VALID;

-- Run ONLY after preflight query 1 confirms clean data:
--   ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_decision_status_check;
--   ALTER TABLE public.decision_ledger VALIDATE CONSTRAINT decision_ledger_execution_status_check;

-- ============================================================================
-- Step 2: honest legacy annotation. Purely additive and nullable; does
-- NOT write decided_by or decided_at -- those are read-only inputs to
-- the classification below, never fabricated.
--
-- Side-effect suppression: update_decision_ledger_updated_at is an
-- unconditional BEFORE UPDATE trigger (bumps updated_at on every UPDATE
-- regardless of which column changed) -- disabled for the duration of
-- this one backfill statement only, then re-enabled immediately in the
-- same transaction. This is a schema-level ALTER TABLE and briefly
-- requires an ACCESS EXCLUSIVE lock on decision_ledger -- run during a
-- low-traffic window. trg_intel_writeback_on_decision_resolved and
-- trg_enforce_decision_approval_gate are NOT disabled: both are
-- self-guarding (they no-op unless execution_status/outcome_measured_at
-- or decision_status respectively actually change, and this backfill
-- changes neither), so they fire but do nothing -- confirmed in the
-- design report, not assumed.
--
-- NOT suppressed: decision_ledger is a member of the supabase_realtime
-- publication (added in 20260308145445_2e1725ed-...sql), so this
-- backfill's UPDATE will still emit one logical-replication change event
-- per affected row regardless of trigger state -- publication membership
-- operates at the WAL level, independent of triggers. No current
-- subscriber to decision_ledger changes was found in this repo, and the
-- only column being written (decision_audit_source) is not rendered
-- anywhere -- see the design report for the full justification for
-- accepting this as an unavoidable, low-risk, one-time cost rather than
-- pulling the table from the publication (which would have a much wider
-- blast radius than this migration's scope).
-- ============================================================================

ALTER TABLE public.decision_ledger
  ADD COLUMN IF NOT EXISTS decision_audit_source text;

ALTER TABLE public.decision_ledger
  ADD CONSTRAINT decision_ledger_audit_source_check
  CHECK (decision_audit_source IS NULL
     OR decision_audit_source IN ('rpc','legacy_attributed','legacy_unattributed'));

ALTER TABLE public.decision_ledger DISABLE TRIGGER update_decision_ledger_updated_at;

-- Classification of existing, already-true facts, not an invention of
-- new ones: every row already in a final decision_status necessarily
-- predates both this migration and the RPC-only enforcement added below.
UPDATE public.decision_ledger
SET decision_audit_source = CASE WHEN decided_by IS NULL THEN 'legacy_unattributed' ELSE 'legacy_attributed' END
WHERE decision_status IN ('approved','rejected')
  AND decision_audit_source IS NULL;

ALTER TABLE public.decision_ledger ENABLE TRIGGER update_decision_ledger_updated_at;

-- ============================================================================
-- Step 3: trusted-context flag + deny-by-default transition trigger.
-- A NEW, separate function/trigger -- does not touch
-- enforce_decision_approval_gate() at all.
--
-- Deny-by-default (revision 2): ANY UPDATE that changes decision_status
-- requires the trusted flag -- not an enumerated list of transitions.
-- Investigation found no legitimate write site that updates an EXISTING
-- row's decision_status outside approve_decision()/reject_decision()
-- (full write-site trace in the design report), so there is no
-- transition to explicitly carve out as directly writable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_decision_status_trusted_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Any column other than decision_status is never blocked here --
  -- owner/admin users keep full direct UPDATE access to notes,
  -- execution_status progression (Start/Complete buttons in
  -- DecisionLedger.tsx), calibration fields, outcome tracking, etc.
  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('quantivis.internal.decision_transition_authorized', true), 'false') <> 'true' THEN
    RAISE EXCEPTION
      'Decision % decision_status transition from % to % must originate from a trusted RPC (approve_decision()/reject_decision(), or an equivalent trusted workflow); direct updates to decision_status are not permitted',
      NEW.id, OLD.decision_status, NEW.decision_status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

-- Restricted per SECURITY DEFINER review: this function must only ever
-- run as a trigger body. Trigger firing is authorized by the trigger
-- definition itself, not by the invoking role's EXECUTE privilege on the
-- function -- revoking EXECUTE from PUBLIC does not disable the trigger,
-- it only prevents a direct `SELECT ...()` style call (which would error
-- regardless, since NEW/OLD only exist in trigger context).
REVOKE ALL ON FUNCTION public.enforce_decision_status_trusted_transition() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_enforce_decision_status_trusted_transition ON public.decision_ledger;
CREATE TRIGGER trg_enforce_decision_status_trusted_transition
  BEFORE UPDATE ON public.decision_ledger
  FOR EACH ROW EXECUTE FUNCTION public.enforce_decision_status_trusted_transition();

-- NOTE: no current write path (application code or edge function) sets
-- decision_status to 'executable' or 'executed' at all -- those values
-- only appear inside enforce_decision_approval_gate()'s own guard logic,
-- anticipating a future write path that does not exist yet. Deny-by-
-- default already covers them automatically (no exception was carved
-- out), so no special case was needed here -- but the moment an
-- "executable"/"executed" RPC is built, it MUST call
-- set_config('quantivis.internal.decision_transition_authorized', 'true', true)
-- the same way approve_decision/reject_decision do below, or it will be
-- silently blocked by this trigger.

-- ============================================================================
-- Step 4: extend approve_decision / reject_decision to (a) set the
-- transaction-local trusted flag immediately before their UPDATE, (b)
-- reset it immediately after, and (c) stamp decision_audit_source =
-- 'rpc'. Every other line is byte-identical to the currently-deployed
-- body in
-- supabase/migrations/20260713053125_8fdc265c-9fc4-41eb-99d9-b35e8615fc64.sql:
-- row lock, role check, status precondition, audit_log insert,
-- execution_plans insert, decision_outcomes insert are all unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.approve_decision(
  _decision_id uuid,
  _dataset_id uuid DEFAULT NULL,
  _expected_metric text DEFAULT NULL,
  _evaluation_window_days int DEFAULT 30,
  _suggested_owner text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_recommended_action text;
  v_decision_type text;
  v_confidence numeric;
  v_audit_id uuid;
  v_plan_id uuid;
  v_outcome_id uuid;
  v_eval jsonb;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, decision_status, recommended_action, decision_type,
         COALESCE(capped_confidence, confidence_at_decision, raw_confidence, 50)
  INTO v_org_id, v_status, v_recommended_action, v_decision_type, v_confidence
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may approve decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be approved (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Trusted flag: transaction-local (is_local = true, the third
  -- argument), so it cannot leak to any other transaction on this or any
  -- other pooled connection, and is automatically cleared at
  -- COMMIT/ROLLBACK even if the explicit reset below is never reached
  -- due to an error raised after this point.
  PERFORM set_config('quantivis.internal.decision_transition_authorized', 'true', true);

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid(),
      decision_audit_source = 'rpc'
  WHERE id = _decision_id;

  PERFORM set_config('quantivis.internal.decision_transition_authorized', 'false', true);

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_approved', 'decision', _decision_id::text,
    jsonb_build_object('recommended_action', v_recommended_action, 'confidence_at_decision', v_confidence)
  )
  RETURNING id INTO v_audit_id;

  INSERT INTO public.execution_plans (
    decision_id, organization_id, action_title, action_description, owner_user_id,
    priority, status, trigger_type, trigger_config
  )
  VALUES (
    _decision_id, v_org_id, left(v_recommended_action, 200), 'Execution plan for: ' || v_recommended_action,
    auth.uid(), 'medium', 'pending', 'manual',
    jsonb_build_object('suggested_owner', _suggested_owner, 'evaluation_window_days', _evaluation_window_days)
  )
  RETURNING id INTO v_plan_id;

  v_eval := public.check_decision_evaluability(v_org_id, _dataset_id, _expected_metric);

  IF (v_eval ->> 'status') <> 'NOT_MEASURABLE' THEN
    INSERT INTO public.decision_outcomes (
      decision_id, organization_id, dataset_id, expected_metric, expected_direction, evaluation_window_days
    )
    VALUES (
      _decision_id, v_org_id,
      COALESCE((v_eval ->> 'resolved_dataset_id')::uuid, _dataset_id),
      COALESCE(v_eval ->> 'resolved_metric', _expected_metric, v_decision_type, 'unknown'),
      'increase', _evaluation_window_days
    )
    RETURNING id INTO v_outcome_id;
  END IF;

  RETURN jsonb_build_object(
    'decision_id', _decision_id,
    'decision_status', 'approved',
    'decided_at', v_now,
    'audit_id', v_audit_id,
    'execution_plan_id', v_plan_id,
    'decision_outcome_id', v_outcome_id,
    'evaluability', v_eval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_decision(
  _decision_id uuid,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_status text;
  v_existing_notes text;
  v_audit_id uuid;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT organization_id, decision_status, notes
  INTO v_org_id, v_status, v_existing_notes
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  IF public.get_user_org_role(auth.uid(), v_org_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may reject decisions' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be rejected (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('quantivis.internal.decision_transition_authorized', 'true', true);

  UPDATE public.decision_ledger
  SET decision_status = 'rejected',
      decided_at = v_now,
      decided_by = auth.uid(),
      decision_audit_source = 'rpc',
      notes = CASE WHEN _reason IS NULL THEN notes
                   ELSE COALESCE(v_existing_notes || E'\n', '') || 'Rejected in executive review: ' || _reason END
  WHERE id = _decision_id;

  PERFORM set_config('quantivis.internal.decision_transition_authorized', 'false', true);

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (
    v_org_id, auth.uid(), 'user', 'decision_rejected', 'decision', _decision_id::text,
    jsonb_build_object('reason', _reason)
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object('decision_id', _decision_id, 'decision_status', 'rejected', 'decided_at', v_now, 'audit_id', v_audit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_decision(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_decision(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- SPOOFING REVIEW SUMMARY (full detail in the design report)
-- ============================================================================
-- No existing function anywhere in this repository's migration history
-- calls set_config -- this migration introduces the only usages.
-- No authenticated-reachable RPC performs generic/arbitrary SQL execution
-- (searched for exec_sql/execute_sql/run_sql/raw_sql -- none exist).
-- All EXECUTE-format() dynamic SQL in the schema is either (a) one-time
-- migration-time DDL (policy create/drop, publication management) not
-- reachable at runtime by any authenticated user, or (b) parameterized
-- read-only queries (match_decision_embeddings) with no caller-controlled
-- text interpolated into the SQL body. No GRANT EXECUTE ... TO PUBLIC
-- exists anywhere in the schema. The one authenticated-granted function
-- with "config"/"settings" in its name (get_my_org_security_settings) is
-- STABLE LANGUAGE SQL (read-only), incapable of calling set_config.
-- Conclusion: no existing authenticated-reachable code path can set or
-- spoof quantivis.internal.decision_transition_authorized.

-- ============================================================================
-- SECURITY DEFINER REVIEW SUMMARY
-- ============================================================================
-- fixed search_path        : yes -- every function has SET search_path = public
-- user-controlled dynamic SQL : none in this migration's functions.
-- EXECUTE grants            : approve_decision/reject_decision: REVOKE ALL
--                             FROM PUBLIC then GRANT EXECUTE TO
--                             authenticated only (matches the currently
--                             deployed grant pattern exactly).
--                             enforce_decision_status_trusted_transition:
--                             REVOKE ALL FROM PUBLIC, no GRANT at all.
-- direct function access    : role/tenant authorization enforced INSIDE
--                             approve_decision/reject_decision
--                             (get_user_org_role check), not by RLS or
--                             GRANT alone -- unchanged from the
--                             pre-existing design.

-- ============================================================================
-- POST-MIGRATION VERIFICATION (run manually AFTER applying; NOT executed
-- automatically)
-- ============================================================================
--
-- 1. Constraints present and (once validated) valid:
--
--      SELECT conname, convalidated FROM pg_constraint
--      WHERE conrelid = 'public.decision_ledger'::regclass
--        AND conname IN ('decision_ledger_decision_status_check',
--                         'decision_ledger_execution_status_check',
--                         'decision_ledger_audit_source_check');
--
-- 2. New trigger present, enabled, and every OTHER trigger still enabled
--    (confirms the disable/enable wrap in Step 2 did not leave the
--    updated_at trigger off):
--
--      SELECT tgname, tgenabled FROM pg_trigger
--      WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal;
--      -- Expected: tgenabled = 'O' (origin, i.e. enabled) for ALL FOUR
--      -- triggers (the three pre-existing ones plus the new one).
--
-- 3. Row counts on decision_ledger unchanged:
--
--      SELECT count(*) FROM public.decision_ledger;
--
-- 4. Legacy backfill covered exactly the expected rows, no more:
--
--      SELECT decision_audit_source, count(*) FROM public.decision_ledger
--      WHERE decision_status IN ('approved','rejected')
--      GROUP BY decision_audit_source;
--      -- legacy_unattributed count should equal the count from preflight
--      -- query 2 (345 or whatever was actually found).
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status NOT IN ('approved','rejected')
--        AND decision_audit_source IS NOT NULL;
--      -- Expected: 0.
--
-- 5. intelligence_memory / aicis_intelligence_items were NOT touched by
--    the backfill (confirms trg_intel_writeback_on_decision_resolved
--    correctly no-op'd):
--
--      SELECT count(*) FROM public.intelligence_memory
--      WHERE attribution_notes LIKE 'Auto-recorded from decision %'
--        AND recorded_at > '<migration start timestamp>';
--      -- Expected: 0 new rows attributable to this migration's backfill.
-- ============================================================================

-- ============================================================================
-- DIRECT-UPDATE BYPASS TESTS (manual, run in a transaction, ROLLBACK)
-- ============================================================================
--
-- BEGIN;
-- UPDATE public.decision_ledger
-- SET decision_status = 'approved', decided_at = now(), decided_by = auth.uid()
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR, insufficient_privilege.
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'rejected'
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR, same reason.
-- ROLLBACK;
--
-- BEGIN;
-- -- Deny-by-default coverage check: an UPDATE-based attempt at the
-- -- transition that revision 1 of this proposal did NOT block --
-- -- confirms the gap named in the review is now closed.
-- UPDATE public.decision_ledger SET decision_status = 'dismissed'
-- WHERE id = '<real pending decision id>' AND organization_id = '<real org id>';
-- -- Expected: ERROR, insufficient_privilege (even though no current
-- -- application code ever attempts this via UPDATE).
-- ROLLBACK;
--
-- BEGIN;
-- -- Unrelated-field updates by the same owner/admin must NOT be blocked:
-- UPDATE public.decision_ledger SET notes = 'test note, not a status change'
-- WHERE id = '<real decision id>' AND organization_id = '<real org id>';
-- -- Expected: succeeds.
-- ROLLBACK;
--
-- BEGIN;
-- -- execution_status progression (Start/Complete buttons) must NOT be blocked:
-- UPDATE public.decision_ledger
-- SET execution_status = 'in_progress', execution_started_at = now()
-- WHERE id = '<real approved decision id>' AND organization_id = '<real org id>'
--   AND execution_status = 'not_started';
-- -- Expected: succeeds.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- RPC SUCCESS TESTS (manual, run in a transaction, ROLLBACK)
-- ============================================================================
--
-- BEGIN;
-- SELECT public.approve_decision('<real pending decision id>');
-- -- Expected: succeeds, jsonb with decision_status = 'approved',
-- -- non-null audit_id and execution_plan_id.
-- SELECT decision_status, decision_audit_source FROM public.decision_ledger
-- WHERE id = '<same decision id>';
-- -- Expected: decision_status = 'approved', decision_audit_source = 'rpc'.
-- SELECT count(*) FROM public.audit_log
-- WHERE resource_id = '<same decision id>' AND action_type = 'decision_approved';
-- -- Expected: 1.
-- ROLLBACK;
--
-- BEGIN;
-- SELECT public.reject_decision('<another real pending decision id>', 'test rejection');
-- -- Expected: succeeds, decision_status = 'rejected', decision_audit_source = 'rpc'.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- CONNECTION-POOL LEAKAGE TESTS (manual)
-- ============================================================================
--
-- 1. Same-transaction, cross-statement leak check (proves the explicit
--    reset works, not just is_local's transaction boundary):
--
--      BEGIN;
--      SELECT public.approve_decision('<real pending decision id A>');
--      UPDATE public.decision_ledger SET decision_status = 'rejected'
--      WHERE id = '<a DIFFERENT, still-pending decision id B>';
--      -- Expected: the second statement ERRORs even though it is in the
--      -- same transaction as a successful RPC call immediately before it.
--      ROLLBACK;
--
-- 2. Cross-connection leak check (simulates pgbouncer transaction-pooling
--    reassigning the same backend connection to a different logical
--    client immediately after a commit -- open two separate psql/client
--    sessions, do not use the same session for both halves):
--
--      -- Session 1:
--      SELECT public.approve_decision('<real pending decision id C>');
--      -- (this commits as its own transaction -- PostgREST/RPC calls
--      -- are not held open)
--
--      -- Session 2 (a fresh connection, potentially the same pooled
--      -- backend connection if pgbouncer reassigns it):
--      SELECT current_setting('quantivis.internal.decision_transition_authorized', true);
--      -- Expected: NULL/empty -- is_local = true guarantees the GUC does
--      -- not survive past the transaction that set it, regardless of
--      -- whether the underlying TCP/backend connection is reused by a
--      -- pooler.
--      BEGIN;
--      UPDATE public.decision_ledger SET decision_status = 'approved'
--      WHERE id = '<real pending decision id D>';
--      -- Expected: ERROR -- confirms no leaked authorization from
--      -- Session 1's RPC call.
--      ROLLBACK;
-- ============================================================================

-- ============================================================================
-- UNAUTHORISED-ROLE TESTS (manual -- requires impersonating a non-
-- owner/admin org member, standard Supabase local-testing pattern)
-- ============================================================================
--
-- SET LOCAL ROLE authenticated;
-- SET LOCAL request.jwt.claims = '{"sub": "<a real MEMBER, not owner/admin, user id>"}';
-- BEGIN;
-- SELECT public.approve_decision('<real pending decision in that member''s org>');
-- -- Expected: ERROR, insufficient_privilege, "only organization
-- -- owners/admins may approve decisions" (unchanged from current
-- -- behavior -- this migration does not alter this check).
-- ROLLBACK;
--
-- BEGIN;
-- UPDATE public.decision_ledger SET decision_status = 'approved'
-- WHERE id = '<real pending decision in that member''s org>';
-- -- Expected: ERROR either way -- pre-existing RLS should already block
-- -- a non-owner/admin UPDATE, and this migration's trigger blocks it
-- -- unconditionally regardless of RLS configuration, as defense in depth.
-- ROLLBACK;
-- ============================================================================

-- ============================================================================
-- LEGACY-ROW COMPATIBILITY TESTS (manual, read-only unless noted)
-- ============================================================================
--
-- 1. Legacy approved/rejected rows still satisfy the new CHECK
--    constraints:
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status NOT IN ('pending','approved','rejected','dismissed','executable','executed');
--      -- Expected: 0 (must be 0 before VALIDATE CONSTRAINT will succeed).
--
-- 2. Legacy rows are NOT retroactively touched on decided_by/decided_at:
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_status IN ('approved','rejected') AND decided_by IS NULL
--        AND decision_audit_source = 'legacy_unattributed';
--      -- Expected: matches preflight query 2's count exactly.
--
-- 3. A legacy row's updated_at was NOT bumped by the backfill (confirms
--    the disable/enable trigger wrap worked):
--
--      SELECT count(*) FROM public.decision_ledger
--      WHERE decision_audit_source IN ('legacy_attributed','legacy_unattributed')
--        AND updated_at > '<migration start timestamp>';
--      -- Expected: 0.
--
-- 4. A legacy row can still have unrelated fields updated by an
--    owner/admin without being forced through any new RPC:
--
--      BEGIN;
--      UPDATE public.decision_ledger SET notes = 'legacy row, unrelated edit'
--      WHERE id = '<a real legacy_unattributed decision id>';
--      -- Expected: succeeds.
--      ROLLBACK;
-- ============================================================================
