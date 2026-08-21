-- Freeze the exact compensating side-effect contract before independent review.
--
-- An approval must cover the destination and payload that will actually be used.
-- The contract becomes immutable because no client update policy or mutation RPC
-- is exposed after request creation.

ALTER TABLE public.execution_compensation_requests
  ADD COLUMN IF NOT EXISTS compensation_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.execution_compensation_requests
  DROP CONSTRAINT IF EXISTS execution_compensation_config_object_check;
ALTER TABLE public.execution_compensation_requests
  ADD CONSTRAINT execution_compensation_config_object_check
  CHECK (jsonb_typeof(compensation_config) = 'object');

DROP FUNCTION IF EXISTS public.request_execution_compensation(uuid, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.request_execution_compensation(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_compensation_type text,
  p_reason text,
  p_compensation_config jsonb,
  p_evidence jsonb DEFAULT '{}'::jsonb
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
  v_request public.execution_compensation_requests%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_type text := btrim(COALESCE(p_compensation_type, ''));
  v_config jsonb := COALESCE(p_compensation_config, '{}'::jsonb);
  v_url text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;
  IF char_length(v_reason) < 10 OR char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'compensation reason must be between 10 and 2000 characters' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_type) < 3 OR char_length(v_type) > 100 THEN
    RAISE EXCEPTION 'compensation type must be between 3 and 100 characters' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_config) <> 'object' THEN
    RAISE EXCEPTION 'compensation_config must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT om.role INTO v_role
  FROM public.organization_members om
  WHERE om.organization_id = p_organization_id AND om.user_id = v_user_id
  LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Owner or admin role required for compensation requests' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_receipt
  FROM public.execution_action_receipts
  WHERE id = p_receipt_id AND organization_id = p_organization_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Execution receipt not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_receipt.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Only proven successful receipts may enter compensation; current status is %', v_receipt.status USING ERRCODE = '23514';
  END IF;
  IF v_receipt.action_type <> 'trigger_webhook' THEN
    RAISE EXCEPTION 'Action type % has no governed compensation contract', v_receipt.action_type USING ERRCODE = '23514';
  END IF;
  IF v_type <> 'webhook' THEN
    RAISE EXCEPTION 'trigger_webhook compensation_type must be webhook' USING ERRCODE = '22023';
  END IF;

  v_url := btrim(COALESCE(v_config->>'webhook_url', ''));
  IF char_length(v_url) < 8 OR char_length(v_url) > 2048 OR left(lower(v_url), 8) <> 'https://' THEN
    RAISE EXCEPTION 'webhook compensation requires an HTTPS webhook_url' USING ERRCODE = '22023';
  END IF;
  IF NOT (v_config ? 'payload') OR jsonb_typeof(v_config->'payload') <> 'object' THEN
    RAISE EXCEPTION 'webhook compensation requires an object payload' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(v_config) > 65536 THEN
    RAISE EXCEPTION 'compensation_config exceeds 64 KiB' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.execution_compensation_requests (
    organization_id, execution_plan_id, decision_id, original_receipt_id,
    compensation_type, reason, compensation_config, evidence, requested_by
  ) VALUES (
    p_organization_id, v_receipt.execution_plan_id, v_receipt.decision_id, v_receipt.id,
    v_type, v_reason, v_config, COALESCE(p_evidence, '{}'::jsonb), v_user_id
  ) RETURNING * INTO v_request;

  INSERT INTO public.execution_events (execution_plan_id, organization_id, event_type, actor_id, metadata)
  VALUES (v_receipt.execution_plan_id, p_organization_id, 'compensation_requested', v_user_id,
    jsonb_build_object(
      'compensation_request_id', v_request.id,
      'original_receipt_id', v_receipt.id,
      'original_action_type', v_receipt.action_type,
      'compensation_type', v_type,
      'contract_frozen', true,
      'webhook_url', v_url
    ));

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (p_organization_id, v_user_id, 'user', 'execution_compensation_requested',
    'execution_compensation_request', v_request.id,
    jsonb_build_object(
      'original_receipt_id', v_receipt.id,
      'execution_plan_id', v_receipt.execution_plan_id,
      'decision_id', v_receipt.decision_id,
      'compensation_type', v_type,
      'reason', v_reason,
      'compensation_config', v_config
    ));

  RETURN jsonb_build_object('success', true, 'request', to_jsonb(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.list_execution_compensation_requests(
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
  v_requests jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = p_organization_id AND om.user_id = v_user_id) INTO v_is_member;
  IF NOT v_is_member THEN RAISE EXCEPTION 'Organization membership required' USING ERRCODE = '42501'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'execution_plan_id', c.execution_plan_id,
    'decision_id', c.decision_id,
    'original_receipt_id', c.original_receipt_id,
    'compensation_type', c.compensation_type,
    'status', c.status,
    'reason', c.reason,
    'compensation_config', c.compensation_config,
    'evidence', c.evidence,
    'requested_by', c.requested_by,
    'requested_at', c.requested_at,
    'reviewed_by', c.reviewed_by,
    'reviewed_at', c.reviewed_at,
    'review_note', c.review_note,
    'completed_at', c.completed_at,
    'external_reference', c.external_reference
  ) ORDER BY c.requested_at ASC), '[]'::jsonb)
  INTO v_requests
  FROM public.execution_compensation_requests c
  WHERE c.organization_id = p_organization_id AND c.decision_id = p_decision_id;
  RETURN v_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON COLUMN public.execution_compensation_requests.compensation_config IS
  'Immutable compensation destination/payload reviewed before approval. Runtime execution must use this exact contract.';
COMMENT ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb, jsonb) IS
  'Owner/admin request that freezes the exact compensation contract before independent review; never dispatches externally.';
