-- P0 tenant-control-plane hardening.
--
-- Security intent:
--   * Auth identity creation must never implicitly create replacement tenant state.
--   * Ordinary authenticated clients cannot create organizations directly.
--   * Membership creation requires authority in the target organization; users
--     cannot self-enrol into arbitrary organizations or choose their own role.
--   * Organization admins cannot promote a membership to owner.
--
-- Trusted tenant/signup provisioning will be restored through a separate,
-- server-controlled provenance path. Until then, no-membership/incomplete
-- accounts fail closed in the application rather than manufacturing tenant data.

-- 1) Stop auth.users INSERT from creating an organization/profile/workspace shell.
-- Existing rows are intentionally left untouched for controlled reconciliation.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- The trigger function is retained for migration/audit history, but it must not
-- be directly executable by client roles while the trusted provisioning path is
-- being replaced.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- 2) Organization creation is no longer a browser/client capability.
-- service_role and other RLS-bypassing trusted server paths remain available for
-- controlled administrative restore/provisioning workflows.
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;

-- 3) Remove the legacy self-membership bypass. The target organization must
-- already authorize the actor before a new membership can be created.
DROP POLICY IF EXISTS "Owners/admins can insert members" ON public.organization_members;
CREATE POLICY "Owners/admins can insert members"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_user_org_role(auth.uid(), organization_id) = 'owner'::public.org_role
    OR (
      public.get_user_org_role(auth.uid(), organization_id) = 'admin'::public.org_role
      AND role <> 'owner'::public.org_role
    )
  );

-- 4) Harden membership updates as well. The previous policy had no WITH CHECK,
-- allowing an admin-authorized update path to write a new owner role.
DROP POLICY IF EXISTS "Owners/admins can update members" ON public.organization_members;
CREATE POLICY "Owners/admins can update members"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_org_role(auth.uid(), organization_id) = 'owner'::public.org_role
    OR (
      public.get_user_org_role(auth.uid(), organization_id) = 'admin'::public.org_role
      AND role <> 'owner'::public.org_role
    )
  )
  WITH CHECK (
    public.get_user_org_role(auth.uid(), organization_id) = 'owner'::public.org_role
    OR (
      public.get_user_org_role(auth.uid(), organization_id) = 'admin'::public.org_role
      AND role <> 'owner'::public.org_role
    )
  );

COMMENT ON POLICY "Owners/admins can insert members" ON public.organization_members IS
  'Target-org authorization only. No self-enrolment bypass; admins cannot create owners.';
COMMENT ON POLICY "Owners/admins can update members" ON public.organization_members IS
  'Target-org authorization only. Admins cannot modify owner rows or promote memberships to owner.';
