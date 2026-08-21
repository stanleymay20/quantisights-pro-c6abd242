-- Tenant-scoped read model for governed outbound execution receipts.
--
-- Receipt rows remain service-role-only under RLS. This RPC exposes only the
-- operational fields needed by the execution timeline after verifying the
-- authenticated caller belongs to the requested organization.

CREATE OR REPLACE FUNCTION public.list_execution_action_receipts(
  p_organization_id uuid,
  p_decision_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_member boolean;
  v_receipts jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = v_user_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'Organization membership required' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'execution_plan_id', r.execution_plan_id,
        'decision_id', r.decision_id,
        'action_type', r.action_type,
        'status', r.status,
        'response_status', r.response_status,
        'response_metadata', r.response_metadata,
        'error_message', r.error_message,
        'created_at', r.created_at,
        'completed_at', r.completed_at,
        'reconciled_at', r.reconciled_at,
        'reconciled_by', r.reconciled_by,
        'reconciliation_note', r.reconciliation_note,
        'external_reference', r.external_reference
      )
      ORDER BY r.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_receipts
  FROM public.execution_action_receipts r
  WHERE r.organization_id = p_organization_id
    AND r.decision_id = p_decision_id;

  RETURN v_receipts;
END;
$$;

REVOKE ALL ON FUNCTION public.list_execution_action_receipts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.list_execution_action_receipts(uuid, uuid) IS
  'Authenticated organization-member read model for execution receipts; excludes idempotency keys and request fingerprints.';
