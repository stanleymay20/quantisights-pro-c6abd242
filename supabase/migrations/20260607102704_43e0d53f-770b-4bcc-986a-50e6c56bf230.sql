
-- 1) PRIVILEGE_ESCALATION
DROP POLICY IF EXISTS "Org admins can manage roles in same org" ON public.user_roles;

CREATE POLICY "Org admins can manage non-platform roles in same org"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  user_id <> auth.uid()
  AND role <> 'admin'::app_role
  AND EXISTS (
    SELECT 1
    FROM organization_members actor_om
    JOIN organization_members target_om
      ON actor_om.organization_id = target_om.organization_id
    WHERE actor_om.user_id = auth.uid()
      AND actor_om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
      AND target_om.user_id = user_roles.user_id
  )
)
WITH CHECK (
  user_id <> auth.uid()
  AND role <> 'admin'::app_role
  AND EXISTS (
    SELECT 1
    FROM organization_members actor_om
    JOIN organization_members target_om
      ON actor_om.organization_id = target_om.organization_id
    WHERE actor_om.user_id = auth.uid()
      AND actor_om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role])
      AND target_om.user_id = user_roles.user_id
  )
);

-- 2) Restrict procurement_pack_versions to authenticated users (table has no organization_id; bundle is global).
DROP POLICY IF EXISTS "Procurement packs are public" ON public.procurement_pack_versions;
REVOKE SELECT ON public.procurement_pack_versions FROM anon;

CREATE POLICY "Authenticated users can view procurement packs"
ON public.procurement_pack_versions
FOR SELECT
TO authenticated
USING (true);

-- 3) Replace platform admin checks with org-scoped admin checks.
DROP POLICY IF EXISTS attention_budget_write_admin ON public.attention_budget_config;
CREATE POLICY attention_budget_write_admin ON public.attention_budget_config
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS canonical_dimensions_admin_manage ON public.canonical_dimensions;
CREATE POLICY canonical_dimensions_admin_manage ON public.canonical_dimensions
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS canonical_entities_admin_manage ON public.canonical_entities;
CREATE POLICY canonical_entities_admin_manage ON public.canonical_entities
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS canonical_events_admin_manage ON public.canonical_events;
CREATE POLICY canonical_events_admin_manage ON public.canonical_events
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS canonical_metrics_admin_manage ON public.canonical_metrics;
CREATE POLICY canonical_metrics_admin_manage ON public.canonical_metrics
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS canonical_relationships_admin_manage ON public.canonical_relationships;
CREATE POLICY canonical_relationships_admin_manage ON public.canonical_relationships
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS connector_circuit_state_admin_manage ON public.connector_circuit_state;
CREATE POLICY connector_circuit_state_admin_manage ON public.connector_circuit_state
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS connector_dq_scores_admin_manage ON public.connector_dq_scores;
CREATE POLICY connector_dq_scores_admin_manage ON public.connector_dq_scores
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS connector_throttle_state_admin_manage ON public.connector_throttle_state;
CREATE POLICY connector_throttle_state_admin_manage ON public.connector_throttle_state
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS tok_admin_manage ON public.connector_token_state;
CREATE POLICY tok_admin_manage ON public.connector_token_state
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS sf_obj_admin_manage ON public.salesforce_object_schemas;
CREATE POLICY sf_obj_admin_manage ON public.salesforce_object_schemas
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS fusion_obs_write_admin ON public.fusion_observability;
CREATE POLICY fusion_obs_write_admin ON public.fusion_observability
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)));

DROP POLICY IF EXISTS fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters;
CREATE POLICY fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)));

DROP POLICY IF EXISTS narrative_conflicts_write_admin ON public.narrative_conflicts;
CREATE POLICY narrative_conflicts_write_admin ON public.narrative_conflicts
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)));

DROP POLICY IF EXISTS narrative_memory_write_admin ON public.narrative_memory;
CREATE POLICY narrative_memory_write_admin ON public.narrative_memory
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)));

DROP POLICY IF EXISTS pressure_models_write_admin ON public.organizational_pressure_models;
CREATE POLICY pressure_models_write_admin ON public.organizational_pressure_models
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id) OR (is_org_member(organization_id, auth.uid()) AND has_role(auth.uid(), 'executive'::app_role)));

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='sap_object_schemas' AND (qual LIKE '%has_role(auth.uid(), ''admin''%' OR with_check LIKE '%has_role(auth.uid(), ''admin''%') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sap_object_schemas', p.policyname);
  END LOOP;
END $$;
CREATE POLICY sap_obj_admin_manage ON public.sap_object_schemas
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));

DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='connector_field_mappings' AND (qual LIKE '%has_role(auth.uid(), ''admin''%' OR with_check LIKE '%has_role(auth.uid(), ''admin''%') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.connector_field_mappings', p.policyname);
  END LOOP;
END $$;
CREATE POLICY connector_field_mappings_admin_manage ON public.connector_field_mappings
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
