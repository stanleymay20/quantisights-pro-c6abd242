-- Industrial hierarchy
CREATE TABLE public.industrial_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.industrial_nodes(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('company','region','site','plant','area','line','cell','machine')),
  name text NOT NULL,
  external_code text,
  country_code text,
  path text,
  depth integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, parent_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.industrial_nodes TO authenticated;
GRANT ALL ON public.industrial_nodes TO service_role;
ALTER TABLE public.industrial_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view industrial nodes" ON public.industrial_nodes
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Admins insert industrial nodes" ON public.industrial_nodes
  FOR INSERT TO authenticated WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins update industrial nodes" ON public.industrial_nodes
  FOR UPDATE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins delete industrial nodes" ON public.industrial_nodes
  FOR DELETE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE INDEX idx_industrial_nodes_org ON public.industrial_nodes(organization_id);
CREATE INDEX idx_industrial_nodes_parent ON public.industrial_nodes(parent_id);

CREATE TRIGGER trg_industrial_nodes_updated_at BEFORE UPDATE ON public.industrial_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Industrial metric facts
CREATE TABLE public.industrial_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.industrial_nodes(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  metric_key text NOT NULL CHECK (metric_key IN (
    'oee','availability','performance','quality','mtbf','mttr','downtime_minutes',
    'yield','scrap_rate','throughput','cycle_time','planned_production','actual_production',
    'inventory','order_backlog','maintenance_events','energy_use','supplier_delay_days','defect_rate'
  )),
  period_start date NOT NULL,
  period_end date NOT NULL,
  granularity text NOT NULL DEFAULT 'day' CHECK (granularity IN ('hour','day','week','month')),
  value numeric NOT NULL,
  unit text,
  target_value numeric,
  data_quality_score numeric CHECK (data_quality_score IS NULL OR (data_quality_score >= 0 AND data_quality_score <= 1)),
  source text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, metric_key, period_start, granularity)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.industrial_metrics TO authenticated;
GRANT ALL ON public.industrial_metrics TO service_role;
ALTER TABLE public.industrial_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view industrial metrics" ON public.industrial_metrics
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Admins insert industrial metrics" ON public.industrial_metrics
  FOR INSERT TO authenticated WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins update industrial metrics" ON public.industrial_metrics
  FOR UPDATE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins delete industrial metrics" ON public.industrial_metrics
  FOR DELETE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE INDEX idx_industrial_metrics_org_period ON public.industrial_metrics(organization_id, period_start DESC);
CREATE INDEX idx_industrial_metrics_node_key ON public.industrial_metrics(node_id, metric_key, period_start DESC);

CREATE TRIGGER trg_industrial_metrics_updated_at BEFORE UPDATE ON public.industrial_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Industrial decision templates
CREATE TABLE public.industrial_decision_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_key text NOT NULL CHECK (template_key IN (
    'bottleneck_detection','maintenance_prioritization','capacity_risk',
    'quality_deterioration','production_plan_variance','supplier_disruption'
  )),
  title text NOT NULL,
  description text,
  trigger_metric text NOT NULL,
  comparator text NOT NULL DEFAULT 'lt' CHECK (comparator IN ('lt','lte','gt','gte')),
  threshold numeric NOT NULL,
  applies_to_node_type text NOT NULL DEFAULT 'plant' CHECK (applies_to_node_type IN ('company','region','site','plant','area','line','cell','machine')),
  recommended_action text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.industrial_decision_templates TO authenticated;
GRANT ALL ON public.industrial_decision_templates TO service_role;
ALTER TABLE public.industrial_decision_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members view industrial templates" ON public.industrial_decision_templates
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "Admins insert industrial templates" ON public.industrial_decision_templates
  FOR INSERT TO authenticated WITH CHECK (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins update industrial templates" ON public.industrial_decision_templates
  FOR UPDATE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));
CREATE POLICY "Admins delete industrial templates" ON public.industrial_decision_templates
  FOR DELETE TO authenticated USING (public.get_user_org_role(auth.uid(), organization_id) IN ('owner','admin'));

CREATE TRIGGER trg_industrial_templates_updated_at BEFORE UPDATE ON public.industrial_decision_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();