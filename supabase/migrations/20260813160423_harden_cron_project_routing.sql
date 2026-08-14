-- Replace every known project-specific or unauthenticated cron invocation
-- with environment-local Vault routing and the shared cron secret. This is a
-- forward-only repair for historical migrations that embedded the production
-- project URL and, in two cases, a production anon JWT.

DO $$
DECLARE
  job_name text;
  generated_cron_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
      AND decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$'
  ) THEN
    RAISE EXCEPTION
      'Vault secret project_url is missing or invalid; refusing to schedule cross-environment jobs';
  END IF;

  -- Cron callers and Edge Functions read the same Vault-backed secret through
  -- public.get_ingest_cron_secret(). Bootstrap an environment-local secret only
  -- when one does not already exist; never overwrite a configured value.
  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    generated_cron_secret :=
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');

    PERFORM vault.create_secret(
      generated_cron_secret,
      'ingest_cron_secret',
      'Environment-local secret for authenticated pg_cron Edge Function calls'
    );
  END IF;

  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    RAISE EXCEPTION
      'Vault secret ingest_cron_secret could not be provisioned; refusing to create cron jobs';
  END IF;

  FOREACH job_name IN ARRAY ARRAY[
    'ingest_external_signals_hourly',
    'aicis-scheduled-sync',
    'executive-orchestration-loop',
    'execution-intelligence-rollup',
    'aicis-immediate-bootstrap',
    'daily-morning-brief',
    'hourly-connector-sync',
    'compute-trust-metrics-daily'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END
$$;

SELECT cron.schedule(
  'ingest_external_signals_hourly',
  '7 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/ingest-external-signals',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := jsonb_build_object('mode', 'scheduled', 'triggered_by', 'pg_cron')
  );
  $cron$
);

SELECT cron.schedule(
  'executive-orchestration-loop',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/executive-orchestration',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := jsonb_build_object('organization_id', s.organization_id, 'trigger_type', 'cron')
  )
  FROM public.subscriptions s
  WHERE s.status IN ('active', 'trialing')
    AND s.organization_id IS NOT NULL;
  $cron$
);

SELECT cron.schedule(
  'execution-intelligence-rollup',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/execution-intelligence',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := jsonb_build_object('organization_id', s.organization_id, 'action', scheduled.action)
  )
  FROM public.subscriptions s
  CROSS JOIN (VALUES ('compute_scores'), ('predict_risks')) AS scheduled(action)
  WHERE s.status IN ('active', 'trialing')
    AND s.organization_id IS NOT NULL;
  $cron$
);

SELECT cron.schedule(
  'daily-morning-brief',
  '0 7 * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/morning-brief',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'hourly-connector-sync',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/connector-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := '{}'::jsonb
  );
  $cron$
);

SELECT cron.schedule(
  'compute-trust-metrics-daily',
  '0 5 * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/compute-trust-metrics',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.get_ingest_cron_secret()),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $cron$
);
