-- Atomic dashboard decision creation + approval.
--
-- The dashboard previously inserted a decision already marked "approved" from
-- the browser, then created the execution plan, outcome contract and audit trail
-- in separate requests. A later failure could therefore leave an approved
-- decision without its required lifecycle records.
--
-- This RPC keeps the complete state transition in one PostgreSQL transaction:
--   pending decision insert -> existing approve_decision() -> source resolution.
-- If any required step raises, PostgreSQL rolls back the whole operation.

CREATE OR REPLACE FUNCTION public.create_and_approve_decision(
  _organization_id uuid,
  _recommended_action text,
  _chosen_action text DEFAULT NULL,
  _confidence_at_decision numeric DEFAULT NULL,
  _raw_confidence numeric DEFAULT NULL,
  _capped_confidence numeric DEFAULT NULL,
  _confidence_cap_reason text DEFAULT NULL,
  _decision_type text DEFAULT 'strategic',
  _decision_context_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL,
  _dataset_id uuid DEFAULT NULL,
  _expected_metric text DEFAULT NULL,
  _evaluation_window_days int DEFAULT 30,
  _suggested_owner text DEFAULT NULL,
  _source_type text DEFAULT NULL,
  _source_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_decision_id uuid;
  v_approval jsonb;
  v_source_rows integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required' USING ERRCODE = 'not_null_violation';
  END IF;

  IF NULLIF(btrim(_recommended_action), '') IS NULL THEN
    RAISE EXCEPTION 'recommended_action required' USING ERRCODE = 'not_null_violation';
  END IF;

  IF public.get_user_org_role(v_user_id, _organization_id) NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'only organization owners/admins may create approved decisions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _evaluation_window_days < 1 OR _evaluation_window_days > 3650 THEN
    RAISE EXCEPTION 'evaluation_window_days must be between 1 and 3650'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _decision_context_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.decision_contexts dc
    WHERE dc.id = _decision_context_id
      AND dc.organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'decision_context_id does not belong to organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _dataset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.datasets ds
    WHERE ds.id = _dataset_id
      AND ds.organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'dataset_id does not belong to organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF _source_type IS NOT NULL AND _source_type NOT IN ('advisory', 'signal') THEN
    RAISE EXCEPTION 'source_type must be advisory, signal, or null'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (_source_type IS NULL) <> (_source_id IS NULL) THEN
    RAISE EXCEPTION 'source_type and source_id must be supplied together'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Insert as pending. approve_decision() is the only operation allowed to
  -- create the final approval state and its execution/outcome/audit records.
  INSERT INTO public.decision_ledger (
    organization_id,
    recommended_action,
    chosen_action,
    decision_status,
    confidence_at_decision,
    raw_confidence,
    capped_confidence,
    confidence_cap_reason,
    decision_type,
    decision_context_id,
    notes
  )
  VALUES (
    _organization_id,
    btrim(_recommended_action),
    COALESCE(NULLIF(btrim(_chosen_action), ''), btrim(_recommended_action)),
    'pending',
    _confidence_at_decision,
    _raw_confidence,
    _capped_confidence,
    _confidence_cap_reason,
    COALESCE(NULLIF(btrim(_decision_type), ''), 'strategic'),
    _decision_context_id,
    _notes
  )
  RETURNING id INTO v_decision_id;

  -- Nested function execution shares this transaction. Any failure here rolls
  -- back the decision insert above and every change below.
  v_approval := public.approve_decision(
    v_decision_id,
    _dataset_id,
    _expected_metric,
    _evaluation_window_days,
    _suggested_owner
  );

  -- Resolve the originating queue item only after approval succeeds. This is
  -- in the same DB transaction, so a missing/cross-tenant source also rolls the
  -- approval back instead of producing an orphaned approved decision.
  IF _source_type = 'advisory' THEN
    UPDATE public.advisory_instances
    SET status = 'accepted',
        updated_at = now()
    WHERE id = _source_id
      AND organization_id = _organization_id;
    GET DIAGNOSTICS v_source_rows = ROW_COUNT;
  ELSIF _source_type = 'signal' THEN
    UPDATE public.insights
    SET is_read = true
    WHERE id = _source_id
      AND organization_id = _organization_id;
    GET DIAGNOSTICS v_source_rows = ROW_COUNT;
  END IF;

  IF _source_type IS NOT NULL AND v_source_rows <> 1 THEN
    RAISE EXCEPTION 'source item not found in organization'
      USING ERRCODE = 'no_data_found';
  END IF;

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'decision_status', 'approved',
    'approval', v_approval,
    'source_type', _source_type,
    'source_id', _source_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_and_approve_decision(
  uuid, text, text, numeric, numeric, numeric, text, text, uuid, text,
  uuid, text, int, text, text, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_and_approve_decision(
  uuid, text, text, numeric, numeric, numeric, text, text, uuid, text,
  uuid, text, int, text, text, uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
