
-- 1) trust_metrics_snapshots: drop public read, scope to authenticated org members
DROP POLICY IF EXISTS "Trust snapshots are public" ON public.trust_metrics_snapshots;

CREATE POLICY "Trust snapshots readable by org members"
ON public.trust_metrics_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
  )
);

REVOKE SELECT ON public.trust_metrics_snapshots FROM anon;

-- 2) Add org-membership scoping to admin/executive write policies
DROP POLICY IF EXISTS fusion_obs_write_admin ON public.fusion_observability;
CREATE POLICY fusion_obs_write_admin ON public.fusion_observability
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
);

DROP POLICY IF EXISTS attention_budget_write_admin ON public.attention_budget_config;
CREATE POLICY attention_budget_write_admin ON public.attention_budget_config
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS narrative_memory_write_admin ON public.narrative_memory;
CREATE POLICY narrative_memory_write_admin ON public.narrative_memory
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
);

DROP POLICY IF EXISTS pressure_models_write_admin ON public.organizational_pressure_models;
CREATE POLICY pressure_models_write_admin ON public.organizational_pressure_models
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
);

DROP POLICY IF EXISTS narrative_conflicts_write_admin ON public.narrative_conflicts;
CREATE POLICY narrative_conflicts_write_admin ON public.narrative_conflicts
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
);

DROP POLICY IF EXISTS fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters;
CREATE POLICY fusion_clusters_write_admin_exec ON public.intelligence_fusion_clusters
FOR ALL TO authenticated
USING (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
)
WITH CHECK (
  is_org_member(organization_id, auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'executive'::app_role))
);

-- 3) Realtime: gate channel access on confirmed organization_members membership
DROP POLICY IF EXISTS "Users can only access their org channels" ON realtime.messages;
CREATE POLICY "Users can only access their org channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND messages.topic LIKE ('realtime:public:%:organization\_id=eq.' || om.organization_id::text)
  )
);
