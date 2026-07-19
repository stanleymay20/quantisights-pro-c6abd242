-- ROLLBACK for 20260719130000_decision_ledger_transition_integrity.sql
--
-- *** DELIBERATELY NOT IN supabase/migrations/ ***
-- Lives outside that directory so it is never auto-applied -- must be run
-- manually, deliberately.
--
-- Effect: restores approve_decision()/reject_decision() to their exact
-- pre-this-migration bodies (as deployed by
-- supabase/migrations/20260713053125_8fdc265c-9fc4-41eb-99d9-b35e8615fc64.sql),
-- drops the new trigger/function, and drops the new constraints/column.
-- Does NOT touch enforce_decision_approval_gate() -- this migration
-- never modified it, so there is nothing to revert there.
--
-- *** DATA NOTE ***
-- decision_audit_source is dropped, discarding the legacy/rpc
-- classification. Non-destructive to any OTHER column -- the
-- classification is fully re-derivable at any time by re-running the
-- forward migration's Step 2 backfill logic, since it depends only on
-- decision_status and decided_by, both untouched by this rollback.
--
-- Rolling back after this migration has been live for a while means any
-- decision approved/rejected in the interim went through the RPC-only
-- path (by construction -- direct updates were blocked) -- rolling back
-- removes the enforcement but does not un-approve/un-reject anything.

BEGIN;

-- ---- Step 4 reversal: restore approve_decision/reject_decision to their
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

-- ---- Step 3 reversal: drop the new trigger and its function ----

DROP TRIGGER IF EXISTS trg_enforce_decision_status_trusted_transition ON public.decision_ledger;
DROP FUNCTION IF EXISTS public.enforce_decision_status_trusted_transition();

-- ---- Step 2 reversal: drop the legacy-annotation column ----

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
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.decision_ledger'::regclass AND NOT tgisinternal;
--   -- Expected: update_decision_ledger_updated_at and
--   -- trg_intel_writeback_on_decision_resolved and
--   -- trg_enforce_decision_approval_gate, all tgenabled = 'O'.
