
-- 1. Fix calibration_assessments: drop the weak public INSERT policy
DROP POLICY IF EXISTS "Users can insert own assessments" ON public.calibration_assessments;

-- Also fix the public UPDATE policy to require org membership
DROP POLICY IF EXISTS "Users can update own assessments" ON public.calibration_assessments;
CREATE POLICY "Users can update own assessments"
  ON public.calibration_assessments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND is_org_member(auth.uid(), organization_id))
  WITH CHECK (user_id = auth.uid() AND is_org_member(auth.uid(), organization_id));

-- Fix the public SELECT policy to authenticated only
DROP POLICY IF EXISTS "Users can view own assessments" ON public.calibration_assessments;
CREATE POLICY "Users can view own assessments"
  ON public.calibration_assessments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Fix user_roles: prevent self-role-escalation by preventing admins from modifying their own roles
DROP POLICY IF EXISTS "Org admins can manage roles in same org" ON public.user_roles;
CREATE POLICY "Org admins can manage roles in same org"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    user_roles.user_id != auth.uid() AND
    EXISTS (
      SELECT 1 FROM organization_members actor_om
      JOIN organization_members target_om ON actor_om.organization_id = target_om.organization_id
      WHERE actor_om.user_id = auth.uid()
        AND actor_om.role IN ('owner', 'admin')
        AND target_om.user_id = user_roles.user_id
    )
  )
  WITH CHECK (
    user_roles.user_id != auth.uid() AND
    EXISTS (
      SELECT 1 FROM organization_members actor_om
      JOIN organization_members target_om ON actor_om.organization_id = target_om.organization_id
      WHERE actor_om.user_id = auth.uid()
        AND actor_om.role IN ('owner', 'admin')
        AND target_om.user_id = user_roles.user_id
    )
  );
