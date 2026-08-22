-- Metric queue liveness watchdog.
-- If durable work stops making progress, close NEW admissions while leaving the
-- drain worker active. Never mark queued jobs failed and never remove PGMQ
-- messages here: the worker remains the authority for durable progress/DLQ.

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_metric_queue_liveness
  ON public.data_sync_jobs (last_progress_at)
  WHERE status IN ('pending', 'running') AND chunks_total > 0;

CREATE TABLE IF NOT EXISTS public.metric_ingest_queue_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('auto_pause', 'auto_resume')),
  outstanding_chunks bigint NOT NULL DEFAULT 0,
  oldest_progress_at timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metric_ingest_queue_health_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.metric_ingest_queue_health_events TO service_role;

DO $$ BEGIN
  CREATE POLICY "Service role reads metric queue health events"
    ON public.metric_ingest_queue_health_events FOR SELECT
    USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role inserts metric queue health events"
    ON public.metric_ingest_queue_health_events FOR INSERT
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_metric_ingest_queue_health_events_created
  ON public.metric_ingest_queue_health_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.monitor_metric_ingest_queue_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state public.metric_ingest_queue_state%ROWTYPE;
  v_outstanding bigint := 0;
  v_oldest_progress timestamptz;
  v_should_pause boolean := false;
  v_should_resume boolean := false;
  v_reason text;
BEGIN
  SELECT * INTO v_state
  FROM public.metric_ingest_queue_state
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'metric ingest queue state is missing';
  END IF;

  SELECT
    COALESCE(sum(GREATEST(chunks_total - chunks_completed - chunks_failed, 0)), 0),
    min(COALESCE(last_progress_at, queued_at, started_at, created_at))
  INTO v_outstanding, v_oldest_progress
  FROM public.data_sync_jobs
  WHERE status IN ('pending', 'running')
    AND chunks_total > 0
    AND (chunks_total - chunks_completed - chunks_failed) > 0;

  -- Explicit drain maintenance is intentional. Do not reinterpret it as a
  -- worker outage or change admission state behind the operator's back.
  IF v_state.drain_paused THEN
    RETURN jsonb_build_object(
      'status', 'maintenance',
      'admission_paused', v_state.paused,
      'drain_paused', true,
      'outstanding_chunks', v_outstanding,
      'oldest_progress_at', v_oldest_progress,
      'checked_at', now()
    );
  END IF;

  v_should_pause :=
    v_outstanding > 0
    AND v_oldest_progress IS NOT NULL
    AND v_oldest_progress < now() - interval '10 minutes'
    AND (
      NOT v_state.paused
      OR COALESCE(v_state.pause_reason, '') LIKE 'auto:stalled_metric_queue%'
    );

  IF v_should_pause THEN
    v_reason := format(
      'auto:stalled_metric_queue oldest progress %s with %s outstanding chunks',
      v_oldest_progress,
      v_outstanding
    );

    IF NOT v_state.paused THEN
      UPDATE public.metric_ingest_queue_state
      SET paused = true,
          pause_reason = v_reason,
          paused_at = now(),
          updated_at = now()
      WHERE id = 1;

      INSERT INTO public.metric_ingest_queue_health_events (
        event_type, outstanding_chunks, oldest_progress_at, reason
      ) VALUES ('auto_pause', v_outstanding, v_oldest_progress, v_reason);
    ELSE
      UPDATE public.metric_ingest_queue_state
      SET pause_reason = v_reason,
          updated_at = now()
      WHERE id = 1;
    END IF;

    RETURN jsonb_build_object(
      'status', 'auto_paused',
      'admission_paused', true,
      'drain_paused', false,
      'outstanding_chunks', v_outstanding,
      'oldest_progress_at', v_oldest_progress,
      'checked_at', now()
    );
  END IF;

  -- Auto-pauses may self-heal after the worker catches up or resumes progress.
  -- Manual pauses (anything without our prefix) are never automatically cleared.
  v_should_resume :=
    v_state.paused
    AND COALESCE(v_state.pause_reason, '') LIKE 'auto:stalled_metric_queue%'
    AND (
      v_outstanding = 0
      OR v_oldest_progress IS NULL
      OR v_oldest_progress >= now() - interval '3 minutes'
    );

  IF v_should_resume THEN
    v_reason := format(
      'auto:metric_queue_recovered with %s outstanding chunks; oldest progress %s',
      v_outstanding,
      COALESCE(v_oldest_progress::text, 'none')
    );

    UPDATE public.metric_ingest_queue_state
    SET paused = false,
        pause_reason = NULL,
        paused_at = NULL,
        updated_at = now()
    WHERE id = 1;

    INSERT INTO public.metric_ingest_queue_health_events (
      event_type, outstanding_chunks, oldest_progress_at, reason
    ) VALUES ('auto_resume', v_outstanding, v_oldest_progress, v_reason);

    RETURN jsonb_build_object(
      'status', 'auto_resumed',
      'admission_paused', false,
      'drain_paused', false,
      'outstanding_chunks', v_outstanding,
      'oldest_progress_at', v_oldest_progress,
      'checked_at', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_state.paused THEN 'admission_paused' ELSE 'healthy' END,
    'admission_paused', v_state.paused,
    'drain_paused', false,
    'outstanding_chunks', v_outstanding,
    'oldest_progress_at', v_oldest_progress,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.monitor_metric_ingest_queue_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.monitor_metric_ingest_queue_health() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('monitor-metric-ingest-queue-health');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'monitor-metric-ingest-queue-health',
  '*/2 * * * *',
  $cron$SELECT public.monitor_metric_ingest_queue_health();$cron$
);
