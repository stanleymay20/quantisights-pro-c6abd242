-- ============================================================
-- P0 release-blocker fix: atomic decision approval/rejection.
--
-- Problem (verified by direct source inspection, not assumption):
--   1. src/pages/DecisionReview.tsx and src/pages/DecisionLedger.tsx both
--      write `decision_ledger.decision_status = 'approved'` directly from
--      the browser, then separately call onDecisionApproved(...), whose
--      first step (writeAuditLog -> supabase.from("audit_log").insert(...))
--      is UNCONDITIONALLY REJECTED by RLS: "Deny user inserts on audit_log"
--      (WITH CHECK (false), authenticated) from migration
--      20260303152450_77028c98-4660-40c2-89ea-3e1e04d17afa.sql. The error
--      is caught and swallowed (writeAuditLog's try/catch, plus a second
--      `.catch(() => {})` at the call site), so the approval write already
--      committed in decision_ledger is never rolled back. Audit creation,
--      execution-plan creation, and outcome creation are three separate,
--      independent network round-trips from the browser with no shared
--      transaction boundary at all.
--   2. public.enforce_decision_approval_gate() (added in
--      20260530194704_58454ed6-5939-4066-9fdc-287e31b7fc5e.sql) reads
--      NEW.status / OLD.status, but decision_ledger has no `status` column
--      — only `decision_status` (see the original CREATE TABLE in
--      20260225182540_ca47ff2f-9035-4106-b041-d8447c5c4a06.sql). Every
--      UPDATE of decision_ledger fires this trigger, which evaluates that
--      broken field reference as its very first statement.
--
-- Fix:
--   1. Correct the trigger's column reference and add the missing
--      pending/approved/rejected state-machine guard (approved/rejected are
--      final; no re-approval; rejected cannot become approved).
--   2. Add public.approve_decision()/public.reject_decision(): SECURITY
--      DEFINER RPCs that perform the decision_ledger update, audit_log
--      insert, execution_plans insert, and (approval-gated) decision_outcomes
--      insert inside ONE function body — a single Postgres transaction, so
--      any failure rolls back every write the function attempted. Both
--      re-implement the exact authorization check the bypassed RLS policies
--      already express (owner/admin org role), and reuse the existing
--      public.check_decision_evaluability() RPC rather than re-implementing
--      evaluability scoring. No new audit system is introduced — this
--      writes to the same audit_log table via the same shape writeAuditLog
--      already used.
-- ============================================================

-- ---- 1. Fix the approval-gate trigger's column reference ----
CREATE OR REPLACE FUNCTION public.enforce_decision_approval_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unsatisfied_stages INT;
BEGIN
  -- decision_status is the real column (there is no `status` column on
  -- decision_ledger). approved/rejected are final: once set, no further
  -- decision_status TRANSITION is permitted — which also makes
  -- rejected->approved and approved->pending->approved impossible.
  -- Deliberately scoped to transitions only: updates to OTHER columns on an
  -- approved/rejected row (execution_status tracking, notes, outcome_delta,
  -- calibration fields) leave decision_status unchanged and must keep
  -- working. Re-approval through the sanctioned path is separately blocked
  -- by approve_decision()'s "must be pending" gate below.
  IF OLD.decision_status IN ('approved', 'rejected')
     AND NEW.decision_status IS DISTINCT FROM OLD.decision_status THEN
    RAISE EXCEPTION 'Decision % already has a final decision_status of %; it cannot transition to %',
      NEW.id, OLD.decision_status, NEW.decision_status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_status IS NOT DISTINCT FROM OLD.decision_status THEN
    RETURN NEW;
  END IF;

  IF NEW.decision_status = 'executed' AND COALESCE(OLD.decision_status, '') <> 'executable' THEN
    RAISE EXCEPTION 'Decision % cannot be marked executed without passing through executable state', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.decision_status = 'executable' AND COALESCE(NEW.required_approvals, 0) > 0 THEN
    SELECT count(*) INTO unsatisfied_stages
    FROM public.approval_chain_stages
    WHERE decision_id = NEW.id AND satisfied = false;

    IF unsatisfied_stages > 0 THEN
      RAISE EXCEPTION 'Decision % has % unsatisfied approval stage(s); cannot become executable', NEW.id, unsatisfied_stages
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- 2. Atomic approval RPC ----
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

  -- Row lock: serializes concurrent approve/reject attempts on the same
  -- decision so a duplicate approval is structurally impossible, not just
  -- unlikely.
  SELECT organization_id, decision_status, recommended_action, decision_type,
         COALESCE(capped_confidence, confidence_at_decision, raw_confidence, 50)
  INTO v_org_id, v_status, v_recommended_action, v_decision_type, v_confidence
  FROM public.decision_ledger
  WHERE id = _decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', _decision_id USING ERRCODE = 'no_data_found';
  END IF;

  -- Re-implements the same authorization boundary as the (bypassed, by
  -- virtue of SECURITY DEFINER) "Admins/owners can update decisions" RLS
  -- policy on decision_ledger — this function must not grant any caller
  -- more access than that policy already intended.
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

-- ---- 3. Atomic rejection RPC ----
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
