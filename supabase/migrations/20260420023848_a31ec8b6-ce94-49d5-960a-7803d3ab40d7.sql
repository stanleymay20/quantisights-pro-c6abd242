-- ============================================================================
-- ENTERPRISE INGESTION FRAMEWORK — FOUNDATION SCHEMA
-- ============================================================================

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE public.connector_type AS ENUM (
    'rest_api', 'csv_upload', 'postgres', 'mysql', 'snowflake', 'bigquery', 'webhook'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connector_status AS ENUM ('active', 'paused', 'error', 'draft');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connector_health AS ENUM ('healthy', 'degraded', 'unhealthy', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connector_sync_mode AS ENUM ('full_refresh', 'append', 'incremental');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connector_schedule_kind AS ENUM ('manual', 'every_5_min', 'hourly', 'daily');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.connector_run_status AS ENUM (
    'queued', 'extracting', 'validating', 'extracted',
    'transforming', 'transformed', 'aggregating',
    'complete', 'partial_success', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. data_connectors — top-level registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.data_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  connector_type public.connector_type NOT NULL,
  status public.connector_status NOT NULL DEFAULT 'draft',
  health public.connector_health NOT NULL DEFAULT 'unknown',
  sync_mode public.connector_sync_mode NOT NULL DEFAULT 'full_refresh',
  -- Vault reference (never plain creds)
  vault_secret_name text,
  -- Connector-type-specific config (URL, method, query, table name, etc.)
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Incremental sync config (cursor field name, etc.)
  cursor_field text,
  retry_policy jsonb NOT NULL DEFAULT '{"max_attempts": 3, "backoff_ms": 1000, "max_backoff_ms": 30000}'::jsonb,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_message text,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_data_connectors_org ON public.data_connectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_connectors_dataset ON public.data_connectors(dataset_id) WHERE dataset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_data_connectors_status ON public.data_connectors(status) WHERE status = 'active';

ALTER TABLE public.data_connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_connectors" ON public.data_connectors;
CREATE POLICY "members_view_connectors" ON public.data_connectors
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_insert_connectors" ON public.data_connectors;
CREATE POLICY "admins_insert_connectors" ON public.data_connectors
  FOR INSERT TO authenticated
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_update_connectors" ON public.data_connectors;
CREATE POLICY "admins_update_connectors" ON public.data_connectors
  FOR UPDATE TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_delete_connectors" ON public.data_connectors;
CREATE POLICY "admins_delete_connectors" ON public.data_connectors
  FOR DELETE TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id));

-- ============================================================================
-- 3. connector_field_mappings — approved canonical mapping per connector
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  -- {"source_field": {"canonical": "metric_type", "data_type": "text", "required": true, "transform": null}}
  mappings jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Validation summary from dry-run
  validation_summary jsonb,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_mappings_connector ON public.connector_field_mappings(connector_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_mappings_active
  ON public.connector_field_mappings(connector_id) WHERE is_active = true;

ALTER TABLE public.connector_field_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_mappings" ON public.connector_field_mappings;
CREATE POLICY "members_view_mappings" ON public.connector_field_mappings
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_manage_mappings" ON public.connector_field_mappings;
CREATE POLICY "admins_manage_mappings" ON public.connector_field_mappings
  FOR ALL TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- ============================================================================
-- 4. connector_sync_schedules
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_sync_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  schedule_kind public.connector_schedule_kind NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_dispatch_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connector_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_schedules_due
  ON public.connector_sync_schedules(next_run_at)
  WHERE is_active = true AND schedule_kind <> 'manual';

ALTER TABLE public.connector_sync_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_schedules" ON public.connector_sync_schedules;
CREATE POLICY "members_view_schedules" ON public.connector_sync_schedules
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_manage_schedules" ON public.connector_sync_schedules;
CREATE POLICY "admins_manage_schedules" ON public.connector_sync_schedules
  FOR ALL TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- ============================================================================
-- 5. connector_sync_runs — every sync attempt
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  request_id text,
  triggered_by text NOT NULL DEFAULT 'manual', -- 'manual' | 'schedule' | 'api'
  status public.connector_run_status NOT NULL DEFAULT 'queued',
  current_stage text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,
  rows_extracted int NOT NULL DEFAULT 0,
  rows_valid int NOT NULL DEFAULT 0,
  rows_invalid int NOT NULL DEFAULT 0,
  rows_inserted int NOT NULL DEFAULT 0,
  rows_updated int NOT NULL DEFAULT 0,
  rows_skipped int NOT NULL DEFAULT 0,
  checkpoint_before jsonb,
  checkpoint_after jsonb,
  error_summary text,
  stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_connector ON public.connector_sync_runs(connector_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_runs_org_status ON public.connector_sync_runs(organization_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sync_runs_request
  ON public.connector_sync_runs(connector_id, request_id) WHERE request_id IS NOT NULL;

ALTER TABLE public.connector_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_sync_runs" ON public.connector_sync_runs;
CREATE POLICY "members_view_sync_runs" ON public.connector_sync_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- writes are service-role only (no policy = denied for authenticated)

-- ============================================================================
-- 6. connector_sync_run_errors — per-row / per-batch failures
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_sync_run_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sync_run_id uuid NOT NULL REFERENCES public.connector_sync_runs(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  error_kind text NOT NULL, -- 'validation' | 'transform' | 'insert' | 'extract'
  row_index int,
  raw_payload jsonb,
  error_message text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_run_errors_run ON public.connector_sync_run_errors(sync_run_id);
CREATE INDEX IF NOT EXISTS idx_sync_run_errors_unresolved
  ON public.connector_sync_run_errors(connector_id) WHERE is_resolved = false;

ALTER TABLE public.connector_sync_run_errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_sync_errors" ON public.connector_sync_run_errors;
CREATE POLICY "members_view_sync_errors" ON public.connector_sync_run_errors
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "admins_resolve_sync_errors" ON public.connector_sync_run_errors;
CREATE POLICY "admins_resolve_sync_errors" ON public.connector_sync_run_errors
  FOR UPDATE TO authenticated
  USING (public.exec_require_elevated_role(auth.uid(), organization_id))
  WITH CHECK (public.exec_require_elevated_role(auth.uid(), organization_id));

-- ============================================================================
-- 7. connector_sync_checkpoints — incremental cursor state
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_sync_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  cursor_field text NOT NULL,
  cursor_value text,
  last_sync_run_id uuid REFERENCES public.connector_sync_runs(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connector_id, cursor_field)
);

ALTER TABLE public.connector_sync_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_checkpoints" ON public.connector_sync_checkpoints;
CREATE POLICY "members_view_checkpoints" ON public.connector_sync_checkpoints
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- ============================================================================
-- 8. connector_lineage_events — append-only lineage trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.connector_lineage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.data_connectors(id) ON DELETE CASCADE,
  sync_run_id uuid REFERENCES public.connector_sync_runs(id) ON DELETE SET NULL,
  dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL,
  event_type text NOT NULL, -- 'extract' | 'validate' | 'transform' | 'aggregate'
  records_count int NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lineage_events_dataset ON public.connector_lineage_events(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lineage_events_run ON public.connector_lineage_events(sync_run_id);

ALTER TABLE public.connector_lineage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_view_lineage_events" ON public.connector_lineage_events;
CREATE POLICY "members_view_lineage_events" ON public.connector_lineage_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- ============================================================================
-- 9. updated_at trigger
-- ============================================================================
DROP TRIGGER IF EXISTS trg_data_connectors_updated_at ON public.data_connectors;
CREATE TRIGGER trg_data_connectors_updated_at
  BEFORE UPDATE ON public.data_connectors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_sync_schedules_updated_at ON public.connector_sync_schedules;
CREATE TRIGGER trg_sync_schedules_updated_at
  BEFORE UPDATE ON public.connector_sync_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 10. Advisory lock helper to prevent overlapping syncs per connector
-- ============================================================================
CREATE OR REPLACE FUNCTION public.connector_try_lock(_connector_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_try_advisory_lock(hashtextextended(_connector_id::text, 0));
$$;

CREATE OR REPLACE FUNCTION public.connector_release_lock(_connector_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_unlock(hashtextextended(_connector_id::text, 0));
$$;

-- ============================================================================
-- 11. Vault helper to read connector credential by name (service role only)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_connector_secret(_secret_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = _secret_name
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_connector_secret(text) FROM anon, authenticated;