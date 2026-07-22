ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_mfa              boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_timeout_minutes  integer  NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS min_password_length      integer  NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS ip_allowlist             text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sso_enforced             boolean  NOT NULL DEFAULT false;

COMMENT ON COLUMN public.organizations.require_mfa
  IS 'When true, all members must have MFA enrolled or are redirected to setup';
COMMENT ON COLUMN public.organizations.session_timeout_minutes
  IS 'Idle session timeout in minutes (15–480). Default 60.';
COMMENT ON COLUMN public.organizations.ip_allowlist
  IS 'CIDR blocks permitted to access this org. Empty = unrestricted.';

CREATE OR REPLACE FUNCTION public.get_my_org_security_settings()
RETURNS TABLE (
  require_mfa             boolean,
  session_timeout_minutes integer,
  min_password_length     integer,
  ip_allowlist            text[],
  sso_enforced            boolean
)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT
    o.require_mfa,
    o.session_timeout_minutes,
    o.min_password_length,
    o.ip_allowlist,
    o.sso_enforced
  FROM public.organizations o
  JOIN public.organization_members m
    ON m.organization_id = o.id
    AND m.user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_org_security_settings TO authenticated;