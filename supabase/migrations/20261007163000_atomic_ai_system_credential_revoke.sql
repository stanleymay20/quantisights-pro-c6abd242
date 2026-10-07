-- Serialize credential revocation on the same AI-system row used by rotation.
-- This prevents revoke-vs-rotate races and makes status mutation + audit one
-- transaction, so no compensating reactivation can resurrect an old token.

CREATE OR REPLACE FUNCTION public.revoke_ai_system_credential(
  p_organization_id uuid,
  p_credential_id uuid,
  p_actor_id uuid
)
RETURNS TABLE (
  credential_id uuid,
  ai_system_id uuid,
  status text,
  revoked_at timestamptz,
  idempotent_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_initial public.ai_system_credentials%ROWTYPE;
  v_credential public.ai_system_credentials%ROWTYPE;
BEGIN
  -- First discover the owning AI system without relying on caller-supplied
  -- identity. The authoritative row is re-read after the system lock below.
  SELECT * INTO v_initial
  FROM public.ai_system_credentials
  WHERE id = p_credential_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDENTIAL_NOT_FOUND';
  END IF;

  -- Same mutex as rotate_ai_system_credential. A concurrent rotation/revoke
  -- for one AI system therefore commits in a deterministic serial order.
  PERFORM 1
  FROM public.ai_systems
  WHERE id = v_initial.ai_system_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_SYSTEM_NOT_FOUND';
  END IF;

  SELECT * INTO v_credential
  FROM public.ai_system_credentials
  WHERE id = p_credential_id
    AND organization_id = p_organization_id
    AND ai_system_id = v_initial.ai_system_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDENTIAL_NOT_FOUND';
  END IF;

  IF v_credential.status = 'revoked' THEN
    RETURN QUERY SELECT
      v_credential.id,
      v_credential.ai_system_id,
      v_credential.status,
      v_credential.revoked_at,
      true;
    RETURN;
  END IF;

  UPDATE public.ai_system_credentials
  SET status = 'revoked',
      revoked_at = now()
  WHERE id = v_credential.id
  RETURNING * INTO v_credential;

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
    p_actor_id,
    'user',
    'ai_system_credential_revoked',
    'ai_system',
    v_credential.ai_system_id::text,
    jsonb_build_object('credential_id', v_credential.id)
  );

  RETURN QUERY SELECT
    v_credential.id,
    v_credential.ai_system_id,
    v_credential.status,
    v_credential.revoked_at,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_ai_system_credential(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_ai_system_credential(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.revoke_ai_system_credential(uuid, uuid, uuid) IS
  'Service-role-only serialized credential revocation. Locks the owning AI system, revokes the credential, and records the audit event atomically.';
