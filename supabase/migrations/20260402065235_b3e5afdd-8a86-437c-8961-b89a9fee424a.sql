
-- 1. A/B Experiments
CREATE TABLE public.ab_experiments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  hypothesis TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  control_group_filter JSONB DEFAULT '{}'::jsonb,
  treatment_group_filter JSONB DEFAULT '{}'::jsonb,
  primary_metric TEXT NOT NULL,
  secondary_metrics TEXT[] DEFAULT '{}',
  target_sample_size INTEGER,
  alpha NUMERIC NOT NULL DEFAULT 0.05,
  minimum_detectable_effect NUMERIC,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  results JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view experiments for their org"
  ON public.ab_experiments FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create experiments"
  ON public.ab_experiments FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can update experiments"
  ON public.ab_experiments FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can delete experiments"
  ON public.ab_experiments FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_ab_experiments_org ON public.ab_experiments(organization_id);

CREATE TRIGGER update_ab_experiments_updated_at
  BEFORE UPDATE ON public.ab_experiments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Cohort Definitions
CREATE TABLE public.cohort_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  cohort_field TEXT NOT NULL,
  activity_field TEXT NOT NULL,
  entity_field TEXT NOT NULL DEFAULT 'user_id',
  period_type TEXT NOT NULL DEFAULT 'month',
  filters JSONB DEFAULT '{}'::jsonb,
  last_computed_at TIMESTAMPTZ,
  cached_results JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cohort_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cohorts for their org"
  ON public.cohort_definitions FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can create cohorts"
  ON public.cohort_definitions FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can update cohorts"
  ON public.cohort_definitions FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org members can delete cohorts"
  ON public.cohort_definitions FOR DELETE TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_cohort_definitions_org ON public.cohort_definitions(organization_id);

CREATE TRIGGER update_cohort_definitions_updated_at
  BEFORE UPDATE ON public.cohort_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Time-based partitioning indexes
CREATE INDEX IF NOT EXISTS idx_metrics_org_date ON public.metrics(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_dataset_date ON public.metrics(dataset_id, date);
CREATE INDEX IF NOT EXISTS idx_metrics_type_date ON public.metrics(metric_type, date);

-- 4. Composite index on metric_aggregates for faster rollup queries
CREATE INDEX IF NOT EXISTS idx_aggregates_lookup
  ON public.metric_aggregates(organization_id, metric_type, period_type, period_start);

-- 5. Materialized aggregate refresh function
CREATE OR REPLACE FUNCTION public.refresh_metric_aggregates(
  _org_id UUID,
  _dataset_id UUID DEFAULT NULL,
  _period_type TEXT DEFAULT 'monthly'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_count INTEGER := 0;
BEGIN
  DELETE FROM public.metric_aggregates
  WHERE organization_id = _org_id
    AND period_type = _period_type
    AND (_dataset_id IS NULL OR dataset_id = _dataset_id);

  INSERT INTO public.metric_aggregates (
    organization_id, dataset_id, metric_type, period_type,
    period_start, agg_avg, agg_min, agg_max,
    agg_sum, agg_count
  )
  SELECT
    m.organization_id,
    m.dataset_id,
    m.metric_type,
    _period_type,
    CASE _period_type
      WHEN 'monthly' THEN date_trunc('month', m.date)
      WHEN 'quarterly' THEN date_trunc('quarter', m.date)
      WHEN 'yearly' THEN date_trunc('year', m.date)
      ELSE date_trunc('month', m.date)
    END AS period_start,
    AVG(m.value),
    MIN(m.value),
    MAX(m.value),
    SUM(m.value),
    COUNT(m.value)::integer
  FROM public.metrics m
  WHERE m.organization_id = _org_id
    AND (_dataset_id IS NULL OR m.dataset_id = _dataset_id)
  GROUP BY
    m.organization_id, m.dataset_id, m.metric_type,
    CASE _period_type
      WHEN 'monthly' THEN date_trunc('month', m.date)
      WHEN 'quarterly' THEN date_trunc('quarter', m.date)
      WHEN 'yearly' THEN date_trunc('year', m.date)
      ELSE date_trunc('month', m.date)
    END;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
