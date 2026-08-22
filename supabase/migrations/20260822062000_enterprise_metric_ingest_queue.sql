-- Durable enterprise metric-ingestion buffer.
-- Reuses the pgmq extension already deployed for email infrastructure.
-- High-velocity producers can enqueue bounded canonical metric chunks and return
-- quickly while workers drain at a controlled rate with visibility timeouts and
-- a dead-letter path.

CREATE EXTENSION IF NOT EXISTS pgmq;

DO $$ BEGIN PERFORM pgmq.create('metric_ingest'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM pgmq.create('metric_ingest_dlq'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE public.data_sync_jobs
  ADD COLUMN IF NOT EXISTS chunks_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunks_completed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chunks_failed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_queue_progress
  ON public.data_sync_jobs (status, queued_at)
  WHERE status IN ('pending', 'running');

CREATE TABLE IF NOT EXISTS public.metric_ingest_queue_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paused boolean NOT NULL DEFAULT false,
  batch_size integer NOT NULL DEFAULT 20 CHECK (batch_size BETWEEN 1 AND 100),
  visibility_timeout_seconds integer NOT NULL DEFAULT 120 CHECK (visibility_timeout_seconds BETWEEN 30 AND 900),
  max_retries integer NOT NULL DEFAULT 5 CHECK (max_retries BETWEEN 1 AND 20),
  max_queue_depth bigint NOT NULL DEFAULT 100000 CHECK (max_queue_depth >= 1000),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.metric_ingest_queue_state (id) VALUES (1) ON CONFLICT DO NOTHING;
GRANT ALL ON public.metric_ingest_queue_state TO service_role;
ALTER TABLE public.metric_ingest_queue_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages metric ingest queue state"
    ON public.metric_ingest_queue_state FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_metric_ingest(payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.send('metric_ingest', payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('metric_ingest');
  RETURN pgmq.send('metric_ingest', payload);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_metric_ingest_batch(_batch_size integer, _vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, enqueued_at timestamptz, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY
  SELECT r.msg_id, r.read_ct, r.enqueued_at, r.message
  FROM pgmq.read('metric_ingest', _vt, _batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create('metric_ingest');
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_metric_ingest(_message_id bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete('metric_ingest', _message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.move_metric_ingest_to_dlq(_message_id bigint, _payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE _new_id bigint;
BEGIN
  BEGIN
    SELECT pgmq.send('metric_ingest_dlq', _payload) INTO _new_id;
  EXCEPTION WHEN undefined_table THEN
    PERFORM pgmq.create('metric_ingest_dlq');
    SELECT pgmq.send('metric_ingest_dlq', _payload) INTO _new_id;
  END;
  PERFORM pgmq.delete('metric_ingest', _message_id);
  RETURN _new_id;
END;
$$;

-- Atomic queue-progress accounting. A job completes only after every queued
-- chunk has either persisted or been moved to the DLQ.
CREATE OR REPLACE FUNCTION public.advance_metric_ingest_job(
  _job_id uuid,
  _inserted integer,
  _failed boolean,
  _error_message text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _job public.data_sync_jobs%ROWTYPE;
  _status text;
BEGIN
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
  RETURNING * INTO _job;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Metric ingest sync job % not found', _job_id;
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

REVOKE EXECUTE ON FUNCTION public.enqueue_metric_ingest(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_metric_ingest_batch(integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_metric_ingest(bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_metric_ingest_to_dlq(bigint, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.advance_metric_ingest_job(uuid, integer, boolean, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.enqueue_metric_ingest(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_metric_ingest_batch(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_metric_ingest(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_metric_ingest_to_dlq(bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_metric_ingest_job(uuid, integer, boolean, text) TO service_role;
