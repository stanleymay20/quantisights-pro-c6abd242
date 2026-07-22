-- Extend connector_type enum
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

-- Add columns to data_connectors
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS data_source_id uuid REFERENCES public.data_sources(id) ON DELETE SET NULL;
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.data_connectors
  ADD COLUMN IF NOT EXISTS credential_vault_keys jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_data_connectors_data_source
  ON public.data_connectors(data_source_id)
  WHERE data_source_id IS NOT NULL;

-- Auth rate limits table
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  key            text        PRIMARY KEY,
  attempts       integer     NOT NULL DEFAULT 1,
  window_start   bigint      NOT NULL,
  window_seconds integer     NOT NULL DEFAULT 60,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Service role only (edge function managed); no anon/authenticated access
GRANT ALL ON public.auth_rate_limits TO service_role;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: table is exclusively managed by service role
-- via the auth-rate-limiter edge function. RLS enabled with no policies = deny-all
-- for non-service roles, which is the desired posture.

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON public.auth_rate_limits(updated_at);

-- increment_rate_limit RPC
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  _key            text,
  _window_seconds integer DEFAULT 60
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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