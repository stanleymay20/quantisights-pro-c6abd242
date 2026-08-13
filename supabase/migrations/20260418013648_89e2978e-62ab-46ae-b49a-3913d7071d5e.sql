
-- Ensure pg_cron + pg_net extensions present
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop existing job if it was registered before
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'ingest_external_signals_hourly';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Schedule hourly invocation of the ingest edge function
SELECT cron.schedule(
  'ingest_external_signals_hourly',
  '7 * * * *',  -- 7 minutes past every hour
  $$
  SELECT net.http_post(
    url := 'https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/ingest-external-signals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('mode', 'scheduled')
  );
  $$
);
