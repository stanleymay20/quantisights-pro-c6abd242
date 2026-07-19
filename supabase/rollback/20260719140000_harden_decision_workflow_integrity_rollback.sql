-- ROLLBACK for 20260719140000_harden_decision_workflow_integrity.sql
--
-- *** DELIBERATELY NOT IN supabase/migrations/ ***
-- Lives outside that directory so it is never auto-applied -- must be run
-- manually, deliberately.
--
-- Scope: removes ONLY the objects this migration introduced --
-- create_predecided_decision(), enforce_decision_status_trusted_transition()
-- and its trigger, the decision_audit_source column and all three new
-- CHECK constraints -- and restores approve_decision()/reject_decision()
-- to their exact pre-this-migration bodies (as deployed by
-- supabase/migrations/20260713053125_8fdc265c-9fc4-41eb-99d9-b35e8615fc64.sql).
-- Does NOT touch enforce_decision_approval_gate(), the pre-existing RLS
-- policies, or any pre-existing trigger -- this migration never modified
-- any of them, so there is nothing to revert there.
--
-- *** IRREVERSIBLE / DATA IMPLICATIONS ***
-- 1. decision_audit_source is dropped, discarding the 'legacy'/'rpc'
--    provenance label. Non-destructive to any OTHER column. Fully
--    re-derivable at any time: every row is 'legacy' unless it was
--    created by approve_decision/reject_decision/create_predecided_decision
--    after this migration was applied, which is determinable from
--    audit_log's decision_approved/decision_rejected/
--    decision_created_predecided entries plus decided_at, if that
--    reconstruction is ever needed again.
-- 2. Any row created via create_predecided_decision() while this
--    migration was live keeps its data (decision_ledger row + audit_log
--    entry) -- this rollback drops the function, it does not delete rows
--    the function created. Those rows simply lose their
--    decision_audit_source label along with every other row's.
-- 3. Rolling back after this migration has been live for a while means
--    any decision approved/rejected/created-pre-decided in the interim
--    went through a trusted, audited path (by construction -- direct
--    writes were blocked) -- rolling back removes the enforcement but
--    does not un-approve/un-reject/un-create anything.
-- 4. If any Edge Function was updated to call create_predecided_decision()
--    (per the design report's compatibility plan) before this rollback
--    runs, that Edge Function will start failing immediately after
--    rollback (function no longer exists) -- revert that application-code
--    change FIRST, exactly as the forward migration's own compatibility
--    plan requires doing the reverse before applying it.

BEGIN;

-- ---- Step 5 reversal: restore approve_decision/reject_decision to their
-- exact pre-this-migration bodies ----

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

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid()
  WHERE id = _decision_id;

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

  UPDATE public.decision_ledger
  SET decision_status = 'rejected',
      decided_at = v_now,
      decided_by = auth.uid(),
      notes = CASE WHEN _reason IS NULL THEN notes
                   ELSE COALESCE(v_existing_notes || E'\n', '') || 'Rejected in executive review: ' || _reason END
  WHERE id = _decision_id;

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

-- ---- Step 4 reversal: drop the trusted-insert RPC ----

DROP FUNCTION IF EXISTS public.create_predecided_decision(uuid, text, text, text, text, text, uuid, numeric);

-- ---- Step 3 reversal: drop the new trigger and its function ----

DROP TRIGGER IF EXISTS trg_enforce_decision_status_trusted_transition ON public.decision_ledger;
DROP FUNCTION IF EXISTS public.enforce_decision_status_trusted_transition();

-- ---- Step 2 reversal: drop the legacy-provenance column ----

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_audit_source_check;
ALTER TABLE public.decision_ledger DROP COLUMN IF EXISTS decision_audit_source;

-- ---- Step 1 reversal: drop the controlled-value constraints ----

ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_decision_status_check;
ALTER TABLE public.decision_ledger DROP CONSTRAINT IF EXISTS decision_ledger_execution_status_check;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Post-rollback verification:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.decision_ledger'::regclass
--   AND conname IN ('decision_ledger_decision_status_check','decision_ledger_execution_status_check','decision_ledger_audit_source_check');
--   -- Expected: zero rows.
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.decision_ledger'::regclass
--   AND tgname = 'trg_enforce_decision_status_trusted_transition';
--   -- Expected: zero rows.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'decision_ledger' AND column_name = 'decision_audit_source';
--   -- Expected: zero rows.
--   SELECT proname FROM pg_proc WHERE proname = 'create_predecided_decision';
--   -- Expected: zero rows.
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal;
--   -- Expected: update_decision_ledger_updated_at,
--   -- trg_intel_writeback_on_decision_resolved,
--   -- trg_enforce_decision_approval_gate -- all tgenabled = 'O', all
--   -- unmodified by this rollback (they were never modified by the
--   -- forward migration either).
