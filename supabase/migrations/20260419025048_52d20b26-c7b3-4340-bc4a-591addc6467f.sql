
CREATE OR REPLACE FUNCTION public.upsert_vault_secret(
  _name text,
  _value text,
  _description text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  _existing_id uuid;
BEGIN
  -- Only allow the service role to call this (prevents anon/authenticated abuse)
  IF current_setting('request.jwt.claim.role', true) NOT IN ('service_role')
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT id INTO _existing_id FROM vault.secrets WHERE name = _name LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(_existing_id, _value, _name, _description);
  ELSE
    PERFORM vault.create_secret(_value, _name, _description);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_vault_secret(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_vault_secret(text, text, text) TO service_role;
