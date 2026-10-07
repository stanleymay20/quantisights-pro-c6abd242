-- Quantivis external-AI evidence wedge.
--
-- Design goals:
--   * register external AI systems explicitly per organization;
--   * authenticate machine ingest with revocable, one-way-hashed credentials;
--   * keep external provenance append-only and separate from the mutable
--     decision workflow;
--   * create normal decision_ledger rows in `pending` state so external AI
--     output can never bypass Quantivis governance/approval gates;
--   * make event/idempotency retries deterministic and conflict-safe.

CREATE TABLE IF NOT EXISTS public.ai_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  provider text NOT NULL CHECK (length(btrim(provider)) BETWEEN 1 AND 120),
  system_identifier text NOT NULL CHECK (length(btrim(system_identifier)) BETWEEN 1 AND 240),
  model_version text,
  system_type text NOT NULL DEFAULT 'model'
    CHECK (system_type IN ('model', 'agent', 'workflow', 'rules_engine', 'other')),
  deployment_environment text NOT NULL DEFAULT 'production'
    CHECK (deployment_environment IN ('development', 'test', 'staging', 'production', 'other')),
  purpose text,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'paused', 'retired')),
  -- Intentionally nullable. Quantivis must never infer or fabricate a legal
  -- or regulatory risk class on behalf of the customer.
  risk_classification text,
  external_identifier text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_systems_org_external_identifier
  ON public.ai_systems (organization_id, external_identifier)
  WHERE external_identifier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_systems_org_status
  ON public.ai_systems (organization_id, lifecycle_status);

ALTER TABLE public.ai_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view AI systems" ON public.ai_systems;
CREATE POLICY "Org members can view AI systems"
  ON public.ai_systems FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins owners can create AI systems" ON public.ai_systems;
CREATE POLICY "Admins owners can create AI systems"
  ON public.ai_systems FOR INSERT
  WITH CHECK (
    public.get_user_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
  );

DROP POLICY IF EXISTS "Admins owners can update AI systems" ON public.ai_systems;
CREATE POLICY "Admins owners can update AI systems"
  ON public.ai_systems FOR UPDATE
  USING (
    public.get_user_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
  )
  WITH CHECK (
    public.get_user_org_role(auth.uid(), organization_id) = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
  );

DROP TRIGGER IF EXISTS update_ai_systems_updated_at ON public.ai_systems;
CREATE TRIGGER update_ai_systems_updated_at
  BEFORE UPDATE ON public.ai_systems
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Machine credentials are service-role only. The raw token is returned once by
-- the registry Edge Function; only its SHA-256 digest is persisted.
CREATE TABLE IF NOT EXISTS public.ai_system_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ai_system_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  token_prefix text NOT NULL CHECK (length(token_prefix) BETWEEN 6 AND 32),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT ai_system_credentials_system_fk
    FOREIGN KEY (organization_id, ai_system_id)
    REFERENCES public.ai_systems(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_ai_system_credentials_system_status
  ON public.ai_system_credentials (ai_system_id, status);
ALTER TABLE public.ai_system_credentials ENABLE ROW LEVEL SECURITY;
-- No client RLS policies by design: credential digests are not user-facing.

-- Immutable producer/event provenance linked to the ordinary decision ledger.
-- This is deliberately separate from decision_ledger because governance state
-- can evolve while original producer evidence must not.
CREATE TABLE IF NOT EXISTS public.external_ai_decision_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ai_system_id uuid NOT NULL,
  credential_id uuid NOT NULL REFERENCES public.ai_system_credentials(id) ON DELETE RESTRICT,
  decision_ledger_id uuid NOT NULL REFERENCES public.decision_ledger(id) ON DELETE RESTRICT,

  -- Producer snapshot: preserves what produced the event even if registry
  -- display metadata changes later.
  system_name text NOT NULL,
  provider text NOT NULL,
  system_identifier text NOT NULL,
  model_version text,
  deployment_environment text NOT NULL,

  external_event_id text NOT NULL CHECK (length(btrim(external_event_id)) BETWEEN 1 AND 240),
  occurred_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  output_hash text NOT NULL CHECK (output_hash ~ '^sha256:[0-9a-f]{64}$'),
  decision_descriptor jsonb NOT NULL CHECK (jsonb_typeof(decision_descriptor) = 'object'),
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  human_oversight_state text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 240),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  protocol_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT external_ai_evidence_system_fk
    FOREIGN KEY (organization_id, ai_system_id)
    REFERENCES public.ai_systems(organization_id, id)
    ON DELETE RESTRICT,
  UNIQUE (organization_id, ai_system_id, external_event_id),
  UNIQUE (organization_id, ai_system_id, idempotency_key),
  UNIQUE (decision_ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_external_ai_evidence_org_ingested
  ON public.external_ai_decision_evidence (organization_id, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_ai_evidence_system_occurred
  ON public.external_ai_decision_evidence (ai_system_id, occurred_at DESC);

ALTER TABLE public.external_ai_decision_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org members can view external AI evidence" ON public.external_ai_decision_evidence;
CREATE POLICY "Org members can view external AI evidence"
  ON public.external_ai_decision_evidence FOR SELECT
  USING (public.is_org_member(auth.uid(), organization_id));
-- No INSERT/UPDATE/DELETE client policies. Ingest is service-role RPC only.

CREATE OR REPLACE FUNCTION public.prevent_external_ai_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'external_ai_decision_evidence is append-only';
END;
$$;

DROP TRIGGER IF EXISTS external_ai_evidence_append_only ON public.external_ai_decision_evidence;
CREATE TRIGGER external_ai_evidence_append_only
  BEFORE UPDATE OR DELETE ON public.external_ai_decision_evidence
  FOR EACH ROW EXECUTE FUNCTION public.prevent_external_ai_evidence_mutation();

-- Atomic intake primitive. Edge code authenticates the machine credential, then
-- this RPC re-checks the credential/system binding and performs the ledger +
-- evidence + audit write in one transaction.
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

  -- Idempotency key is the primary retry identity.
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

  -- External event identity independently prevents replay under a new key.
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

COMMENT ON TABLE public.external_ai_decision_evidence IS
  'Append-only evidence for externally produced AI decisions. Regulatory mappings built from these records are supporting evidence, not certification.';
