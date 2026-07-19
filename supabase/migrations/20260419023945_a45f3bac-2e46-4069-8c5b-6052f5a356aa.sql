
-- 0. Dedupe existing internal_reference_data first
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY
        COALESCE(metadata->>'organization_id', '00000000-0000-0000-0000-000000000000'),
        metric_name,
        source,
        COALESCE(period_start, '1900-01-01'::date)
      ORDER BY created_at DESC
    ) AS rn
  FROM public.internal_reference_data
)
DELETE FROM public.internal_reference_data
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 1. Unique constraint preventing future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS ux_internal_reference_dedupe
  ON public.internal_reference_data (
    COALESCE(metadata->>'organization_id', '00000000-0000-0000-0000-000000000000'),
    metric_name,
    source,
    COALESCE(period_start, '1900-01-01'::date)
  );

-- 2. Idempotent replay key on data_sync_jobs
CREATE INDEX IF NOT EXISTS ix_data_sync_jobs_request
  ON public.data_sync_jobs (organization_id, request_id)
  WHERE request_id IS NOT NULL;

-- 3. Re-register the hourly cron with proper Vault-based auth
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'ingest_external_signals_hourly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Helper function: pulls service token from Vault at call time
CREATE OR REPLACE FUNCTION public.get_ingest_service_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'ingest_service_token'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_ingest_service_token() FROM PUBLIC, anon, authenticated;

-- Schedule hourly ingestion at minute 7 of every hour
SELECT cron.schedule(
  'ingest_external_signals_hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-external-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(public.get_ingest_service_token(), '')
    ),
    body := jsonb_build_object('mode', 'scheduled', 'triggered_by', 'cron')
  );
  $cron$
);
