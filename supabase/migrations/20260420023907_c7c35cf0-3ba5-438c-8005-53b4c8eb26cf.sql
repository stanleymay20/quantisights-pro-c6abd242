-- connector_field_mappings — split FOR ALL into explicit per-action policies
DROP POLICY IF EXISTS "admins_manage_mappings" ON public.connector_field_mappings;

CREATE POLICY "admins_insert_mappings" ON public.connector_field_mappings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

CREATE POLICY "admins_update_mappings" ON public.connector_field_mappings
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

CREATE POLICY "admins_delete_mappings" ON public.connector_field_mappings
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

-- connector_sync_schedules — split FOR ALL into explicit per-action policies
DROP POLICY IF EXISTS "admins_manage_schedules" ON public.connector_sync_schedules;

CREATE POLICY "admins_insert_schedules" ON public.connector_sync_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

CREATE POLICY "admins_update_schedules" ON public.connector_sync_schedules
  FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );

CREATE POLICY "admins_delete_schedules" ON public.connector_sync_schedules
  FOR DELETE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND public.exec_require_elevated_role(auth.uid(), organization_id)
  );