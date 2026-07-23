
-- AICIS Sync: enum for run status
DO $$ BEGIN
  CREATE TYPE public.aicis_sync_status AS ENUM ('pending','running','success','failed','partial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. Sync runs (one row per surface attempt)
CREATE TABLE IF NOT EXISTS public.aicis_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  surface text NOT NULL,
  status public.aicis_sync_status NOT NULL DEFAULT 'pending',
  triggered_by uuid,
  trigger_type text NOT NULL DEFAULT 'manual', -- manual | scheduled | bootstrap
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  records_pulled integer NOT NULL DEFAULT 0,
  records_inserted integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_failed integer NOT NULL DEFAULT 0,
  pages_fetched integer NOT NULL DEFAULT 0,
  last_offset integer,
  next_offset integer,
  payload_checksum text,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aicis_runs_org_started ON public.aicis_sync_runs(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_aicis_runs_org_surface ON public.aicis_sync_runs(organization_id, surface, started_at DESC);

-- 2. Per-surface rolling status
CREATE TABLE IF NOT EXISTS public.aicis_sync_surface_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  surface text NOT NULL,
  last_run_id uuid REFERENCES public.aicis_sync_runs(id) ON DELETE SET NULL,
  last_status public.aicis_sync_status,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  total_records bigint NOT NULL DEFAULT 0,
  records_available bigint,
  consecutive_failures integer NOT NULL DEFAULT 0,
  schema_fingerprint text,
  freshness_seconds integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, surface)
);
CREATE INDEX IF NOT EXISTS idx_aicis_status_org ON public.aicis_sync_surface_status(organization_id);

-- 3. Ingested records (raw + normalized; idempotent on content hash)
CREATE TABLE IF NOT EXISTS public.aicis_ingested_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  surface text NOT NULL,
  external_id text NOT NULL,
  content_hash text NOT NULL,
  country_iso3 text,
  domain text,
  payload jsonb NOT NULL,
  source_run_id uuid REFERENCES public.aicis_sync_runs(id) ON DELETE SET NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, surface, external_id)
);
CREATE INDEX IF NOT EXISTS idx_aicis_records_org_surface ON public.aicis_ingested_records(organization_id, surface, ingested_at DESC);
CREATE INDEX IF NOT EXISTS idx_aicis_records_country ON public.aicis_ingested_records(organization_id, country_iso3) WHERE country_iso3 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_aicis_records_domain ON public.aicis_ingested_records(organization_id, domain) WHERE domain IS NOT NULL;

-- 4. Errors
CREATE TABLE IF NOT EXISTS public.aicis_sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  run_id uuid REFERENCES public.aicis_sync_runs(id) ON DELETE CASCADE,
  surface text NOT NULL,
  error_code text,
  error_message text NOT NULL,
  http_status integer,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aicis_errors_org ON public.aicis_sync_errors(organization_id, occurred_at DESC);

-- 5. Data quality checks
CREATE TABLE IF NOT EXISTS public.aicis_data_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  run_id uuid REFERENCES public.aicis_sync_runs(id) ON DELETE SET NULL,
  surface text NOT NULL,
  check_type text NOT NULL, -- missing_country | missing_domain | stale_data | duplicate_ids | empty_surface | pagination_failed | schema_drift
  severity text NOT NULL DEFAULT 'info', -- info | warning | error
  passed boolean NOT NULL,
  count_affected integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aicis_quality_org ON public.aicis_data_quality_checks(organization_id, checked_at DESC);

-- Updated_at trigger for ingested records & status
CREATE OR REPLACE FUNCTION public.aicis_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_aicis_records_touch ON public.aicis_ingested_records;
CREATE TRIGGER trg_aicis_records_touch BEFORE UPDATE ON public.aicis_ingested_records
FOR EACH ROW EXECUTE FUNCTION public.aicis_touch_updated_at();

DROP TRIGGER IF EXISTS trg_aicis_status_touch ON public.aicis_sync_surface_status;
CREATE TRIGGER trg_aicis_status_touch BEFORE UPDATE ON public.aicis_sync_surface_status
FOR EACH ROW EXECUTE FUNCTION public.aicis_touch_updated_at();

-- Enable RLS
ALTER TABLE public.aicis_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_sync_surface_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_ingested_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_sync_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aicis_data_quality_checks ENABLE ROW LEVEL SECURITY;

-- Policies: read for org members, no client writes (service role bypasses)
CREATE POLICY "aicis_runs_select" ON public.aicis_sync_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "aicis_status_select" ON public.aicis_sync_surface_status
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "aicis_records_select" ON public.aicis_ingested_records
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "aicis_errors_select" ON public.aicis_sync_errors
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

CREATE POLICY "aicis_quality_select" ON public.aicis_data_quality_checks
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
