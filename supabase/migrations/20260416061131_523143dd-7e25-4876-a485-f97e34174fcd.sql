
CREATE OR REPLACE FUNCTION public.check_decision_evaluability(
  _org_id uuid,
  _dataset_id uuid DEFAULT NULL,
  _expected_metric text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _has_dataset boolean := false;
  _has_metric boolean := false;
  _data_points bigint := 0;
  _distinct_dates bigint := 0;
  _resolved_dataset_id uuid;
  _resolved_metric text;
  _reasons jsonb := '[]'::jsonb;
  _suggestions jsonb := '[]'::jsonb;
  _status text;
  _score int := 0;
BEGIN
  -- 1. Dataset check
  IF _dataset_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.datasets
      WHERE id = _dataset_id AND organization_id = _org_id AND status = 'active'
    ) INTO _has_dataset;
    _resolved_dataset_id := _dataset_id;
  ELSE
    -- Try to find any active dataset for the org
    SELECT id INTO _resolved_dataset_id
    FROM public.datasets
    WHERE organization_id = _org_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;
    _has_dataset := _resolved_dataset_id IS NOT NULL;
  END IF;

  IF _has_dataset THEN
    _score := _score + 1;
  ELSE
    _reasons := _reasons || jsonb_build_array('No active dataset linked to this decision');
    _suggestions := _suggestions || jsonb_build_array('Upload or link a dataset before approving');
  END IF;

  -- 2. Metric existence check
  IF _expected_metric IS NOT NULL AND _resolved_dataset_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.metrics
      WHERE organization_id = _org_id
        AND dataset_id = _resolved_dataset_id
        AND metric_type = _expected_metric
      LIMIT 1
    ) INTO _has_metric;
    _resolved_metric := _expected_metric;
  ELSIF _resolved_dataset_id IS NOT NULL THEN
    -- No metric specified, check if dataset has any metrics at all
    SELECT metric_type INTO _resolved_metric
    FROM public.metric_summaries
    WHERE organization_id = _org_id AND dataset_id = _resolved_dataset_id
    ORDER BY row_count DESC
    LIMIT 1;
    _has_metric := _resolved_metric IS NOT NULL;
  END IF;

  IF _has_metric THEN
    _score := _score + 1;
  ELSE
    IF _expected_metric IS NOT NULL THEN
      _reasons := _reasons || jsonb_build_array('Metric "' || _expected_metric || '" not found in dataset');
      _suggestions := _suggestions || jsonb_build_array('Ensure metric type "' || _expected_metric || '" exists in your uploaded data');
    ELSE
      _reasons := _reasons || jsonb_build_array('No metrics found in any dataset');
      _suggestions := _suggestions || jsonb_build_array('Upload data containing measurable metrics');
    END IF;
  END IF;

  -- 3. Data sufficiency check (need ≥5 distinct dates for before/after)
  IF _has_metric AND _resolved_dataset_id IS NOT NULL THEN
    SELECT COUNT(*), COUNT(DISTINCT date)
    INTO _data_points, _distinct_dates
    FROM public.metrics
    WHERE organization_id = _org_id
      AND dataset_id = _resolved_dataset_id
      AND metric_type = _resolved_metric;

    IF _distinct_dates >= 10 THEN
      _score := _score + 1;
    ELSIF _distinct_dates >= 5 THEN
      _reasons := _reasons || jsonb_build_array('Limited historical data (' || _distinct_dates || ' dates) — evaluation may be imprecise');
      _suggestions := _suggestions || jsonb_build_array('At least 10 distinct date points recommended for reliable before/after analysis');
    ELSE
      _reasons := _reasons || jsonb_build_array('Insufficient historical data (' || _distinct_dates || ' dates) for before/after evaluation');
      _suggestions := _suggestions || jsonb_build_array('Upload at least 5 date points of "' || COALESCE(_resolved_metric, 'metric') || '" data');
    END IF;
  END IF;

  -- Determine status
  _status := CASE
    WHEN _score = 3 THEN 'MEASURABLE'
    WHEN _score >= 1 THEN 'PARTIALLY_MEASURABLE'
    ELSE 'NOT_MEASURABLE'
  END;

  RETURN jsonb_build_object(
    'status', _status,
    'score', _score,
    'max_score', 3,
    'has_dataset', _has_dataset,
    'has_metric', _has_metric,
    'data_points', _data_points,
    'distinct_dates', _distinct_dates,
    'resolved_dataset_id', _resolved_dataset_id,
    'resolved_metric', _resolved_metric,
    'reasons', _reasons,
    'suggestions', _suggestions
  );
END;
$$;
