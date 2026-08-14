-- Repair the closed-loop outcome direction contract.
--
-- Historical approval paths created every decision_outcome with
-- expected_direction='increase'. That makes decrease-is-good KPIs (churn, cost,
-- risk, mortality, downtime, emissions, etc.) learn the opposite lesson.
--
-- This migration:
--   1. introduces one deterministic metric-direction resolver;
--   2. repairs strongly identifiable legacy lower-is-better outcomes;
--   3. reissues approve_decision so new outcome rows use the resolved direction;
--   4. keeps the existing RPC signature unchanged for client compatibility.

CREATE OR REPLACE FUNCTION public.infer_expected_direction(_metric text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN lower(COALESCE(_metric, '')) ~
      '(churn|cost|expense|spend|burn|risk|mortality|readmission|incident|injury|fraud|downtime|outage|defect|error|failure|emission|carbon|latency|cycle[ _-]?time|lead[ _-]?time|response[ _-]?time|vacancy|attrition|complaint|return[ _-]?rate|loss|variance|volatility)'
      THEN 'decrease'
    ELSE 'increase'
  END;
$$;

REVOKE ALL ON FUNCTION public.infer_expected_direction(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.infer_expected_direction(text) TO authenticated, service_role;

-- Repair legacy rows only where the metric name strongly identifies a
-- lower-is-better KPI. The repair is documented on the row for auditability.
UPDATE public.decision_outcomes
SET expected_direction = 'decrease',
    updated_at = now(),
    notes = concat_ws(
      E'\n',
      NULLIF(notes, ''),
      '[direction repair 2026-08-14] expected_direction inferred as decrease from metric semantics'
    )
WHERE expected_direction = 'increase'
  AND public.infer_expected_direction(expected_metric) = 'decrease';

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
SET search_path = pg_catalog, public
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
  v_resolved_metric text;
  v_expected_direction text;
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
    RAISE EXCEPTION 'only organization owners/admins may approve decisions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'decision % is % and cannot be approved (must be pending)', _decision_id, v_status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.decision_ledger
  SET decision_status = 'approved', decided_at = v_now, decided_by = auth.uid()
  WHERE id = _decision_id;

  INSERT INTO public.execution_plans (
    decision_id, organization_id, action_title, action_description, owner_user_id,
    priority, status, trigger_type, trigger_config
  )
  VALUES (
    _decision_id, v_org_id, left(v_recommended_action, 200),
    'Execution plan for: ' || v_recommended_action,
    auth.uid(), 'medium', 'pending', 'manual',
    jsonb_build_object(
      'suggested_owner', _suggested_owner,
      'evaluation_window_days', _evaluation_window_days
    )
  )
  RETURNING id INTO v_plan_id;

  v_eval := public.check_decision_evaluability(v_org_id, _dataset_id, _expected_metric);

  IF (v_eval ->> 'status') <> 'NOT_MEASURABLE' THEN
    v_resolved_metric := COALESCE(
      v_eval ->> 'resolved_metric',
      _expected_metric,
      v_decision_type,
      'unknown'
    );
    v_expected_direction := public.infer_expected_direction(v_resolved_metric);

    INSERT INTO public.decision_outcomes (
      decision_id,
      organization_id,
      dataset_id,
      expected_metric,
      expected_direction,
      evaluation_window_days
    )
    VALUES (
      _decision_id,
      v_org_id,
      COALESCE((v_eval ->> 'resolved_dataset_id')::uuid, _dataset_id),
      v_resolved_metric,
      v_expected_direction,
      _evaluation_window_days
    )
    RETURNING id INTO v_outcome_id;
  END IF;

  INSERT INTO public.audit_log (
    organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload
  )
  VALUES (
    v_org_id,
    auth.uid(),
    'user',
    'decision_approved',
    'decision',
    _decision_id::text,
    jsonb_build_object(
      'recommended_action', v_recommended_action,
      'confidence_at_decision', v_confidence,
      'execution_plan_id', v_plan_id,
      'decision_outcome_id', v_outcome_id,
      'expected_metric', v_resolved_metric,
      'expected_direction', v_expected_direction
    )
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'decision_id', _decision_id,
    'decision_status', 'approved',
    'decided_at', v_now,
    'audit_id', v_audit_id,
    'execution_plan_id', v_plan_id,
    'decision_outcome_id', v_outcome_id,
    'expected_direction', v_expected_direction,
    'evaluability', v_eval
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO service_role;

NOTIFY pgrst, 'reload schema';
