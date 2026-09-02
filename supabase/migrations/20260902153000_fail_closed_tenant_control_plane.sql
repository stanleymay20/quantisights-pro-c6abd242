-- P0 tenant-control-plane hardening.
--
-- Security intent:
--   * Auth identity creation must never implicitly create replacement tenant state.
--   * Ordinary authenticated clients cannot create organizations directly.
--   * Membership creation requires authority in the target organization; users
--     cannot self-enrol into arbitrary organizations or choose their own role.
--   * Organization admins cannot promote a membership to owner.
--   * A verified invitation may bootstrap a missing profile only after the
--     invitation email and target organization have been proven server-side.
--
-- Trusted fresh-signup tenant provisioning will be restored through a separate,
-- server-controlled provenance path. Until then, no-membership/incomplete
-- accounts fail closed in the application rather than manufacturing tenant data.

-- 1) Stop auth.users INSERT from creating an organization/profile/workspace shell.
-- Existing rows are intentionally left untouched for controlled reconciliation.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- The legacy trigger function is retained for migration/audit history, but it
-- must not be directly executable by client roles while trusted provisioning is
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

-- 5) Preserve the legitimate invitation path without restoring generic tenant
-- auto-provisioning. The invitation RPC already proves that a pending token is
-- valid and that auth.uid() owns the invited email. Only after those checks may
-- it create the membership and, if the user has no profile yet, bind that
-- profile to the verified invitation organization. Existing profiles are never
-- overwritten, preserving multi-organization users' established default org.
CREATE OR REPLACE FUNCTION public.accept_invitation(_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv record;
  current_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Authentication required');
  END IF;

  SELECT * INTO inv
  FROM public.team_invitations
  WHERE token = _token
    AND status = 'pending'
    AND expires_at > now();

  IF inv IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired invitation');
  END IF;

  SELECT email INTO current_email
  FROM auth.users
  WHERE id = auth.uid();

  IF current_email IS NULL OR lower(current_email) <> lower(inv.email) THEN
    RETURN jsonb_build_object('error', 'Email mismatch');
  END IF;

  -- The target tenant is now server-verified by the invitation. Bootstrap only
  -- a missing profile; never replace an existing profile's organization.
  INSERT INTO public.profiles (user_id, full_name, organization_id)
  SELECT
    u.id,
    COALESCE(u.raw_user_meta_data->>'full_name', u.email),
    inv.organization_id
  FROM auth.users u
  WHERE u.id = auth.uid()
  ON CONFLICT (user_id) DO NOTHING;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = inv.organization_id
      AND user_id = auth.uid()
  ) THEN
    UPDATE public.team_invitations
    SET status = 'accepted', accepted_at = now()
    WHERE id = inv.id;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Already a member',
      'organization_id', inv.organization_id
    );
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (inv.organization_id, auth.uid(), inv.role);

  UPDATE public.team_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = inv.id;

  RETURN jsonb_build_object('success', true, 'organization_id', inv.organization_id);
END;
$function$;

-- Keep invocation explicit: authenticated users may call the RPC, while the
-- function's own token/email checks define the trusted invitation boundary.
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_invitation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
