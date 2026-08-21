-- =============================================================================
-- Pipeline liveness invariant
-- =============================================================================
-- A run may not remain in an in-progress state forever after its worker/edge
-- invocation has disappeared. Besides confusing operators, stale `running`
-- rows make availability and failure-rate metrics materially dishonest.
--
-- Thresholds are intentionally conservative:
--   * AICIS surface syncs are edge invocations with a 45s run budget: 15 min.
--   * Dataset/connector/orchestration jobs may legitimately take longer: 2 h.
--
-- This migration performs one reconciliation immediately and then repeats it
-- every 15 minutes. It changes bookkeeping only; it never deletes business data.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_stale_pipeline_runs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aicis integer := 0;
  v_pipeline integer := 0;
  v_connector integer := 0;
  v_data_sync integer := 0;
  v_orchestration integer := 0;
  v_execution integer := 0;
BEGIN
  UPDATE public.aicis_sync_runs
  SET status = 'failed'::public.aicis_sync_status,
      completed_at = now(),
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer,
      error_message = COALESCE(NULLIF(error_message, ''), 'Reconciled stale running sync after worker/invocation disappeared')
  WHERE status = 'running'::public.aicis_sync_status
    AND started_at < now() - interval '15 minutes';
  GET DIAGNOSTICS v_aicis = ROW_COUNT;

  UPDATE public.pipeline_runs
  SET status = 'failed',
      stage = 'failed',
      completed_at = now(),
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer,
      error_message = COALESCE(NULLIF(error_message, ''), 'Reconciled stale pipeline run after 2 hours without completion')
  WHERE status = 'running'
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_pipeline = ROW_COUNT;

  UPDATE public.connector_sync_runs
  SET status = 'failed'::public.connector_run_status,
      current_stage = 'failed',
      completed_at = now(),
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer,
      error_summary = COALESCE(NULLIF(error_summary, ''), 'Reconciled stale connector run after 2 hours without completion')
  WHERE status IN (
      'queued'::public.connector_run_status,
      'extracting'::public.connector_run_status,
      'validating'::public.connector_run_status,
      'extracted'::public.connector_run_status,
      'transforming'::public.connector_run_status,
      'transformed'::public.connector_run_status,
      'aggregating'::public.connector_run_status
    )
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_connector = ROW_COUNT;

  UPDATE public.data_sync_jobs
  SET status = 'failed',
      completed_at = now(),
      error_message = COALESCE(NULLIF(error_message, ''), 'Reconciled stale data sync job after 2 hours without completion')
  WHERE status = 'running'
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_data_sync = ROW_COUNT;

  UPDATE public.orchestration_runs
  SET status = 'failed',
      completed_at = now(),
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer,
      error_message = COALESCE(NULLIF(error_message, ''), 'Reconciled stale orchestration run after 2 hours without completion')
  WHERE status = 'running'
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_orchestration = ROW_COUNT;

  UPDATE public.execution_run_log
  SET status = 'failed',
      completed_at = now(),
      duration_ms = GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer,
      error_message = COALESCE(NULLIF(error_message, ''), 'Reconciled stale execution run after 2 hours without completion')
  WHERE status = 'running'
    AND started_at < now() - interval '2 hours';
  GET DIAGNOSTICS v_execution = ROW_COUNT;

  RETURN jsonb_build_object(
    'aicis_sync_runs', v_aicis,
    'pipeline_runs', v_pipeline,
    'connector_sync_runs', v_connector,
    'data_sync_jobs', v_data_sync,
    'orchestration_runs', v_orchestration,
    'execution_run_log', v_execution,
    'reconciled_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_stale_pipeline_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_pipeline_runs() TO service_role;

-- Repair historical stale bookkeeping as part of rollout.
SELECT public.reconcile_stale_pipeline_runs();

DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-stale-pipeline-runs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reconcile-stale-pipeline-runs',
  '*/15 * * * *',
  $cron$SELECT public.reconcile_stale_pipeline_runs();$cron$
);
