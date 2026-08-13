
CREATE OR REPLACE FUNCTION public.get_metrics_summary(_org_id uuid, _dataset_id uuid)
RETURNS TABLE (
  metric_type text,
  total numeric,
  latest_value numeric,
  latest_date date,
  row_count bigint,
  trend text,
  previous_half_total numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH ranked AS (
    SELECT
      m.metric_type,
      m.value,
      m.date,
      COUNT(*) OVER (PARTITION BY m.metric_type) AS cnt,
      ROW_NUMBER() OVER (PARTITION BY m.metric_type ORDER BY m.date DESC) AS rn,
      SUM(m.value) OVER (PARTITION BY m.metric_type) AS total,
      NTILE(2) OVER (PARTITION BY m.metric_type ORDER BY m.date) AS half
    FROM public.metrics m
    WHERE m.organization_id = _org_id
      AND m.dataset_id = _dataset_id
  ),
  halves AS (
    SELECT
      metric_type,
      SUM(CASE WHEN half = 1 THEN value ELSE 0 END) AS first_half_total,
      SUM(CASE WHEN half = 2 THEN value ELSE 0 END) AS second_half_total
    FROM ranked
    GROUP BY metric_type
  ),
  latest AS (
    SELECT metric_type, value AS latest_value, date AS latest_date, total, cnt
    FROM ranked
    WHERE rn = 1
  )
  SELECT
    l.metric_type,
    l.total,
    l.latest_value,
    l.latest_date,
    l.cnt AS row_count,
    CASE
      WHEN l.cnt < 2 THEN 'flat'
      WHEN h.first_half_total = 0 THEN 'flat'
      WHEN ABS((h.second_half_total - h.first_half_total) / ABS(h.first_half_total) * 100) < 1 THEN 'flat'
      WHEN h.second_half_total > h.first_half_total THEN 'up'
      ELSE 'down'
    END AS trend,
    h.first_half_total AS previous_half_total
  FROM latest l
  JOIN halves h ON h.metric_type = l.metric_type
  ORDER BY l.cnt DESC;
$$;
