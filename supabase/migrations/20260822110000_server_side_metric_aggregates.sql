-- Set-based aggregate refresh for enterprise-scale metric volumes.
-- Keeps the data in Postgres instead of paging an entire dataset through an
-- Edge Function and aggregating in JavaScript memory.

CREATE OR REPLACE FUNCTION public.refresh_metric_aggregates_scoped(
  _org_id uuid,
  _dataset_id uuid DEFAULT NULL,
  _period_types text[] DEFAULT ARRAY['monthly','quarterly','yearly']::text[]
)
RETURNS TABLE(aggregated_count bigint, metric_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invalid_period text;
  v_lock_key bigint;
BEGIN
  IF _org_id IS NULL THEN
    RAISE EXCEPTION 'organization id is required';
  END IF;

  IF _period_types IS NULL OR cardinality(_period_types) = 0 THEN
    RAISE EXCEPTION 'at least one period type is required';
  END IF;

  SELECT p INTO v_invalid_period
  FROM unnest(_period_types) AS p
  WHERE p NOT IN ('monthly', 'quarterly', 'yearly')
  LIMIT 1;
  IF v_invalid_period IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported aggregate period type: %', v_invalid_period;
  END IF;

  IF _dataset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.datasets d
    WHERE d.id = _dataset_id AND d.organization_id = _org_id
  ) THEN
    RAISE EXCEPTION 'dataset does not belong to organization';
  END IF;

  -- Serialize refreshes for the same scope so two callers cannot churn the
  -- same aggregate rows simultaneously. This does not lock metric ingestion.
  v_lock_key := hashtextextended(
    'metric_aggregates:' || _org_id::text || ':' || COALESCE(_dataset_id::text, '*'),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  RETURN QUERY
  WITH aggregated AS MATERIALIZED (
    SELECT
      m.organization_id,
      m.dataset_id,
      m.workspace_id,
      m.metric_type,
      p.period_type,
      CASE p.period_type
        WHEN 'monthly' THEN date_trunc('month', m.date::timestamp)::date
        WHEN 'quarterly' THEN date_trunc('quarter', m.date::timestamp)::date
        WHEN 'yearly' THEN date_trunc('year', m.date::timestamp)::date
      END AS period_start,
      COALESCE(m.region, '') AS region,
      COALESCE(m.segment, '') AS segment,
      sum(m.value)::numeric AS agg_sum,
      count(*)::bigint AS agg_count,
      min(m.value)::numeric AS agg_min,
      max(m.value)::numeric AS agg_max,
      avg(m.value)::numeric AS agg_avg
    FROM public.metrics m
    CROSS JOIN LATERAL unnest(_period_types) AS p(period_type)
    WHERE m.organization_id = _org_id
      AND (_dataset_id IS NULL OR m.dataset_id = _dataset_id)
    GROUP BY
      m.organization_id,
      m.dataset_id,
      m.workspace_id,
      m.metric_type,
      p.period_type,
      CASE p.period_type
        WHEN 'monthly' THEN date_trunc('month', m.date::timestamp)::date
        WHEN 'quarterly' THEN date_trunc('quarter', m.date::timestamp)::date
        WHEN 'yearly' THEN date_trunc('year', m.date::timestamp)::date
      END,
      COALESCE(m.region, ''),
      COALESCE(m.segment, '')
  ),
  upserted AS (
    INSERT INTO public.metric_aggregates (
      organization_id,
      dataset_id,
      workspace_id,
      metric_type,
      period_type,
      period_start,
      region,
      segment,
      agg_sum,
      agg_count,
      agg_min,
      agg_max,
      agg_avg,
      computed_at
    )
    SELECT
      a.organization_id,
      a.dataset_id,
      a.workspace_id,
      a.metric_type,
      a.period_type,
      a.period_start,
      a.region,
      a.segment,
      a.agg_sum,
      a.agg_count::integer,
      a.agg_min,
      a.agg_max,
      a.agg_avg,
      now()
    FROM aggregated a
    ON CONFLICT (organization_id, dataset_id, metric_type, period_type, period_start, region, segment)
    DO UPDATE SET
      workspace_id = EXCLUDED.workspace_id,
      agg_sum = EXCLUDED.agg_sum,
      agg_count = EXCLUDED.agg_count,
      agg_min = EXCLUDED.agg_min,
      agg_max = EXCLUDED.agg_max,
      agg_avg = EXCLUDED.agg_avg,
      computed_at = EXCLUDED.computed_at
    RETURNING 1
  )
  SELECT
    (SELECT count(*)::bigint FROM upserted),
    COALESCE((
      SELECT sum(a.agg_count)::bigint
      FROM aggregated a
      WHERE a.period_type = _period_types[1]
    ), 0::bigint);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_metric_aggregates_scoped(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_metric_aggregates_scoped(uuid, uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.refresh_metric_aggregates_scoped(uuid, uuid, text[]) IS
  'Set-based metric aggregate refresh. Returns aggregate rows upserted and source metric rows scanned without transferring the metric set through an Edge Function.';
