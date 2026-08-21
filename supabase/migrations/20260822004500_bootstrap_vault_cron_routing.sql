-- =============================================================================
-- Bootstrap environment-local cron routing and remove embedded credentials
-- =============================================================================
-- Historical pg_cron jobs contain hard-coded project URLs and bearer/apikey
-- JWTs in cron.job.command. A prior hardening migration required a `project_url`
-- Vault secret, but production never had that secret, so the guard aborted
-- before the unsafe jobs could be replaced.
--
-- This repair bootstraps project_url only from the current environment's own
-- cron metadata, and only when every discovered Supabase URL agrees. It then
-- replaces the known cron-secret-capable jobs with Vault-routed calls.
-- =============================================================================

DO $$
DECLARE
  v_existing_url text;
  v_detected_url text;
  v_url_count integer;
  v_generated_cron_secret text;
  v_job text;
BEGIN
  SELECT NULLIF(decrypted_secret, '')
    INTO v_existing_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  IF v_existing_url IS NULL THEN
    WITH urls AS (
      SELECT DISTINCT (regexp_match(command, '(https://[a-z0-9-]+\.supabase\.co)'))[1] AS url
      FROM cron.job
      WHERE command ~ 'https://[a-z0-9-]+\.supabase\.co'
    )
    SELECT count(*), min(url)
      INTO v_url_count, v_detected_url
    FROM urls
    WHERE url IS NOT NULL;

    IF v_url_count <> 1 OR v_detected_url IS NULL THEN
      RAISE EXCEPTION
        'Unable to bootstrap project_url safely: expected exactly one environment-local Supabase URL in cron metadata, found %',
        v_url_count;
    END IF;

    PERFORM vault.create_secret(
      v_detected_url,
      'project_url',
      'Environment-local Supabase project URL bootstrapped from existing pg_cron metadata'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM vault.decrypted_secrets
    WHERE name = 'project_url'
      AND decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$'
  ) THEN
    RAISE EXCEPTION 'Vault project_url is missing or invalid after bootstrap';
  END IF;

  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    v_generated_cron_secret :=
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '');
    PERFORM vault.create_secret(
      v_generated_cron_secret,
      'ingest_cron_secret',
      'Environment-local secret for authenticated pg_cron Edge Function calls'
    );
  END IF;

  IF NULLIF(public.get_ingest_cron_secret(), '') IS NULL THEN
    RAISE EXCEPTION 'Unable to provision ingest_cron_secret';
  END IF;

  FOREACH v_job IN ARRAY ARRAY[
    'ingest_external_signals_hourly',
    'executive-orchestration-loop',
    'execution-intelligence-rollup',
    'connector-scheduler-every-5-min',
    'hourly-connector-sync',
    'compute-trust-metrics-daily',
    'morning-brief-daily',
    'daily-morning-brief'
  ] LOOP
    BEGIN
      PERFORM cron.unschedule(v_job);
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object('organization_id', s.organization_id, 'action', scheduled.action)
  )
  FROM public.subscriptions s
  CROSS JOIN (VALUES ('compute_scores'), ('predict_risks')) AS scheduled(action)
  WHERE s.status IN ('active', 'trialing')
    AND s.organization_id IS NOT NULL;
  $cron$
);

SELECT cron.schedule(
  'connector-scheduler-every-5-min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/connector-scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := jsonb_build_object('triggered_by', 'pg_cron')
  );
  $cron$
);

SELECT cron.schedule(
  'morning-brief-daily',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url := rtrim((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url'), '/') || '/functions/v1/morning-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', public.get_ingest_cron_secret()
    ),
    body := '{}'::jsonb
  );
  $cron$
);
