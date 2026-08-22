-- Race-safe admission control for the enterprise metric queue.
-- `max_queue_depth` is measured in outstanding queue chunks. Admission is
-- serialized through a row lock on metric_ingest_queue_state so concurrent
-- producers cannot all observe the same free capacity and overfill the queue.

CREATE OR REPLACE FUNCTION public.enqueue_metric_ingest_job(
  _job_id uuid,
  _organization_id uuid,
  _data_source_id uuid,
  _chunks jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
  _chunk jsonb;
  _count integer;
  _job_exists boolean;
  _max_depth bigint;
  _paused boolean;
  _outstanding bigint;
BEGIN
  IF _chunks IS NULL OR jsonb_typeof(_chunks) <> 'array' THEN
    RAISE EXCEPTION 'chunks must be a JSON array';
  END IF;

  _count := jsonb_array_length(_chunks);
  IF _count < 1 OR _count > 200 THEN
    RAISE EXCEPTION 'chunk count % is outside allowed range 1..200', _count;
  END IF;

  -- Serialize admission decisions. This makes the backlog check authoritative
  -- even when many API producers arrive concurrently.
  SELECT max_queue_depth, paused
    INTO _max_depth, _paused
  FROM public.metric_ingest_queue_state
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'metric ingest queue state is missing';
  END IF;
  IF _paused THEN
    RAISE EXCEPTION 'METRIC_QUEUE_PAUSED';
  END IF;

  SELECT COALESCE(sum(GREATEST(chunks_total - chunks_completed - chunks_failed, 0)), 0)
    INTO _outstanding
  FROM public.data_sync_jobs
  WHERE status IN ('pending', 'running')
    AND chunks_total > 0;

  IF _outstanding + _count > _max_depth THEN
    RAISE EXCEPTION 'METRIC_QUEUE_BACKPRESSURE outstanding=% incoming=% limit=%',
      _outstanding, _count, _max_depth;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.data_sync_jobs
    WHERE id = _job_id
      AND organization_id = _organization_id
      AND data_source_id = _data_source_id
      AND status IN ('pending', 'running')
  ) INTO _job_exists;

  IF NOT _job_exists THEN
    RAISE EXCEPTION 'sync job does not belong to organization/source or is not enqueueable';
  END IF;

  FOREACH _chunk IN ARRAY ARRAY(SELECT jsonb_array_elements(_chunks))
  LOOP
    IF COALESCE(_chunk->>'job_id', '') <> _job_id::text
       OR COALESCE(_chunk->>'organization_id', '') <> _organization_id::text
       OR COALESCE(_chunk->>'data_source_id', '') <> _data_source_id::text THEN
      RAISE EXCEPTION 'chunk envelope does not match sync job scope';
    END IF;
    PERFORM pgmq.send('metric_ingest', _chunk);
  END LOOP;

  UPDATE public.data_sync_jobs
  SET status = 'pending',
      chunks_total = _count,
      chunks_completed = 0,
      chunks_failed = 0,
      records_synced = 0,
      error_message = NULL,
      queued_at = now(),
      last_progress_at = now(),
      completed_at = NULL
  WHERE id = _job_id
    AND organization_id = _organization_id
    AND data_source_id = _data_source_id;

  RETURN _count;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('metric_ingest');
  RAISE EXCEPTION 'metric_ingest queue was missing and has been recreated; retry enqueue so the full job remains atomic';
END;
$$;

COMMENT ON FUNCTION public.enqueue_metric_ingest_job(uuid, uuid, uuid, jsonb) IS
  'Atomically admits and enqueues one metric-ingestion job. Serializes admission against max_queue_depth so concurrent producers cannot overfill the durable queue.';
