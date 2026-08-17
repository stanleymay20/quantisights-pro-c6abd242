-- Harden tenant boundaries for SECURITY DEFINER helper/read RPCs.
-- Applied first to isolated staging and recorded as migration 20260817175105.

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _org_id IS NULL THEN false
    WHEN auth.uid() = _user_id
      OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    THEN EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = _user_id
        AND om.organization_id = _org_id
    )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_org_role(_user_id uuid, _org_id uuid)
RETURNS public.org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _org_id IS NULL THEN NULL::public.org_role
    WHEN auth.uid() = _user_id
      OR COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    THEN (
      SELECT om.role
      FROM public.organization_members om
      WHERE om.user_id = _user_id
        AND om.organization_id = _org_id
      LIMIT 1
    )
    ELSE NULL::public.org_role
  END;
$$;

-- These read RPCs do not need to bypass RLS. Run them with invoker privileges
-- so their underlying table policies remain the tenant-authorization boundary.
ALTER FUNCTION public.count_measured_outcomes(uuid) SECURITY INVOKER;
ALTER FUNCTION public.count_measured_outcomes(uuid) SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_active_governance_profile(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_active_governance_profile(uuid) SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_iq_composite_score(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_iq_composite_score(uuid, uuid) SET search_path = pg_catalog, public;

ALTER FUNCTION public.get_my_org_security_settings() SECURITY INVOKER;
ALTER FUNCTION public.get_my_org_security_settings() SET search_path = pg_catalog, public;

-- Cron health is platform-operational data with no tenant parameter. It is not
-- a user-facing RPC; keep it available to service-role automation only.
REVOKE EXECUTE ON FUNCTION public.get_cron_health(text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_health(text[]) TO service_role;
