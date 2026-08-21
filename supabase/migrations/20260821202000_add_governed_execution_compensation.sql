-- Governed compensation semantics for reversible outbound execution.
--
-- Compensation is not rollback: the original succeeded receipt remains immutable.
-- This migration records an explicit, reviewed request to compensate a proven
-- successful action. It does not dispatch any external side effect.

CREATE TABLE IF NOT EXISTS public.execution_compensation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  execution_plan_id uuid NOT NULL REFERENCES public.execution_plans(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.decision_ledger(id) ON DELETE CASCADE,
  original_receipt_id uuid NOT NULL REFERENCES public.execution_action_receipts(id) ON DELETE RESTRICT,
  compensation_type text NOT NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'executing', 'succeeded', 'failed', 'uncertain')),
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  completed_at timestamptz,
  external_reference text,
  CONSTRAINT execution_compensation_reason_length CHECK (char_length(reason) BETWEEN 10 AND 2000),
  CONSTRAINT execution_compensation_review_note_length CHECK (review_note IS NULL OR char_length(review_note) BETWEEN 10 AND 2000),
  CONSTRAINT execution_compensation_external_reference_length CHECK (external_reference IS NULL OR char_length(external_reference) <= 500),
  CONSTRAINT execution_compensation_original_unique UNIQUE (organization_id, original_receipt_id)
);

CREATE INDEX IF NOT EXISTS execution_compensation_decision_idx
  ON public.execution_compensation_requests (organization_id, decision_id, requested_at DESC);

ALTER TABLE public.execution_compensation_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.request_execution_compensation(
  p_organization_id uuid,
  p_receipt_id uuid,
  p_compensation_type text,
  p_reason text,
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
  IF v_receipt.action_type NOT IN ('trigger_webhook') THEN
    RAISE EXCEPTION 'Action type % has no governed compensation contract', v_receipt.action_type USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.execution_compensation_requests (
    organization_id, execution_plan_id, decision_id, original_receipt_id,
    compensation_type, reason, evidence, requested_by
  ) VALUES (
    p_organization_id, v_receipt.execution_plan_id, v_receipt.decision_id, v_receipt.id,
    v_type, v_reason, COALESCE(p_evidence, '{}'::jsonb), v_user_id
  ) RETURNING * INTO v_request;

  INSERT INTO public.execution_events (execution_plan_id, organization_id, event_type, actor_id, metadata)
  VALUES (v_receipt.execution_plan_id, p_organization_id, 'compensation_requested', v_user_id,
    jsonb_build_object('compensation_request_id', v_request.id, 'original_receipt_id', v_receipt.id,
      'original_action_type', v_receipt.action_type, 'compensation_type', v_type));

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (p_organization_id, v_user_id, 'user', 'execution_compensation_requested',
    'execution_compensation_request', v_request.id,
    jsonb_build_object('original_receipt_id', v_receipt.id, 'execution_plan_id', v_receipt.execution_plan_id,
      'decision_id', v_receipt.decision_id, 'compensation_type', v_type, 'reason', v_reason));

  RETURN jsonb_build_object('success', true, 'request', to_jsonb(v_request));
END;
$$;

CREATE OR REPLACE FUNCTION public.review_execution_compensation(
  p_organization_id uuid,
  p_request_id uuid,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_request public.execution_compensation_requests%ROWTYPE;
  v_updated public.execution_compensation_requests%ROWTYPE;
  v_note text := btrim(COALESCE(p_note, ''));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000'; END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = '22023'; END IF;
  IF char_length(v_note) < 10 OR char_length(v_note) > 2000 THEN RAISE EXCEPTION 'review note must be between 10 and 2000 characters' USING ERRCODE = '22023'; END IF;

  SELECT om.role INTO v_role FROM public.organization_members om
  WHERE om.organization_id = p_organization_id AND om.user_id = v_user_id LIMIT 1;
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Owner or admin role required for compensation review' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_request FROM public.execution_compensation_requests
  WHERE id = p_request_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compensation request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_request.status <> 'requested' THEN RAISE EXCEPTION 'Only requested compensation may be reviewed; current status is %', v_request.status USING ERRCODE = '23514'; END IF;
  IF v_request.requested_by = v_user_id THEN RAISE EXCEPTION 'Compensation requires independent review by a different owner/admin' USING ERRCODE = '42501'; END IF;

  UPDATE public.execution_compensation_requests
  SET status = p_decision, reviewed_by = v_user_id, reviewed_at = now(), review_note = v_note,
      completed_at = CASE WHEN p_decision = 'rejected' THEN now() ELSE NULL END
  WHERE id = p_request_id AND organization_id = p_organization_id AND status = 'requested'
  RETURNING * INTO v_updated;

  INSERT INTO public.execution_events (execution_plan_id, organization_id, event_type, actor_id, metadata)
  VALUES (v_updated.execution_plan_id, p_organization_id,
    CASE WHEN p_decision = 'approved' THEN 'compensation_approved' ELSE 'compensation_rejected' END,
    v_user_id, jsonb_build_object('compensation_request_id', v_updated.id,
      'original_receipt_id', v_updated.original_receipt_id, 'review_note', v_note));

  INSERT INTO public.audit_log (organization_id, actor_id, actor_type, action_type, resource_type, resource_id, payload)
  VALUES (p_organization_id, v_user_id, 'user', 'execution_compensation_' || p_decision,
    'execution_compensation_request', v_updated.id,
    jsonb_build_object('original_receipt_id', v_updated.original_receipt_id, 'review_note', v_note,
      'requested_by', v_updated.requested_by, 'reviewed_by', v_user_id));

  RETURN jsonb_build_object('success', true, 'request', to_jsonb(v_updated));
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
    'id', c.id, 'execution_plan_id', c.execution_plan_id, 'decision_id', c.decision_id,
    'original_receipt_id', c.original_receipt_id, 'compensation_type', c.compensation_type,
    'status', c.status, 'reason', c.reason, 'evidence', c.evidence,
    'requested_by', c.requested_by, 'requested_at', c.requested_at,
    'reviewed_by', c.reviewed_by, 'reviewed_at', c.reviewed_at,
    'review_note', c.review_note, 'completed_at', c.completed_at,
    'external_reference', c.external_reference
  ) ORDER BY c.requested_at ASC), '[]'::jsonb)
  INTO v_requests
  FROM public.execution_compensation_requests c
  WHERE c.organization_id = p_organization_id AND c.decision_id = p_decision_id;
  RETURN v_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_execution_compensation_requests(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_execution_compensation_requests(uuid, uuid) TO authenticated, service_role;

COMMENT ON TABLE public.execution_compensation_requests IS
  'Governed requests to compensate proven successful reversible actions. Original execution receipts remain immutable.';
COMMENT ON FUNCTION public.request_execution_compensation(uuid, uuid, text, text, jsonb) IS
  'Owner/admin request for compensation of a proven successful action; records intent only and never dispatches externally.';
COMMENT ON FUNCTION public.review_execution_compensation(uuid, uuid, text, text) IS
  'Independent owner/admin approval or rejection of a compensation request; never dispatches externally.';
