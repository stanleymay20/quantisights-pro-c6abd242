-- Drain the durable metric-ingestion queue with the same Vault-routed cron
-- authentication used by the rest of Quantivis. Throughput is controlled by
-- metric_ingest_queue_state.batch_size rather than by changing application code.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'project_url'
      AND decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$'
  ) THEN
    RAISE EXCEPTION 'Cannot schedule metric ingest worker: valid Vault project_url is missing';
  END IF;

  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    RAISE EXCEPTION 'Cannot schedule metric ingest worker: ingest_cron_secret is missing';
  END IF;

  BEGIN
    PERFORM cron.unschedule('metric-ingest-queue-worker');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

SELECT cron.schedule(
  'metric-ingest-queue-worker',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/process-metric-ingest-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := '{}'::jsonb
  );
  $cron$
);
