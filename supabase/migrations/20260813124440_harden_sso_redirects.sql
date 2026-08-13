-- Fail closed on SSO redirect destinations. Existing invalid values are
-- disabled before the constraint is installed so deployment cannot preserve a
-- stored javascript:, credential-bearing, whitespace, or backslash URL.
UPDATE public.sso_configs
SET idp_sso_url = NULL,
    is_active = false,
    updated_at = now()
WHERE idp_sso_url IS NOT NULL
  AND NOT (
    idp_sso_url ~* '^https://[a-z0-9]'
    AND idp_sso_url !~ '[[:space:][:cntrl:]]'
    AND position(E'\\' IN idp_sso_url) = 0
    AND position('@' IN split_part(idp_sso_url, '/', 3)) = 0
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sso_configs_https_redirect_check'
      AND conrelid = 'public.sso_configs'::regclass
  ) THEN
    ALTER TABLE public.sso_configs
      ADD CONSTRAINT sso_configs_https_redirect_check
      CHECK (
        idp_sso_url IS NULL OR (
          idp_sso_url ~* '^https://[a-z0-9]'
          AND idp_sso_url !~ '[[:space:][:cntrl:]]'
          AND position(E'\\' IN idp_sso_url) = 0
          AND position('@' IN split_part(idp_sso_url, '/', 3)) = 0
        )
      );
  END IF;
END
$$;

-- Keep the privileged lookup outside the exposed public schema and return only
-- the two fields the unauthenticated login screen needs. Exact domain matching
-- avoids wildcard behavior from LIKE against administrator-provided domains.
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
