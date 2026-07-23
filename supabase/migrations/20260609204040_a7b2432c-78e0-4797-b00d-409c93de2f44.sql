
-- 1. gdpr_requests: explicit SELECT deny
DROP POLICY IF EXISTS "Deny select to authenticated" ON public.gdpr_requests;
CREATE POLICY "Deny select to authenticated"
  ON public.gdpr_requests FOR SELECT
  TO authenticated, anon
  USING (false);

-- 2. procurement_pack_versions: require org membership
DROP POLICY IF EXISTS "Authenticated users can view procurement packs" ON public.procurement_pack_versions;
CREATE POLICY "Org members can view procurement packs"
  ON public.procurement_pack_versions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

-- 3. sap_schema_drift_alerts: use org-scoped elevated role
DROP POLICY IF EXISTS "drift_admin_update" ON public.sap_schema_drift_alerts;
DROP POLICY IF EXISTS "drift_admin_delete" ON public.sap_schema_drift_alerts;

CREATE POLICY "drift_admin_update"
  ON public.sap_schema_drift_alerts FOR UPDATE
  TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

CREATE POLICY "drift_admin_delete"
  ON public.sap_schema_drift_alerts FOR DELETE
  TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id));
