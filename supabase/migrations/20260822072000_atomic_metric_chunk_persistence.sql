-- Persist one canonical metric chunk and its durable progress marker in the
-- same PostgreSQL transaction. This removes the worker-side gap where metric
-- rows could commit but the chunk/job ledger could fail separately.

CREATE OR REPLACE FUNCTION public.persist_metric_ingest_chunk(
  _chunk_id text,
  _job_id uuid,
  _organization_id uuid,
  _dataset_id uuid,
  _data_source_id uuid,
  _metrics jsonb
)
RETURNS TABLE(job_status text, chunk_status text, persisted_count integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing public.metric_ingest_chunk_results%ROWTYPE;
  _persisted integer := 0;
  _job_status text;
BEGIN
  IF _metrics IS NULL OR jsonb_typeof(_metrics) <> 'array' THEN
    RAISE EXCEPTION 'metrics must be a JSON array';
  END IF;
  IF jsonb_array_length(_metrics) < 1 OR jsonb_array_length(_metrics) > 1000 THEN
    RAISE EXCEPTION 'metric chunk must contain 1..1000 rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.datasets
    WHERE id = _dataset_id AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'dataset does not belong to organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.data_sources
    WHERE id = _data_source_id AND organization_id = _organization_id
  ) THEN
    RAISE EXCEPTION 'data source does not belong to organization';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.data_sync_jobs
    WHERE id = _job_id
      AND organization_id = _organization_id
      AND data_source_id = _data_source_id
  ) THEN
    RAISE EXCEPTION 'sync job does not belong to organization/source';
  END IF;

  SELECT * INTO _existing
  FROM public.metric_ingest_chunk_results
  WHERE chunk_id = _chunk_id
    AND job_id = _job_id
    AND organization_id = _organization_id;

  IF FOUND THEN
    SELECT status INTO _job_status FROM public.data_sync_jobs WHERE id = _job_id;
    RETURN QUERY SELECT _job_status, _existing.status, _existing.inserted_count;
    RETURN;
  END IF;

  INSERT INTO public.metrics (
    organization_id,
    dataset_id,
    metric_type,
    date,
    value,
    region,
    segment,
    source_id,
    source_type,
    quality_score
  )
  SELECT
    _organization_id,
    _dataset_id,
    x.metric_type,
    x.date,
    x.value,
    COALESCE(x.region, ''),
    COALESCE(x.segment, ''),
    _data_source_id,
    COALESCE(NULLIF(x.source_type, ''), 'queued_api'),
    LEAST(100, GREATEST(0, COALESCE(x.quality_score, 85)))
  FROM jsonb_to_recordset(_metrics) AS x(
    metric_type text,
    date date,
    value numeric,
    region text,
    segment text,
    source_type text,
    quality_score numeric
  )
  WHERE x.metric_type IS NOT NULL
    AND btrim(x.metric_type) <> ''
    AND length(x.metric_type) <= 200
    AND x.date IS NOT NULL
    AND x.value IS NOT NULL
    AND abs(x.value) <= 1000000000000
  ON CONFLICT (organization_id, dataset_id, metric_type, date, region, segment, source_id)
  DO UPDATE SET
    value = EXCLUDED.value,
    source_type = EXCLUDED.source_type,
    quality_score = EXCLUDED.quality_score;

  GET DIAGNOSTICS _persisted = ROW_COUNT;

  IF _persisted <> jsonb_array_length(_metrics) THEN
    RAISE EXCEPTION 'validated chunk row count mismatch: expected %, persisted %',
      jsonb_array_length(_metrics), _persisted;
  END IF;

  SELECT public.record_metric_ingest_chunk_result(
    _chunk_id,
    _job_id,
    _organization_id,
    _dataset_id,
    _persisted,
    false,
    NULL
  ) INTO _job_status;

  RETURN QUERY SELECT _job_status, 'completed'::text, _persisted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.persist_metric_ingest_chunk(text, uuid, uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_metric_ingest_chunk(text, uuid, uuid, uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.persist_metric_ingest_chunk(text, uuid, uuid, uuid, uuid, jsonb) IS
  'Atomically revalidates queue scope, upserts one canonical metric chunk, records idempotent chunk progress, and finalizes job/freshness when appropriate.';
