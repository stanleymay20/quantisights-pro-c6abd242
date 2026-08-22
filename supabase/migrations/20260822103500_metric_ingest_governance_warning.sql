-- Preserve the distinction between durable data acceptance and governance/audit health.
-- A queued ingest may already be safely persisted to PGMQ when its acceptance
-- audit write fails. We must not reject durable work, but we also must not
-- present the acceptance chain as fully healthy.

ALTER TABLE public.data_sync_jobs
  ADD COLUMN IF NOT EXISTS governance_warning text;

CREATE INDEX IF NOT EXISTS idx_data_sync_jobs_governance_warning
  ON public.data_sync_jobs (organization_id, created_at DESC)
  WHERE governance_warning IS NOT NULL;

COMMENT ON COLUMN public.data_sync_jobs.governance_warning IS
  'Non-null when required governance/audit bookkeeping degraded after the ingest job had already become durable. Does not imply data persistence failure.';
