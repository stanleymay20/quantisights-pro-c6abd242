-- =============================================================================
-- Schedule the daily trust-metrics evidence scan.
-- =============================================================================
-- compute-trust-metrics (supabase/functions/compute-trust-metrics) computes a
-- real, provenance-cited snapshot of RLS/audit/explainability/retention/
-- connector-health/data-quality/drift coverage and writes it to
-- trust_metrics_snapshots (see migration 20260526192943). The function itself
-- has always been correct and honest about missing evidence -- but nothing
-- ever scheduled it, so trust_metrics_snapshots stayed empty and the live
-- Trust Center correctly, but unhelpfully, fell back to "No trust snapshot
-- yet" / zero values indefinitely. This was misread externally as fabricated
-- or permanently-zero metrics; the real cause was a missing pg_cron entry,
-- not a computation bug.
--
-- Follows the same net.http_post + x-cron-secret pattern as the other
-- scheduled jobs (see migration 20260426061858).
-- =============================================================================

DO $$
BEGIN
  PERFORM cron.unschedule('compute-trust-metrics-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'compute-trust-metrics-daily',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/compute-trust-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(public.get_ingest_cron_secret(), '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $cron$
);
