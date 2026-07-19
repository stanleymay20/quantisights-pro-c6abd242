
-- Precomputed metric summaries table
CREATE TABLE public.metric_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  metric_type text NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  latest_value numeric NOT NULL DEFAULT 0,
  latest_date date,
  row_count bigint NOT NULL DEFAULT 0,
  trend text NOT NULL DEFAULT 'flat',
  previous_half_total numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dataset_id, metric_type)
);

ALTER TABLE public.metric_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view metric summaries"
  ON public.metric_summaries FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE INDEX idx_metric_summaries_org_dataset
  ON public.metric_summaries (organization_id, dataset_id);

-- Function to refresh summaries for a given org/dataset
CREATE OR REPLACE FUNCTION public.refresh_metric_summaries(_org_id uuid, _dataset_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _count integer;
BEGIN
  INSERT INTO public.metric_summaries (
    organization_id, dataset_id, metric_type,
    total, latest_value, latest_date, row_count,
    trend, previous_half_total, computed_at
  )
  SELECT
    sub.organization_id, sub.dataset_id, sub.metric_type,
    sub.total, sub.latest_value, sub.latest_date, sub.row_count,
    sub.trend, sub.previous_half_total, now()
  FROM (
    WITH ranked AS (
      SELECT
        m.organization_id, m.dataset_id, m.metric_type,
        m.value, m.date,
        COUNT(*) OVER (PARTITION BY m.metric_type) AS cnt,
        ROW_NUMBER() OVER (PARTITION BY m.metric_type ORDER BY m.date DESC) AS rn,
        SUM(m.value) OVER (PARTITION BY m.metric_type) AS total,
        NTILE(2) OVER (PARTITION BY m.metric_type ORDER BY m.date) AS half
      FROM public.metrics m
      WHERE m.organization_id = _org_id AND m.dataset_id = _dataset_id
    ),
    halves AS (
      SELECT metric_type,
        SUM(CASE WHEN half = 1 THEN value ELSE 0 END) AS first_half_total,
        SUM(CASE WHEN half = 2 THEN value ELSE 0 END) AS second_half_total
      FROM ranked GROUP BY metric_type
    ),
    latest AS (
      SELECT organization_id, dataset_id, metric_type, value AS latest_value, date AS latest_date, total, cnt
      FROM ranked WHERE rn = 1
    )
    SELECT
      l.organization_id, l.dataset_id, l.metric_type,
      l.total, l.latest_value, l.latest_date, l.cnt AS row_count,
      CASE
        WHEN l.cnt < 2 THEN 'flat'
        WHEN h.first_half_total = 0 THEN 'flat'
        WHEN ABS((h.second_half_total - h.first_half_total) / ABS(h.first_half_total) * 100) < 1 THEN 'flat'
        WHEN h.second_half_total > h.first_half_total THEN 'up'
        ELSE 'down'
      END AS trend,
      h.first_half_total AS previous_half_total
    FROM latest l JOIN halves h ON h.metric_type = l.metric_type
  ) sub
  ON CONFLICT (organization_id, dataset_id, metric_type)
  DO UPDATE SET
    total = EXCLUDED.total,
    latest_value = EXCLUDED.latest_value,
    latest_date = EXCLUDED.latest_date,
    row_count = EXCLUDED.row_count,
    trend = EXCLUDED.trend,
    previous_half_total = EXCLUDED.previous_half_total,
    computed_at = now();

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- Rewrite get_metrics_summary to read from precomputed table (near-instant)
CREATE OR REPLACE FUNCTION public.get_metrics_summary(_org_id uuid, _dataset_id uuid)
RETURNS TABLE(metric_type text, total numeric, latest_value numeric, latest_date date, row_count bigint, trend text, previous_half_total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    ms.metric_type, ms.total, ms.latest_value, ms.latest_date,
    ms.row_count, ms.trend, ms.previous_half_total
  FROM public.metric_summaries ms
  WHERE ms.organization_id = _org_id AND ms.dataset_id = _dataset_id
  ORDER BY ms.row_count DESC;
$$;
