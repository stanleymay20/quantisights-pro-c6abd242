-- ════════════════════════════════════════════════════════════════════════════
-- QUANTIVIS — One-shot database setup
-- Paste this entire file into: Supabase Dashboard → SQL Editor → Run
-- Safe to run multiple times (uses IF NOT EXISTS / IF EXISTS guards)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Extend connector_type enum ────────────────────────────────────────
DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ─── 2. Add missing columns to data_connectors ────────────────────────────
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS data_source_id uuid REFERENCES public.data_sources(id) ON DELETE SET NULL;

ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS credential_vault_keys jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_data_connectors_data_source
  ON public.data_connectors(data_source_id)
  WHERE data_source_id IS NOT NULL;

-- ─── 3. Auth rate limits table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key            text        PRIMARY KEY,
  attempts       integer     NOT NULL DEFAULT 1,
  window_start   bigint      NOT NULL,
  window_seconds integer     NOT NULL DEFAULT 60,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON public.auth_rate_limits(updated_at);

-- ─── 4. increment_rate_limit RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _key            text,
  _window_seconds integer DEFAULT 60
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _now bigint := extract(epoch from now())::bigint;
  _new_attempts integer;
BEGIN
  INSERT INTO public.auth_rate_limits (key, attempts, window_start, window_seconds, updated_at)
    VALUES (_key, 1, _now, _window_seconds, now())
  ON CONFLICT (key) DO UPDATE
    SET
      attempts = CASE
        WHEN (extract(epoch from now())::bigint - auth_rate_limits.window_start) > auth_rate_limits.window_seconds
          THEN 1
        ELSE auth_rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN (extract(epoch from now())::bigint - auth_rate_limits.window_start) > auth_rate_limits.window_seconds
          THEN _now
        ELSE auth_rate_limits.window_start
      END,
      updated_at = now()
  RETURNING attempts INTO _new_attempts;
  RETURN _new_attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_rate_limit TO service_role;

-- ─── 5. Verification ─────────────────────────────────────────────────────
SELECT 'Setup complete. Verify:' as status
UNION ALL
SELECT 'connector_type enum values: ' || string_agg(enumlabel, ', ')
  FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'connector_type'
UNION ALL
SELECT 'data_connectors columns: ' || string_agg(column_name, ', ')
  FROM information_schema.columns
  WHERE table_name = 'data_connectors' AND column_name IN ('last_synced_at','credential_vault_keys','data_source_id')
UNION ALL
SELECT 'auth_rate_limits table: ' || CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'auth_rate_limits') THEN 'EXISTS ✓' ELSE 'MISSING ✗' END;
