-- Tighten external_sync_runs SELECT policy to require explicit org membership.
-- System rows (organization_id IS NULL) are removed from client visibility;
-- the service role bypasses RLS and continues to see them for ops monitoring.
DROP POLICY IF EXISTS "Org members can view sync runs" ON public.external_sync_runs;

CREATE POLICY "Org members can view sync runs"
  ON public.external_sync_runs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_member(auth.uid(), organization_id)
  );