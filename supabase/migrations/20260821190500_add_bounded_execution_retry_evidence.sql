-- Bounded retry evidence for governed outbound execution.
--
-- Only explicit, definitive rate-limit responses are eligible for automatic
-- retry. Ambiguous transport/server outcomes remain `uncertain` and require
-- reconciliation. These columns make every bounded attempt and exhaustion
-- visible without exposing idempotency keys to clients.

ALTER TABLE public.execution_action_receipts
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_retry_reason text,
  ADD COLUMN IF NOT EXISTS retry_exhausted_at timestamptz;

UPDATE public.execution_action_receipts
SET attempt_count = 1
WHERE attempt_count = 0
  AND status IN ('succeeded', 'failed', 'uncertain');

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_attempt_count_check,
  DROP CONSTRAINT IF EXISTS execution_action_receipts_max_attempts_check,
  ADD CONSTRAINT execution_action_receipts_max_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 5),
  ADD CONSTRAINT execution_action_receipts_attempt_count_check
    CHECK (attempt_count BETWEEN 0 AND max_attempts);

COMMENT ON COLUMN public.execution_action_receipts.attempt_count IS
  'Number of actual outbound dispatch attempts made for this execution intent.';
COMMENT ON COLUMN public.execution_action_receipts.max_attempts IS
  'Hard cap on outbound attempts for this receipt; production policy defaults to 3.';
COMMENT ON COLUMN public.execution_action_receipts.last_retry_reason IS
  'Machine-readable reason for the most recent safe retry decision, e.g. http_429.';
COMMENT ON COLUMN public.execution_action_receipts.retry_exhausted_at IS
  'Timestamp when the bounded retry budget was exhausted without a successful response.';

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
        'external_reference', r.external_reference,
        'attempt_count', r.attempt_count,
        'max_attempts', r.max_attempts,
        'last_attempt_at', r.last_attempt_at,
        'last_retry_reason', r.last_retry_reason,
        'retry_exhausted_at', r.retry_exhausted_at
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
