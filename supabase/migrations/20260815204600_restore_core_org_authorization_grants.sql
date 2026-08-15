-- Restore the authenticated privileges required by the core organization RLS
-- helpers after the public SECURITY DEFINER execute hardening migration.
--
-- The helpers remain unavailable to anon. They are SECURITY DEFINER functions
-- used by tenant-scoped RLS policies, so authenticated clients must be able to
-- execute them for those policies to evaluate.
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_org_role(uuid, uuid)
  TO authenticated, service_role;

-- organization_members is a direct application data surface: the client reads
-- memberships during org bootstrap, inserts the user's personal membership,
-- and authorized admins update/delete members. Existing RLS policies remain
-- the authorization boundary for every operation.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.organization_members
  TO authenticated;
