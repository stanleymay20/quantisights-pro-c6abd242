
-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can insert shadow logs" ON public.decision_shadow_log;

-- Replace with admin-only insert
CREATE POLICY "Admins can insert shadow logs"
  ON public.decision_shadow_log FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND (SELECT role FROM public.organization_members WHERE user_id = auth.uid() AND organization_id = decision_shadow_log.organization_id) IN ('owner', 'admin')
  );
