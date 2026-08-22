-- Idempotency keys are supplied by independent enterprise producers. They must
-- be unique within a tenant/source, not globally across every Quantivis customer.
-- The historical global request_id index allowed one organization's ordinary
-- request ID to collide with another organization's request using the same text.

DROP INDEX IF EXISTS public.idx_data_sync_jobs_request_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_data_sync_jobs_source_request_id
  ON public.data_sync_jobs (organization_id, data_source_id, request_id)
  WHERE request_id IS NOT NULL;

COMMENT ON INDEX public.idx_data_sync_jobs_source_request_id IS
  'Tenant/source-scoped ingest idempotency. Independent organizations may safely reuse the same external request-id text.';
