-- A normal PostgreSQL unique index allows multiple NULL values, so it is safe
-- for manual/unlinked decisions while also being usable by ON CONFLICT.
DROP INDEX IF EXISTS public.decision_ledger_org_source_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS decision_ledger_org_source_idempotency_uidx
  ON public.decision_ledger (organization_id, source_idempotency_key);
