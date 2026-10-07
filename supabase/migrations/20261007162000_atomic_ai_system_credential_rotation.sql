-- Serialize machine-credential rotation per AI system and make revocation,
-- replacement, and audit logging one database transaction. This prevents two
-- simultaneous rotations from leaving multiple credentials active.

CREATE OR REPLACE FUNCTION public.rotate_ai_system_credential(
  p_organization_id uuid,
  p_ai_system_id uuid,
  p_token_hash text,
  p_token_prefix text,
  p_expires_at timestamptz,
  p_created_by uuid
)
RETURNS TABLE (
  credential_id uuid,
  token_prefix text,
  expires_at timestamptz,
  created_at timestamptz,
  revoked_credential_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_system public.ai_systems%ROWTYPE;
  v_new public.ai_system_credentials%ROWTYPE;
  v_revoked_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_token_hash !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_TOKEN_HASH';
  END IF;
  IF length(p_token_prefix) < 6 OR length(p_token_prefix) > 32 THEN
    RAISE EXCEPTION 'INVALID_TOKEN_PREFIX';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'INVALID_CREDENTIAL_EXPIRY';
  END IF;

  -- The row lock is the rotation mutex. Concurrent rotations for one system
  -- execute in order; the later transaction revokes the earlier replacement,
  -- so at commit there is at most one active credential for the system.
  SELECT * INTO v_system
  FROM public.ai_systems
  WHERE id = p_ai_system_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_SYSTEM_NOT_FOUND';
  END IF;
  IF v_system.lifecycle_status = 'retired' THEN
    RAISE EXCEPTION 'AI_SYSTEM_RETIRED';
  END IF;

  SELECT COALESCE(array_agg(id ORDER BY created_at, id), ARRAY[]::uuid[])
    INTO v_revoked_ids
  FROM public.ai_system_credentials
  WHERE organization_id = p_organization_id
    AND ai_system_id = p_ai_system_id
    AND status = 'active';

  UPDATE public.ai_system_credentials
  SET status = 'revoked',
      revoked_at = now()
  WHERE organization_id = p_organization_id
    AND ai_system_id = p_ai_system_id
    AND status = 'active';

  INSERT INTO public.ai_system_credentials (
    organization_id,
    ai_system_id,
    token_hash,
    token_prefix,
    expires_at,
    created_by
  ) VALUES (
    p_organization_id,
    p_ai_system_id,
    p_token_hash,
    p_token_prefix,
    p_expires_at,
    p_created_by
  )
  RETURNING * INTO v_new;

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
    p_created_by,
    'user',
    'ai_system_credential_rotated',
    'ai_system',
    p_ai_system_id::text,
    jsonb_build_object(
      'new_credential_id', v_new.id,
      'revoked_credential_ids', to_jsonb(v_revoked_ids)
    )
  );

  RETURN QUERY SELECT
    v_new.id,
    v_new.token_prefix,
    v_new.expires_at,
    v_new.created_at,
    v_revoked_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_ai_system_credential(
  uuid, uuid, text, text, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_ai_system_credential(
  uuid, uuid, text, text, timestamptz, uuid
) TO service_role;

COMMENT ON FUNCTION public.rotate_ai_system_credential(uuid, uuid, text, text, timestamptz, uuid) IS
  'Service-role-only serialized credential rotation. Revokes existing active credentials, inserts one replacement, and records the audit event atomically.';
