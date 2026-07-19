-- =============================================================================
-- Autonomous orchestration scheduling
-- =============================================================================
-- Uses Vault-stored secrets (ingest_cron_secret) and the project anon key for
-- edge-function invocation via pg_net. All jobs are idempotent — re-running
-- this migration unschedules and re-schedules each job cleanly.
-- =============================================================================

-- Helper: safely unschedule if exists
DO $$
DECLARE
  _job text;
BEGIN
  FOR _job IN SELECT unnest(ARRAY[
    'aicis-scheduled-sync',
    'executive-orchestration-loop',
    'execution-intelligence-rollup',
    'aicis-immediate-bootstrap'
  ]) LOOP
    BEGIN
      PERFORM cron.unschedule(_job);
    EXCEPTION WHEN OTHERS THEN
      -- job didn't exist, ignore
      NULL;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- Job 1: AICIS scheduled sync — every 6 hours
-- Calls ingest-external-signals in scheduled mode; the function picks up any
-- source whose next_refresh_at < now() and respects per-org tier policy.
-- =============================================================================
SELECT cron.schedule(
  'aicis-scheduled-sync',
  '0 */6 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-external-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object('mode', 'scheduled', 'triggered_by', 'pg_cron')
  );
  $cron$
);

-- =============================================================================
-- Job 2: Executive orchestration loop — every 30 minutes
-- Fans out per active-subscription org. Each call triggers compute-kpi,
-- compute-executive-signals, diagnostic-engine, prescriptive-advisory,
-- executive-convergence, and conditional alerting.
-- =============================================================================
SELECT cron.schedule(
  'executive-orchestration-loop',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/executive-orchestration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cHdwbnd6eml0a2VsZmZ0dHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTIxNTMsImV4cCI6MjA4NzM2ODE1M30.sjrNIlSiU_udZXmE4o822K0bOmbhqNCk_47mSKK86xY',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object(
      'organization_id', s.organization_id,
      'trigger_type', 'cron'
    )
  )
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.organization_id IS NOT NULL;
  $cron$
);

-- =============================================================================
-- Job 3: Execution intelligence rollup — every 15 minutes
-- Refreshes execution_scores and execution_predictions per active org.
-- =============================================================================
SELECT cron.schedule(
  'execution-intelligence-rollup',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/execution-intelligence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0cHdwbnd6eml0a2VsZmZ0dHl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3OTIxNTMsImV4cCI6MjA4NzM2ODE1M30.sjrNIlSiU_udZXmE4o822K0bOmbhqNCk_47mSKK86xY',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object(
      'organization_id', s.organization_id,
      'mode', 'rollup',
      'triggered_by', 'pg_cron'
    )
  )
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.organization_id IS NOT NULL;
  $cron$
);

-- =============================================================================
-- Job 4: One-shot AICIS bootstrap — fires once in 1 minute, then self-removes
-- Forces an immediate backfill so we don't wait 6 hours for first data.
-- The cleanup runs via the scheduled job's NEXT execution which checks for
-- and removes 'aicis-immediate-bootstrap' if it has already executed.
-- =============================================================================

-- Force next_refresh_at to NOW so the scheduled run picks it up immediately
UPDATE public.external_data_sources
SET next_refresh_at = now() - interval '1 minute',
    last_error = NULL
WHERE vendor_key = 'aicis' AND is_active = true;

-- Schedule a one-shot to fire 1 minute from now
SELECT cron.schedule(
  'aicis-immediate-bootstrap',
  '* * * * *',
  $cron$
  DO $$
  BEGIN
    PERFORM net.http_post(
      url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-external-signals',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', public.get_ingest_cron_secret()
      ),
      body := jsonb_build_object('mode', 'scheduled', 'triggered_by', 'bootstrap')
    );
    -- Self-remove after first execution
    PERFORM cron.unschedule('aicis-immediate-bootstrap');
  EXCEPTION WHEN OTHERS THEN
    PERFORM cron.unschedule('aicis-immediate-bootstrap');
  END $$;
  $cron$
);