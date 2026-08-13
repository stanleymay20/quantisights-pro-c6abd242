
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'ingest_external_signals_hourly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Helper: read cron secret from Vault at job execution time
CREATE OR REPLACE FUNCTION public.get_ingest_cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'ingest_cron_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_ingest_cron_secret() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'ingest_external_signals_hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-external-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(public.get_ingest_cron_secret(), '')
    ),
    body := jsonb_build_object('mode', 'scheduled', 'triggered_by', 'cron')
  );
  $cron$
);
