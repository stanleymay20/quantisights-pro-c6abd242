
-- Fix latent privilege escalation: remove has_role('executive') branch from tenant write policies
-- and correct inverted is_org_member argument order on related SELECT policies.

-- narrative_memory
DROP POLICY IF EXISTS narrative_memory_write_admin ON public.narrative_memory;
CREATE POLICY narrative_memory_write_admin ON public.narrative_memory
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
DROP POLICY IF EXISTS narrative_memory_read_members ON public.narrative_memory;
CREATE POLICY narrative_memory_read_members ON public.narrative_memory
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- intelligence_fusion_clusters
DROP POLICY IF EXISTS fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters;
CREATE POLICY fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
DROP POLICY IF EXISTS fusion_clusters_read_members ON public.intelligence_fusion_clusters;
CREATE POLICY fusion_clusters_read_members ON public.intelligence_fusion_clusters
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- narrative_conflicts
DROP POLICY IF EXISTS narrative_conflicts_write_admin ON public.narrative_conflicts;
CREATE POLICY narrative_conflicts_write_admin ON public.narrative_conflicts
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
DROP POLICY IF EXISTS narrative_conflicts_read_members ON public.narrative_conflicts;
CREATE POLICY narrative_conflicts_read_members ON public.narrative_conflicts
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- fusion_observability
DROP POLICY IF EXISTS fusion_obs_write_admin ON public.fusion_observability;
CREATE POLICY fusion_obs_write_admin ON public.fusion_observability
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
DROP POLICY IF EXISTS fusion_obs_read_members ON public.fusion_observability;
CREATE POLICY fusion_obs_read_members ON public.fusion_observability
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- organizational_pressure_models
DROP POLICY IF EXISTS pressure_models_write_admin ON public.organizational_pressure_models;
CREATE POLICY pressure_models_write_admin ON public.organizational_pressure_models
  FOR ALL TO authenticated
  USING (exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (exec_require_elevated_role(auth.uid(), organization_id));
DROP POLICY IF EXISTS pressure_models_read_members ON public.organizational_pressure_models;
CREATE POLICY pressure_models_read_members ON public.organizational_pressure_models
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- narrative_audit_log (SELECT only — append-only)
DROP POLICY IF EXISTS narrative_audit_read_members ON public.narrative_audit_log;
CREATE POLICY narrative_audit_read_members ON public.narrative_audit_log
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- narrative_suppression_log (SELECT only)
DROP POLICY IF EXISTS narrative_suppression_read_members ON public.narrative_suppression_log;
CREATE POLICY narrative_suppression_read_members ON public.narrative_suppression_log
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- attention_budget_config (SELECT)
DROP POLICY IF EXISTS attention_budget_read_members ON public.attention_budget_config;
CREATE POLICY attention_budget_read_members ON public.attention_budget_config
  FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), organization_id));

-- procurement_readiness_items: restrict public read to authenticated org members or service_role
DROP POLICY IF EXISTS "Readiness items are public" ON public.procurement_readiness_items;
CREATE POLICY procurement_readiness_items_read_authenticated ON public.procurement_readiness_items
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.procurement_readiness_items FROM anon;
