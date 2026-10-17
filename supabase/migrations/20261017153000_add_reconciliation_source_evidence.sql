-- Quantivis 10/10 Tranche 4 — source-persisted reconciliation evidence.
--
-- Goals:
--   1. preserve the immutable provider observation from the original dispatch;
--   2. persist a separate, versioned SHA-256 reconciliation evidence envelope;
--   3. make the evidence independently verifiable from the tenant-scoped read RPC;
--   4. make the governed reconciliation fields immutable after reconciliation;
--   5. never dispatch or retry an external side effect from reconciliation.

ALTER TABLE public.execution_action_receipts
  ADD COLUMN IF NOT EXISTS reconciliation_evidence_version text,
  ADD COLUMN IF NOT EXISTS reconciliation_evidence_material text,
  ADD COLUMN IF NOT EXISTS reconciliation_evidence_digest text;

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_evidence_all_or_none;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_evidence_all_or_none
  CHECK (
    (reconciliation_evidence_version IS NULL
      AND reconciliation_evidence_material IS NULL
      AND reconciliation_evidence_digest IS NULL)
    OR
    (reconciliation_evidence_version IS NOT NULL
      AND reconciliation_evidence_material IS NOT NULL
      AND reconciliation_evidence_digest IS NOT NULL)
  );

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_evidence_version;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_evidence_version
  CHECK (reconciliation_evidence_version IS NULL OR reconciliation_evidence_version = 'v1');

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_evidence_digest_shape;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_evidence_digest_shape
  CHECK (
    reconciliation_evidence_digest IS NULL
    OR reconciliation_evidence_digest ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_evidence_material_length;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_evidence_material_length
  CHECK (
    reconciliation_evidence_material IS NULL
    OR char_length(reconciliation_evidence_material) <= 10000
  );

ALTER TABLE public.execution_action_receipts
  DROP CONSTRAINT IF EXISTS execution_action_receipts_reconciliation_evidence_requires_resolution;
ALTER TABLE public.execution_action_receipts
  ADD CONSTRAINT execution_action_receipts_reconciliation_evidence_requires_resolution
  CHECK (
    reconciliation_evidence_digest IS NULL
    OR (
      reconciled_at IS NOT NULL
      AND reconciled_by IS NOT NULL
      AND reconciliation_note IS NOT NULL
      AND status IN ('succeeded', 'failed')
    )
  );

COMMENT ON COLUMN public.execution_action_receipts.reconciliation_evidence_version IS
  'Version of the server-persisted reconciliation evidence envelope. Null for legacy/unreconciled receipts.';
COMMENT ON COLUMN public.execution_action_receipts.reconciliation_evidence_material IS
  'Exact immutable UTF-8 JSON material hashed for governed reconciliation evidence. Kept verbatim so independent verifiers hash the same bytes.';
COMMENT ON COLUMN public.execution_action_receipts.reconciliation_evidence_digest IS
  'Lowercase SHA-256 hex digest of reconciliation_evidence_material, persisted atomically with the governed resolution.';

-- Once source reconciliation evidence exists, the evidence envelope and the
-- receipt fields it attests are immutable. Compensation is modeled separately
-- and therefore never needs to rewrite the original receipt.
CREATE OR REPLACE FUNCTION public.protect_execution_reconciliation_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.reconciliation_evidence_digest IS NOT NULL AND (
    NEW.reconciliation_evidence_version IS DISTINCT FROM OLD.reconciliation_evidence_version
    OR NEW.reconciliation_evidence_material IS DISTINCT FROM OLD.reconciliation_evidence_material
    OR NEW.reconciliation_evidence_digest IS DISTINCT FROM OLD.reconciliation_evidence_digest
    OR NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at
    OR NEW.reconciled_by IS DISTINCT FROM OLD.reconciled_by
    OR NEW.reconciliation_note IS DISTINCT FROM OLD.reconciliation_note
    OR NEW.external_reference IS DISTINCT FROM OLD.external_reference
    OR NEW.status IS DISTINCT FROM OLD.status
  ) THEN
    RAISE EXCEPTION 'Reconciled execution evidence is immutable once persisted'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_execution_reconciliation_evidence
  ON public.execution_action_receipts;
CREATE TRIGGER protect_execution_reconciliation_evidence
BEFORE UPDATE ON public.execution_action_receipts
FOR EACH ROW
EXECUTE FUNCTION public.protect_execution_reconciliation_evidence();

-- Replace the existing owner/admin reconciliation RPC with the same governed
-- state transition plus source-persisted evidence. pgcrypto was enabled by an
-- earlier migration; resolve its actual extension schema from pg_catalog so
-- this SECURITY DEFINER function does not depend on a mutable search_path.
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
  v_pgcrypto_schema text;
  v_provider_evidence_digest text;
  v_reconciliation_material text;
  v_reconciliation_digest text;
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

  IF v_receipt.reconciliation_evidence_digest IS NOT NULL THEN
    RAISE EXCEPTION 'Execution receipt already carries reconciliation evidence'
      USING ERRCODE = '23514';
  END IF;

  SELECT n.nspname
  INTO v_pgcrypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto'
  LIMIT 1;

  IF v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'pgcrypto extension is required for reconciliation evidence hashing'
      USING ERRCODE = '55000';
  END IF;

  v_provider_evidence_digest := NULLIF(
    COALESCE(v_receipt.response_metadata, '{}'::jsonb)->>'provider_evidence_digest',
    ''
  );

  -- Persist the exact JSON text that is hashed. Independent verifiers should
  -- hash this string verbatim, then parse it and cross-check every field against
  -- the receipt projection. This avoids cross-runtime JSON canonicalization drift.
  v_reconciliation_material := jsonb_build_object(
    'version', 'v1',
    'receipt_id', v_receipt.id,
    'provider_evidence_digest', v_provider_evidence_digest,
    'reconciled_at', v_now,
    'reconciled_by', v_user_id,
    'resolution', p_resolution,
    'reconciliation_note', v_note,
    'external_reference', v_external_reference
  )::text;

  EXECUTE format(
    'SELECT pg_catalog.encode(%I.digest($1, ''sha256''), ''hex'')',
    v_pgcrypto_schema
  )
  INTO v_reconciliation_digest
  USING v_reconciliation_material;

  IF v_reconciliation_digest IS NULL OR v_reconciliation_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Unable to derive reconciliation evidence digest'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.execution_action_receipts
  SET
    status = p_resolution,
    reconciled_at = v_now,
    reconciled_by = v_user_id,
    reconciliation_note = v_note,
    external_reference = v_external_reference,
    reconciliation_evidence_version = 'v1',
    reconciliation_evidence_material = v_reconciliation_material,
    reconciliation_evidence_digest = v_reconciliation_digest,
    completed_at = v_now,
    error_message = CASE
      WHEN p_resolution = 'failed' THEN 'Resolved as failed through governed external reconciliation'
      ELSE NULL
    END,
    response_metadata = COALESCE(response_metadata, '{}'::jsonb) || jsonb_build_object(
      'reconciliation', jsonb_build_object(
        'version', 'v1',
        'resolution', p_resolution,
        'reviewed_at', v_now,
        'reviewed_by', v_user_id,
        'external_reference', v_external_reference,
        'evidence_digest', v_reconciliation_digest
      )
    )
  WHERE id = p_receipt_id
    AND organization_id = p_organization_id
    AND status = 'uncertain'
    AND reconciliation_evidence_digest IS NULL
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
      'external_reference', v_external_reference,
      'reconciliation_evidence_version', 'v1',
      'reconciliation_evidence_digest', v_reconciliation_digest
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
      'external_reference', v_external_reference,
      'provider_evidence_digest', v_provider_evidence_digest,
      'reconciliation_evidence_version', 'v1',
      'reconciliation_evidence_digest', v_reconciliation_digest
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'receipt', to_jsonb(v_updated)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.reconcile_execution_action_receipt(uuid, uuid, text, text, text) IS
  'Owner/admin-only atomic resolution of uncertain outbound execution receipts with source-persisted SHA-256 evidence; never re-dispatches the action.';

-- Extend the existing tenant-scoped read model with the source evidence needed
-- for independent verification. The underlying table remains service-role-only.
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
        'retry_exhausted_at', r.retry_exhausted_at,
        'reconciliation_evidence_version', r.reconciliation_evidence_version,
        'reconciliation_evidence_material', r.reconciliation_evidence_material,
        'reconciliation_evidence_digest', r.reconciliation_evidence_digest
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

REVOKE ALL ON FUNCTION public.list_execution_action_receipts(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_execution_action_receipts(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.list_execution_action_receipts(uuid, uuid) IS
  'Authenticated organization-member read model for bounded execution receipt and source reconciliation evidence; excludes idempotency keys and request fingerprints.';
