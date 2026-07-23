
-- 1. Elevated role check for executive overrides
CREATE OR REPLACE FUNCTION public.exec_require_elevated_role(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner', 'admin')
  )
$$;

-- 2. Inferred blocker detection: finds plans that are likely blocked
--    by upstream plans in the same decision based on status + deadline ordering
CREATE OR REPLACE FUNCTION public.exec_infer_blockers(_org_id uuid)
RETURNS TABLE(
  plan_id uuid,
  inferred_blocker_id uuid,
  blocker_status text,
  blocker_action_title text,
  plan_action_title text,
  reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Plans that share a decision_id where an earlier-deadline plan
  -- is still pending/in_progress/blocked, potentially blocking a later plan
  SELECT
    downstream.id AS plan_id,
    upstream.id AS inferred_blocker_id,
    upstream.status AS blocker_status,
    upstream.action_title AS blocker_action_title,
    downstream.action_title AS plan_action_title,
    'Upstream plan in same decision is ' || upstream.status || ' (created earlier, deadline earlier or equal)' AS reason
  FROM public.execution_plans upstream
  JOIN public.execution_plans downstream
    ON upstream.decision_id = downstream.decision_id
    AND upstream.organization_id = downstream.organization_id
    AND upstream.id != downstream.id
  WHERE upstream.organization_id = _org_id
    AND upstream.status IN ('pending', 'in_progress', 'blocked')
    AND downstream.status IN ('pending', 'in_progress', 'blocked')
    -- upstream was created before downstream
    AND upstream.created_at < downstream.created_at
    -- upstream deadline is before or equal to downstream (or upstream has no deadline)
    AND (upstream.deadline IS NULL OR downstream.deadline IS NULL OR upstream.deadline <= downstream.deadline)
    -- downstream is not already explicitly linked
    AND downstream.blocked_by_plan_id IS NULL
  ORDER BY downstream.decision_id, upstream.created_at
$$;

-- 3. Operational metrics: server-side aggregation of engine performance
CREATE OR REPLACE FUNCTION public.exec_operational_metrics(_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _engine_stats jsonb;
  _intervention_stats jsonb;
  _dedupe_stats jsonb;
BEGIN
  -- Engine latency stats (P50, P95, total runs, errors) by run_type
  SELECT COALESCE(jsonb_object_agg(run_type, stats), '{}'::jsonb)
  INTO _engine_stats
  FROM (
    SELECT
      run_type,
      jsonb_build_object(
        'total_runs', COUNT(*),
        'errors', COUNT(*) FILTER (WHERE status = 'failed'),
        'p50_ms', COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms), 0),
        'p95_ms', COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0),
        'avg_ms', COALESCE(AVG(duration_ms), 0),
        'max_ms', COALESCE(MAX(duration_ms), 0),
        'last_run', MAX(started_at)
      ) AS stats
    FROM public.execution_run_log
    WHERE organization_id = _org_id
      AND started_at > now() - interval '30 days'
    GROUP BY run_type
  ) sub;

  -- Intervention conversion: created vs resolved
  SELECT jsonb_build_object(
    'total_created', COUNT(*),
    'total_resolved', COUNT(*) FILTER (WHERE resolved = true),
    'resolution_rate', CASE WHEN COUNT(*) > 0
      THEN ROUND((COUNT(*) FILTER (WHERE resolved = true))::numeric / COUNT(*)::numeric * 100, 1)
      ELSE 0 END,
    'auto_triggered', COUNT(*) FILTER (WHERE auto_triggered = true),
    'manual_triggered', COUNT(*) FILTER (WHERE auto_triggered = false),
    'avg_resolution_hours', COALESCE(
      ROUND(EXTRACT(EPOCH FROM AVG(resolved_at - created_at) FILTER (WHERE resolved = true)) / 3600, 1),
      0
    )
  )
  INTO _intervention_stats
  FROM public.execution_interventions
  WHERE organization_id = _org_id
    AND created_at > now() - interval '30 days';

  -- Dedupe effectiveness: check audit logs for bulk_interventions_created
  SELECT jsonb_build_object(
    'scan_runs', COUNT(*),
    'total_duplicates_prevented', COALESCE(SUM((payload->>'skipped_duplicates')::int), 0),
    'total_interventions_created', COALESCE(SUM((payload->>'created')::int), 0)
  )
  INTO _dedupe_stats
  FROM public.audit_log
  WHERE organization_id = _org_id
    AND action_type = 'bulk_interventions_created'
    AND created_at > now() - interval '30 days';

  _result := jsonb_build_object(
    'engine_performance', _engine_stats,
    'intervention_metrics', _intervention_stats,
    'dedupe_effectiveness', _dedupe_stats,
    'computed_at', now(),
    'window_days', 30
  );

  RETURN _result;
END;
$$;

-- 4. Supporting indexes
CREATE INDEX IF NOT EXISTS idx_exec_plans_decision_status
  ON public.execution_plans (organization_id, decision_id, status);

CREATE INDEX IF NOT EXISTS idx_exec_interventions_metrics
  ON public.execution_interventions (organization_id, created_at DESC)
  WHERE created_at > '2025-01-01'::timestamptz;

CREATE INDEX IF NOT EXISTS idx_exec_run_log_metrics
  ON public.execution_run_log (organization_id, run_type, started_at DESC);
