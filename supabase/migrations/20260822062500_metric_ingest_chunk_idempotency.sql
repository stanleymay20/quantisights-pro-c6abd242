-- At-least-once queue delivery requires idempotency beyond the metric upsert.
-- A worker may persist a chunk and crash before deleting the PGMQ message. On
-- redelivery the upsert is safe, but job progress must not be counted twice.

CREATE TABLE IF NOT EXISTS public.metric_ingest_chunk_results (
  chunk_id text PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.data_sync_jobs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('completed', 'failed')),
  inserted_count integer NOT NULL DEFAULT 0 CHECK (inserted_count >= 0),
  error_message text,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metric_ingest_chunk_results_job
  ON public.metric_ingest_chunk_results (job_id, completed_at);

GRANT ALL ON public.metric_ingest_chunk_results TO service_role;
ALTER TABLE public.metric_ingest_chunk_results ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages metric ingest chunk results"
    ON public.metric_ingest_chunk_results FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

  -- Redelivery after the chunk result was already committed: do not advance
  -- counters again. Return the current job state to the worker.
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
    WHERE id = _job_id;

    RETURN _status;
  END IF;

  RETURN 'running';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_metric_ingest_chunk_result(text, uuid, uuid, uuid, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_metric_ingest_chunk_result(text, uuid, uuid, uuid, integer, boolean, text) TO service_role;
