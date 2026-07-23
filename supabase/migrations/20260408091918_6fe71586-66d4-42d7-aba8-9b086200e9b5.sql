-- Fix hardcoded date in partial index: drop old, create proper one
DROP INDEX IF EXISTS idx_exec_interventions_metrics;
CREATE INDEX idx_exec_interventions_metrics
  ON public.execution_interventions (organization_id, created_at DESC);

-- Add missing index for run_log operational metrics aggregation
CREATE INDEX IF NOT EXISTS idx_exec_run_log_org_type_time
  ON public.execution_run_log (organization_id, run_type, started_at DESC);

-- Retention cleanup function for execution tables
CREATE OR REPLACE FUNCTION public.exec_cleanup_old_data(
  _events_retain_days integer DEFAULT 180,
  _predictions_retain_days integer DEFAULT 90,
  _scores_retain_days integer DEFAULT 365,
  _run_log_retain_days integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _events_deleted integer;
  _predictions_deleted integer;
  _scores_deleted integer;
  _run_log_deleted integer;
BEGIN
  -- Execution events older than retention window
  DELETE FROM public.execution_events
  WHERE created_at < now() - (_events_retain_days || ' days')::interval;
  GET DIAGNOSTICS _events_deleted = ROW_COUNT;

  -- Only superseded predictions beyond retention window (keep active ones forever)
  DELETE FROM public.execution_predictions
  WHERE is_active = false
    AND superseded_at IS NOT NULL
    AND superseded_at < now() - (_predictions_retain_days || ' days')::interval;
  GET DIAGNOSTICS _predictions_deleted = ROW_COUNT;

  -- Old scores beyond retention window
  DELETE FROM public.execution_scores
  WHERE computed_at < now() - (_scores_retain_days || ' days')::interval;
  GET DIAGNOSTICS _scores_deleted = ROW_COUNT;

  -- Old run logs
  DELETE FROM public.execution_run_log
  WHERE started_at < now() - (_run_log_retain_days || ' days')::interval;
  GET DIAGNOSTICS _run_log_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'events_deleted', _events_deleted,
    'predictions_deleted', _predictions_deleted,
    'scores_deleted', _scores_deleted,
    'run_log_deleted', _run_log_deleted,
    'executed_at', now()
  );
END;
$$;