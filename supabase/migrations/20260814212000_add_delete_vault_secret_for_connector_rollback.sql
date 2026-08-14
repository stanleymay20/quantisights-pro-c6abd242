-- Paid-pilot connector provisioning needs compensating rollback when a multi-step
-- credential/connector/data-source setup fails. This function is intentionally
-- service-role-only and accepts a Vault secret name, never a secret value.
CREATE OR REPLACE FUNCTION public.delete_vault_secret(_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  _secret_id uuid;
BEGIN
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role')
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id INTO _secret_id
  FROM vault.secrets
  WHERE name = _name
  LIMIT 1;

  IF _secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = _secret_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_vault_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_vault_secret(text) TO service_role;
