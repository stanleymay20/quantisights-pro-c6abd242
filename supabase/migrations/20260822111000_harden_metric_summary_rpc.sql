-- Harden precomputed metric summary RPCs.
-- SECURITY DEFINER functions bypass table RLS, so tenant authorization must be
-- enforced inside the function and EXECUTE grants must be explicit.

CREATE OR REPLACE FUNCTION public.refresh_metric_summaries(_org_id uuid, _dataset_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _count integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'refresh_metric_summaries requires service role' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.datasets d
    WHERE d.id = _dataset_id AND d.organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'dataset does not belong to organization' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'metric_summaries:' || _org_id::text || ':' || _dataset_id::text,
    0
  ));

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
        m.id,
        m.organization_id, m.dataset_id, m.metric_type,
        m.value, m.date,
        COUNT(*) OVER (PARTITION BY m.metric_type) AS cnt,
        ROW_NUMBER() OVER (PARTITION BY m.metric_type ORDER BY m.date DESC, m.id DESC) AS rn,
        SUM(m.value) OVER (PARTITION BY m.metric_type) AS total,
        NTILE(2) OVER (PARTITION BY m.metric_type ORDER BY m.date, m.id) AS half
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

  -- Remove summaries for metric types that no longer exist in the source
  -- dataset. Without this, deleted/replaced data can leave stale executive KPIs.
  DELETE FROM public.metric_summaries ms
  WHERE ms.organization_id = _org_id
    AND ms.dataset_id = _dataset_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.metrics m
      WHERE m.organization_id = _org_id
        AND m.dataset_id = _dataset_id
        AND m.metric_type = ms.metric_type
    );

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_metric_summaries(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_metric_summaries(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_metrics_summary(_org_id uuid, _dataset_id uuid)
RETURNS TABLE(
  metric_type text,
  total numeric,
  latest_value numeric,
  latest_date date,
  row_count bigint,
  trend text,
  previous_half_total numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT COALESCE(public.is_org_member(auth.uid(), _org_id), false) THEN
    RAISE EXCEPTION 'not authorized for organization' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.datasets d
    WHERE d.id = _dataset_id AND d.organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'dataset does not belong to organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ms.metric_type, ms.total, ms.latest_value, ms.latest_date,
    ms.row_count, ms.trend, ms.previous_half_total
  FROM public.metric_summaries ms
  WHERE ms.organization_id = _org_id AND ms.dataset_id = _dataset_id
  ORDER BY ms.row_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_metrics_summary(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_metrics_summary(uuid, uuid) TO authenticated, service_role;
