-- Manual outcome feedback is consequential evidence: the decision ledger and
-- AICIS calibration row must commit together or not at all. An Edge Function
-- crash/write failure must never leave `outcome_measured_at` claiming that an
-- outcome was recorded while the calibration evidence is absent.

CREATE OR REPLACE FUNCTION public.record_manual_aicis_outcome(
  _organization_id uuid,
  _decision_id uuid,
  _prediction_external_id text,
  _country_iso3 text,
  _domain text,
  _predicted_value numeric,
  _risk_event_actual numeric,
  _error_margin numeric,
  _brier_score numeric,
  _business_actual_value numeric,
  _evaluated_at timestamptz,
  _actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _outcome_id uuid;
  _updated integer;
BEGIN
  IF _organization_id IS NULL OR _decision_id IS NULL OR _prediction_external_id IS NULL THEN
    RAISE EXCEPTION 'organization, decision and prediction identity are required';
  END IF;

  IF _risk_event_actual NOT IN (0, 1) THEN
    RAISE EXCEPTION 'risk event actual must be binary';
  END IF;

  IF _predicted_value IS NOT NULL AND (_predicted_value < 0 OR _predicted_value > 1) THEN
    RAISE EXCEPTION 'predicted probability must be between 0 and 1';
  END IF;

  UPDATE public.decision_ledger
  SET
    outcome_measured_at = _evaluated_at,
    actual_value = CASE
      WHEN _business_actual_value IS NULL THEN actual_value
      ELSE _business_actual_value
    END
  WHERE id = _decision_id
    AND organization_id = _organization_id;

  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated <> 1 THEN
    RAISE EXCEPTION 'decision is not present in the requested organization';
  END IF;

  INSERT INTO public.aicis_outcomes (
    organization_id,
    external_id,
    prediction_external_id,
    country_iso3,
    domain,
    predicted_value,
    actual_value,
    error_margin,
    brier_score,
    evaluated_at
  ) VALUES (
    _organization_id,
    'decision:' || _decision_id::text,
    _prediction_external_id,
    _country_iso3,
    _domain,
    _predicted_value,
    _risk_event_actual,
    _error_margin,
    _brier_score,
    _evaluated_at
  )
  ON CONFLICT (organization_id, external_id)
  DO UPDATE SET
    prediction_external_id = EXCLUDED.prediction_external_id,
    country_iso3 = EXCLUDED.country_iso3,
    domain = EXCLUDED.domain,
    predicted_value = EXCLUDED.predicted_value,
    actual_value = EXCLUDED.actual_value,
    error_margin = EXCLUDED.error_margin,
    brier_score = EXCLUDED.brier_score,
    evaluated_at = EXCLUDED.evaluated_at
  RETURNING id INTO _outcome_id;

  INSERT INTO public.audit_log (
    organization_id,
    actor_id,
    actor_type,
    action_type,
    resource_type,
    resource_id,
    payload
  ) VALUES (
    _organization_id,
    _actor_id,
    CASE WHEN _actor_id IS NULL THEN 'system' ELSE 'user' END,
    'manual_aicis_outcome_recorded',
    'decision',
    _decision_id::text,
    jsonb_build_object(
      'outcome_id', _outcome_id,
      'calibration_target', 'risk_event_binary',
      'evaluated_at', _evaluated_at
    )
  );

  RETURN _outcome_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_manual_aicis_outcome(
  uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_manual_aicis_outcome(
  uuid, uuid, text, text, text, numeric, numeric, numeric, numeric, numeric, timestamptz, uuid
) TO service_role;
