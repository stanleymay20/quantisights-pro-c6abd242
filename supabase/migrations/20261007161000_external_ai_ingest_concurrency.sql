-- Close the concurrent-retry race around the two replay identities. Without
-- transaction-scoped advisory locks, two simultaneous first-seen requests can
-- both pass the pre-insert SELECTs and one would lose the unique-index race.
-- The losing transaction would roll back safely, but return a 500 instead of
-- the deterministic idempotent replay contract. Serialize both identities
-- before evaluating them.

CREATE OR REPLACE FUNCTION public.ingest_external_ai_decision(
  p_credential_id uuid,
  p_external_event_id text,
  p_occurred_at timestamptz,
  p_input_hash text,
  p_output_hash text,
  p_decision_descriptor jsonb,
  p_confidence numeric,
  p_human_oversight_state text,
  p_metadata jsonb,
  p_provenance jsonb,
  p_idempotency_key text,
  p_payload_hash text,
  p_protocol_version text
)
RETURNS TABLE (
  decision_ledger_id uuid,
  evidence_id uuid,
  idempotent_replay boolean,
  replay_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credential public.ai_system_credentials%ROWTYPE;
  v_system public.ai_systems%ROWTYPE;
  v_existing public.external_ai_decision_evidence%ROWTYPE;
  v_decision_id uuid;
  v_evidence_id uuid;
  v_recommended_action text;
BEGIN
  SELECT * INTO v_credential
  FROM public.ai_system_credentials
  WHERE id = p_credential_id
  FOR UPDATE;

  IF NOT FOUND OR v_credential.status <> 'active' THEN
    RAISE EXCEPTION 'CREDENTIAL_INACTIVE';
  END IF;
  IF v_credential.expires_at IS NOT NULL AND v_credential.expires_at <= now() THEN
    RAISE EXCEPTION 'CREDENTIAL_EXPIRED';
  END IF;

  SELECT * INTO v_system
  FROM public.ai_systems
  WHERE id = v_credential.ai_system_id
    AND organization_id = v_credential.organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_SYSTEM_NOT_FOUND';
  END IF;
  IF v_system.lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'AI_SYSTEM_INACTIVE';
  END IF;

  -- Lock order is always idempotency identity first, then external event.
  -- Hash collisions only serialize unrelated transactions; they cannot weaken
  -- correctness or tenant isolation.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'quantivis:external-ai:idem:' || v_system.organization_id::text || ':' ||
      v_system.id::text || ':' || p_idempotency_key,
      0
    )
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'quantivis:external-ai:event:' || v_system.organization_id::text || ':' ||
      v_system.id::text || ':' || p_external_event_id,
      0
    )
  );

  SELECT * INTO v_existing
  FROM public.external_ai_decision_evidence
  WHERE organization_id = v_system.organization_id
    AND ai_system_id = v_system.id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD';
    END IF;
    RETURN QUERY SELECT v_existing.decision_ledger_id, v_existing.id, true, 'idempotency_key'::text;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.external_ai_decision_evidence
  WHERE organization_id = v_system.organization_id
    AND ai_system_id = v_system.id
    AND external_event_id = p_external_event_id;

  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'EXTERNAL_EVENT_REUSE_WITH_DIFFERENT_PAYLOAD';
    END IF;
    RETURN QUERY SELECT v_existing.decision_ledger_id, v_existing.id, true, 'external_event_id'::text;
    RETURN;
  END IF;

  v_recommended_action := COALESCE(
    NULLIF(btrim(p_decision_descriptor->>'action'), ''),
    NULLIF(btrim(p_decision_descriptor->>'decision'), ''),
    NULLIF(btrim(p_decision_descriptor->>'result'), ''),
    'External AI decision'
  );

  INSERT INTO public.decision_ledger (
    organization_id,
    decision_type,
    recommended_action,
    decision_status,
    execution_status,
    confidence_at_decision,
    decided_by,
    notes
  ) VALUES (
    v_system.organization_id,
    'external_ai',
    v_recommended_action,
    'pending',
    'not_started',
    p_confidence,
    v_system.owner_user_id,
    'External AI decision ingested through the Quantivis evidence protocol.'
  )
  RETURNING id INTO v_decision_id;

  INSERT INTO public.external_ai_decision_evidence (
    organization_id,
    ai_system_id,
    credential_id,
    decision_ledger_id,
    system_name,
    provider,
    system_identifier,
    model_version,
    deployment_environment,
    external_event_id,
    occurred_at,
    input_hash,
    output_hash,
    decision_descriptor,
    confidence,
    human_oversight_state,
    metadata,
    provenance,
    idempotency_key,
    payload_hash,
    protocol_version
  ) VALUES (
    v_system.organization_id,
    v_system.id,
    v_credential.id,
    v_decision_id,
    v_system.name,
    v_system.provider,
    v_system.system_identifier,
    v_system.model_version,
    v_system.deployment_environment,
    p_external_event_id,
    p_occurred_at,
    p_input_hash,
    p_output_hash,
    p_decision_descriptor,
    p_confidence,
    NULLIF(btrim(p_human_oversight_state), ''),
    COALESCE(p_metadata, '{}'::jsonb),
    COALESCE(p_provenance, '{}'::jsonb),
    p_idempotency_key,
    p_payload_hash,
    p_protocol_version
  )
  RETURNING id INTO v_evidence_id;

  INSERT INTO public.audit_log (
    organization_id,
    actor_id,
    actor_type,
    action_type,
    resource_type,
    resource_id,
    payload
  ) VALUES (
    v_system.organization_id,
    v_system.owner_user_id,
    'ai_system',
    'external_ai_decision_ingested',
    'decision',
    v_decision_id::text,
    jsonb_build_object(
      'ai_system_id', v_system.id,
      'external_ai_evidence_id', v_evidence_id,
      'external_event_id', p_external_event_id,
      'provider', v_system.provider,
      'system_identifier', v_system.system_identifier,
      'model_version', v_system.model_version,
      'input_hash', p_input_hash,
      'output_hash', p_output_hash,
      'payload_hash', p_payload_hash,
      'protocol_version', p_protocol_version
    )
  );

  UPDATE public.ai_system_credentials
  SET last_used_at = now()
  WHERE id = v_credential.id;

  RETURN QUERY SELECT v_decision_id, v_evidence_id, false, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_external_ai_decision(
  uuid, text, timestamptz, text, text, jsonb, numeric, text, jsonb, jsonb, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_external_ai_decision(
  uuid, text, timestamptz, text, text, jsonb, numeric, text, jsonb, jsonb, text, text, text
) TO service_role;
