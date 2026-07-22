-- ─── Enterprise Connector Types ───────────────────────────────────────────────
-- Extends the connector_type enum with all CRM/ERP/SaaS/cloud connector types
-- required for the enterprise connector suite.
-- Also adds missing columns to data_connectors for per-org credential storage.

-- Extend connector_type enum
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'salesforce';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'hubspot';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'dynamics';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'sap_odata';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'netsuite';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'xero';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'stripe';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'google_analytics';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'google_sheets';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'sqlserver';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 's3';
ALTER TYPE public.connector_type ADD VALUE IF NOT EXISTS 'powerbi';

-- Add data_source_id foreign key for linking to data_sources
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS data_source_id uuid REFERENCES public.data_sources(id) ON DELETE SET NULL;

-- Add index for the new FK
CREATE INDEX IF NOT EXISTS idx_data_connectors_data_source
  ON public.data_connectors(data_source_id)
  WHERE data_source_id IS NOT NULL;

-- Add last_synced_at column (used by pull functions)
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Add credential_vault_keys JSONB column for per-field vault key mapping
-- (maps field name → vault secret name for multi-credential connectors like Salesforce)
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS credential_vault_keys jsonb DEFAULT '{}'::jsonb;

-- ─── pg_cron: schedule daily executive briefs ──────────────────────────────
-- Requires pg_cron extension (available in Supabase Pro)
-- Runs the morning-brief edge function at 07:00 UTC every day

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.schedule(
      'daily-morning-brief',
      '0 7 * * *',   -- 07:00 UTC daily
      $$
        SELECT net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/morning-brief',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be available in all environments; silently skip
  NULL;
END $$;

-- ─── pg_cron: schedule connector sync every hour ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'hourly-connector-sync',
      '0 * * * *',   -- top of every hour
      $$
        SELECT net.http_post(
          url := current_setting('app.supabase_url') || '/functions/v1/connector-scheduler',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.service_role_key')
          ),
          body := '{}'::jsonb
        ) AS request_id;
      $$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
