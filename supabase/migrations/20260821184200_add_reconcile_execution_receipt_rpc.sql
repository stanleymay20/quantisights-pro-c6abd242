-- Atomic, governed reconciliation for uncertain outbound execution receipts.
--
-- This function never dispatches an external side effect. It only allows an
-- authenticated organization owner/admin to resolve an `uncertain` receipt
-- after reviewing evidence from the external system. Receipt update, execution
-- event, and audit record are committed in one database transaction.

CREATE OR REPLACE FUNCTION public.reconcile_execution_action_receipt(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_resolution text,
  p_note text,
  p_external_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_receipt public.execution_action_receipts%ROWTYPE;
  v_updated public.execution_action_receipts%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
  v_external_reference text := NULLIF(btrim(COALESCE(p_external_reference, '')), '');
  v_now timestamptz := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF p_resolution NOT IN ('succeeded', 'failed') THEN
    RAISE EXCEPTION 'resolution must be succeeded or failed' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_note) < 10 OR char_length(v_note) > 2000 THEN
    RAISE EXCEPTION 'reconciliation note must be between 10 and 2000 characters' USING ERRCODE = '22023';
  END IF;

  IF v_external_reference IS NOT NULL AND char_length(v_external_reference) > 500 THEN
    RAISE EXCEPTION 'external reference must be 500 characters or fewer' USING ERRCODE = '22023';
  END IF;

  SELECT om.role
  INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id
    AND om.user_id = v_user_id
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Owner or admin role required for execution reconciliation' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_receipt
  FROM public.execution_action_receipts
  WHERE id = p_receipt_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Execution receipt not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_receipt.status <> 'uncertain' THEN
    RAISE EXCEPTION 'Only uncertain execution receipts may be reconciled; current status is %', v_receipt.status
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.execution_action_receipts
  SET
    status = p_resolution,
    reconciled_at = v_now,
    reconciled_by = v_user_id,
    reconciliation_note = v_note,
    external_reference = v_external_reference,
    completed_at = v_now,
    error_message = CASE
      WHEN p_resolution = 'failed' THEN 'Resolved as failed through governed external reconciliation'
      ELSE NULL
    END,
    response_metadata = COALESCE(response_metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciliation', jsonb_build_object(
        'resolution', p_resolution,
        'reviewed_at', v_now,
        'reviewed_by', v_user_id,
        'external_reference', v_external_reference
      )
    )
  WHERE id = p_receipt_id
    AND organization_id = p_organization_id
    AND status = 'uncertain'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt changed while reconciliation was in progress' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.execution_events (
    execution_plan_id,
    organization_id,
    event_type,
    actor_id,
    metadata
  ) VALUES (
    v_updated.execution_plan_id,
    p_organization_id,
    'outbound_action_reconciled',
    v_user_id,
    jsonb_build_object(
      'receipt_id', v_updated.id,
      'action_type', v_updated.action_type,
      'previous_status', 'uncertain',
      'resolution', p_resolution,
      'external_reference', v_external_reference
    )
  );

  INSERT INTO public.audit_log (
    organization_id,
    actor_id,
    actor_type,
    action_type,
    resource_type,
    resource_id,
    payload
  ) VALUES (
    p_organization_id,
    v_user_id,
    'user',
    'outbound_execution_reconciled',
    'execution_action_receipt',
    v_updated.id,
    jsonb_build_object(
      'execution_plan_id', v_updated.execution_plan_id,
      'decision_id', v_updated.decision_id,
      'action_type', v_updated.action_type,
      'previous_status', 'uncertain',
      'resolution', p_resolution,
      'reconciliation_note', v_note,
      'external_reference', v_external_reference
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'receipt', to_jsonb(v_updated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) IS
  'Owner/admin-only atomic resolution of uncertain outbound execution receipts using reviewed external evidence; never re-dispatches the action.';
