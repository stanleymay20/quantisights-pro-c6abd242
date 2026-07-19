-- Fix user_roles: verify both actor and target are in the same org via organization_members
DROP POLICY IF EXISTS "Org admins can manage roles" ON public.user_roles;

CREATE POLICY "Org admins can manage roles in same org" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members actor_om
      JOIN public.organization_members target_om ON actor_om.organization_id = target_om.organization_id
      WHERE actor_om.user_id = auth.uid()
        AND actor_om.role IN ('owner', 'admin')
        AND target_om.user_id = user_roles.user_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members actor_om
      JOIN public.organization_members target_om ON actor_om.organization_id = target_om.organization_id
      WHERE actor_om.user_id = auth.uid()
        AND actor_om.role IN ('owner', 'admin')
        AND target_om.user_id = user_roles.user_id
    )
  );