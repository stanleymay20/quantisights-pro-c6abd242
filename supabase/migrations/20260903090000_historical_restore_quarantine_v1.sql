-- Historical tenant restoration quarantine v1
-- Staging-first, fail-closed infrastructure. This migration does not promote or overwrite tenant data.

CREATE SCHEMA IF NOT EXISTS restore_quarantine;

REVOKE ALL ON SCHEMA restore_quarantine FROM PUBLIC;
REVOKE ALL ON SCHEMA restore_quarantine FROM anon;
REVOKE ALL ON SCHEMA restore_quarantine FROM authenticated;
GRANT USAGE ON SCHEMA restore_quarantine TO service_role;

CREATE TABLE IF NOT EXISTS restore_quarantine.batches (
  batch_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_project_ref text NOT NULL,
  source_organization_id uuid NOT NULL,
  source_snapshot_at timestamptz NOT NULL,
  destination_project_ref text NOT NULL,
  destination_shell_organization_id uuid,
  source_identity_email text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'receiving', 'received', 'reconciling', 'validated', 'promoted', 'aborted')),
  source_schema_manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS restore_quarantine.table_manifest (
  batch_id uuid NOT NULL REFERENCES restore_quarantine.batches(batch_id) ON DELETE CASCADE,
  source_table text NOT NULL,
  snapshot_filter_column text NOT NULL CHECK (length(btrim(snapshot_filter_column)) > 0),
  schema_signature text NOT NULL,
  expected_row_count bigint NOT NULL CHECK (expected_row_count >= 0),
  received_row_count bigint NOT NULL DEFAULT 0 CHECK (received_row_count >= 0),
  source_min_pk text,
  source_max_pk text,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'receiving', 'received', 'reconciled', 'blocked')),
  reconciliation_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, source_table)
);

CREATE TABLE IF NOT EXISTS restore_quarantine.rows (
  batch_id uuid NOT NULL REFERENCES restore_quarantine.batches(batch_id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_pk text NOT NULL,
  payload jsonb NOT NULL,
  payload_md5 text GENERATED ALWAYS AS (md5(payload::text)) STORED,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, source_table, source_pk),
  CHECK (source_table IN (
    'organizations', 'profiles', 'organization_members', 'workspaces', 'workspace_members',
    'projects', 'kpis', 'decision_ledger', 'insights', 'data_sources', 'reports', 'datasets',
    'dataset_versions', 'raw_records', 'metrics', 'metric_aggregates', 'decision_outcomes',
    'forecast_results', 'scenario_results', 'executive_briefs', 'audit_log'
  ))
);

CREATE INDEX IF NOT EXISTS restore_quarantine_rows_batch_table_idx
  ON restore_quarantine.rows(batch_id, source_table);

CREATE TABLE IF NOT EXISTS restore_quarantine.chunks (
  batch_id uuid NOT NULL REFERENCES restore_quarantine.batches(batch_id) ON DELETE CASCADE,
  source_table text NOT NULL,
  chunk_no integer NOT NULL CHECK (chunk_no >= 0),
  source_row_count integer NOT NULL CHECK (source_row_count >= 0),
  received_row_count integer NOT NULL CHECK (received_row_count >= 0),
  source_first_pk text,
  source_last_pk text,
  source_chunk_md5 text,
  receiver_chunk_md5 text,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, source_table, chunk_no)
);

CREATE TABLE IF NOT EXISTS restore_quarantine.identity_map (
  batch_id uuid NOT NULL REFERENCES restore_quarantine.batches(batch_id) ON DELETE CASCADE,
  source_user_id uuid NOT NULL,
  destination_user_id uuid NOT NULL,
  source_email text NOT NULL,
  mapping_reason text NOT NULL,
  verified_at timestamptz,
  PRIMARY KEY (batch_id, source_user_id),
  UNIQUE (batch_id, destination_user_id)
);

ALTER TABLE restore_quarantine.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_quarantine.table_manifest ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_quarantine.rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_quarantine.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE restore_quarantine.identity_map ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA restore_quarantine FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA restore_quarantine FROM anon;
REVOKE ALL ON ALL TABLES IN SCHEMA restore_quarantine FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA restore_quarantine TO service_role;

-- Future objects in this schema remain unavailable to browser roles by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA restore_quarantine REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA restore_quarantine REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA restore_quarantine REVOKE ALL ON TABLES FROM authenticated;

COMMENT ON SCHEMA restore_quarantine IS
  'Private staging area for historical tenant restoration. No automatic promotion into public tenant tables.';
COMMENT ON COLUMN restore_quarantine.batches.source_snapshot_at IS
  'Immutable source cutoff. Every table count and transferred row must be evaluated at or before this timestamp using its manifest snapshot_filter_column.';
COMMENT ON TABLE restore_quarantine.rows IS
  'Canonical JSONB copies of historical source rows. Promotion is deliberately implemented separately after reconciliation.';
