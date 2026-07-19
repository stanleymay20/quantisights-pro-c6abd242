CREATE OR REPLACE FUNCTION public.get_cron_health(_job_names text[])
RETURNS TABLE(
  job_name text,
  last_status text,
  last_completed_at timestamptz,
  last_started_at timestamptz,
  last_duration_ms integer,
  last_error text,
  runs_last_24h bigint,
  failures_last_24h bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT job_name, status, completed_at, started_at, duration_ms, error_message
    FROM public.cron_run_log
    WHERE started_at > now() - interval '24 hours'
      AND job_name = ANY(_job_names)
  ),
  latest AS (
    SELECT DISTINCT ON (job_name)
      job_name, status, completed_at, started_at, duration_ms, error_message
    FROM public.cron_run_log
    WHERE job_name = ANY(_job_names)
    ORDER BY job_name, started_at DESC
  )
  SELECT
    j AS job_name,
    l.status AS last_status,
    l.completed_at AS last_completed_at,
    l.started_at AS last_started_at,
    l.duration_ms AS last_duration_ms,
    CASE WHEN l.status = 'failed' THEN l.error_message END AS last_error,
    COALESCE((SELECT count(*) FROM recent r WHERE r.job_name = j AND r.status <> 'skipped_overlap'), 0)::bigint AS runs_last_24h,
    COALESCE((SELECT count(*) FROM recent r WHERE r.job_name = j AND r.status = 'failed'), 0)::bigint AS failures_last_24h
  FROM unnest(_job_names) AS j
  LEFT JOIN latest l ON l.job_name = j
$$;

GRANT EXECUTE ON FUNCTION public.get_cron_health(text[]) TO authenticated, service_role;