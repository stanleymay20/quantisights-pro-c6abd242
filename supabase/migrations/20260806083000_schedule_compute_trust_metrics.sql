-- =============================================================================
-- Schedule the daily trust-metrics evidence scan.
-- =============================================================================
-- compute-trust-metrics (supabase/functions/compute-trust-metrics) writes a
-- provenance-cited snapshot to trust_metrics_snapshots (see migration
-- 20260526192943). The live project also lacked a scheduler, so the table
-- stayed empty and the Trust Center fell back to "No trust snapshot yet" / zero
-- values indefinitely. The function has since been tightened so absent or
-- failed evidence queries remain unknown instead of becoming favorable
-- defaults.
--
-- Follows Supabase's documented Vault + net.http_post pattern. Each hosted
-- project must define its own `project_url` Vault value, preventing staging
-- schedules from ever calling the production project by accident.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
      AND decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$'
  ) THEN
    RAISE EXCEPTION
      'Vault secret project_url is missing or invalid; refusing to create a cross-environment cron schedule';
  END IF;
END
$$;

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
    url := rtrim(
      (SELECT decrypted_secret
       FROM vault.decrypted_secrets
       WHERE name = 'project_url'),
      '/'
    ) || '/functions/v1/compute-trust-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(public.get_ingest_cron_secret(), '')
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $cron$
);
