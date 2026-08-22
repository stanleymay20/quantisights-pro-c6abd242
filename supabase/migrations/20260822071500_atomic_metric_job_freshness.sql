-- Make terminal queued-ingestion state and dataset freshness one transaction.
-- A job must never be recorded completed/partial while the dataset still carries
-- an older freshness timestamp because the worker crashed between two writes.

CREATE OR REPLACE FUNCTION public.record_metric_ingest_chunk_result(
  _chunk_id text,
  _job_id uuid,
  _organization_id uuid,
  _dataset_id uuid,
  _inserted integer,
  _failed boolean,
  _error_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted_marker integer;
  _job public.data_sync_jobs%ROWTYPE;
  _status text;
BEGIN
  INSERT INTO public.metric_ingest_chunk_results (
    chunk_id, job_id, organization_id, dataset_id, status, inserted_count, error_message
  ) VALUES (
    _chunk_id,
    _job_id,
    _organization_id,
    _dataset_id,
    CASE WHEN _failed THEN 'failed' ELSE 'completed' END,
    GREATEST(_inserted, 0),
    CASE WHEN _error_message IS NULL THEN NULL ELSE left(_error_message, 2000) END
  )
  ON CONFLICT (chunk_id) DO NOTHING;

  GET DIAGNOSTICS _inserted_marker = ROW_COUNT;

  IF _inserted_marker = 0 THEN
    SELECT status INTO _status FROM public.data_sync_jobs WHERE id = _job_id;
    IF _status IS NULL THEN RAISE EXCEPTION 'Metric ingest sync job % not found', _job_id; END IF;
    RETURN _status;
  END IF;

  UPDATE public.data_sync_jobs
  SET
    status = 'running',
    records_synced = COALESCE(records_synced, 0) + GREATEST(_inserted, 0),
    chunks_completed = chunks_completed + CASE WHEN _failed THEN 0 ELSE 1 END,
    chunks_failed = chunks_failed + CASE WHEN _failed THEN 1 ELSE 0 END,
    error_message = CASE
      WHEN _error_message IS NULL OR btrim(_error_message) = '' THEN error_message
      WHEN error_message IS NULL OR error_message = '' THEN left(_error_message, 2000)
      ELSE left(error_message || '; ' || _error_message, 2000)
    END,
    last_progress_at = now()
  WHERE id = _job_id
    AND organization_id = _organization_id
  RETURNING * INTO _job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Metric ingest sync job % not found for organization %', _job_id, _organization_id;
  END IF;

  IF (_job.chunks_completed + _job.chunks_failed) >= _job.chunks_total AND _job.chunks_total > 0 THEN
    _status := CASE
      WHEN _job.chunks_completed = 0 THEN 'failed'
      WHEN _job.chunks_failed > 0 THEN 'partial'
      ELSE 'completed'
    END;

    UPDATE public.data_sync_jobs
    SET status = _status,
        completed_at = now(),
        last_progress_at = now()
    WHERE id = _job_id
      AND organization_id = _organization_id;

    IF _status IN ('completed', 'partial') THEN
      UPDATE public.datasets
      SET last_refreshed_at = now(),
          status = 'active'
      WHERE id = _dataset_id
        AND organization_id = _organization_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Dataset % not found for organization % while finalizing metric ingest job %',
          _dataset_id, _organization_id, _job_id;
      END IF;
    END IF;

    RETURN _status;
  END IF;

  RETURN 'running';
END;
$$;

COMMENT ON FUNCTION public.record_metric_ingest_chunk_result(text, uuid, uuid, uuid, integer, boolean, text) IS
  'Idempotently records one queue chunk and atomically finalizes job + dataset freshness when all chunks are terminal.';
