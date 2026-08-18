CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated;

CREATE OR REPLACE FUNCTION private.resolve_sso_for_email(_email text)
RETURNS TABLE(idp_sso_url text, enforce_sso boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT sc.idp_sso_url, sc.enforce_sso
  FROM public.sso_configs AS sc
  WHERE sc.is_active = true
    AND sc.idp_sso_url IS NOT NULL
    AND length(_email) - length(replace(_email, '@', '')) = 1
    AND EXISTS (
      SELECT 1
      FROM unnest(sc.allowed_domains) AS domain(value)
      WHERE split_part(lower(trim(_email)), '@', 2) = lower(trim(domain.value))
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.resolve_sso_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.resolve_sso_for_email(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.resolve_sso_for_email(text);

CREATE FUNCTION public.resolve_sso_for_email(_email text)
RETURNS TABLE(idp_sso_url text, enforce_sso boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT * FROM private.resolve_sso_for_email(_email);
$$;

REVOKE ALL ON FUNCTION public.resolve_sso_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_sso_for_email(text) TO anon, authenticated;