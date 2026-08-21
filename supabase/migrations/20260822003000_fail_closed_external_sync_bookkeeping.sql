-- =============================================================================
-- External ingestion truthfulness invariant
-- =============================================================================
-- A vendor run that fetched rows but persisted zero rows is a write failure, not
-- a partial/successful refresh. Historically ingest-external-signals could log
-- chunk upsert errors, keep rows_upserted=0, then still mark the run partial and
-- advance external_data_sources.last_refreshed_at.
--
-- Enforce the invariant at the database boundary so every current/future writer
-- gets the same semantics. No business/reference rows are deleted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_external_sync_write_truth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor_name text;
  v_latest_persisted timestamptz;
  v_reason text;
BEGIN
  IF NEW.rows_fetched > 0
     AND COALESCE(NEW.rows_upserted, 0) = 0
     AND NEW.status IN ('success', 'partial') THEN
    v_reason := 'Fetched rows but persisted zero rows; external sync failed closed';
    NEW.status := 'error';
    NEW.error_message := left(
      concat_ws(' | ', nullif(NEW.error_message, ''), v_reason),
      2000
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_sync_write_truth ON public.external_sync_runs;
CREATE TRIGGER trg_external_sync_write_truth
BEFORE INSERT OR UPDATE OF status, rows_fetched, rows_upserted, error_message
ON public.external_sync_runs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_external_sync_write_truth();

CREATE OR REPLACE FUNCTION public.reconcile_external_source_from_run()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_vendor_name text;
  v_latest_persisted timestamptz;
BEGIN
  -- Only correct terminal zero-write failures. Normal successful/partial runs
  -- keep the source refresh bookkeeping produced by the ingestion function.
  IF NEW.status = 'error'
     AND NEW.rows_fetched > 0
     AND COALESCE(NEW.rows_upserted, 0) = 0 THEN
    SELECT vendor_name
      INTO v_vendor_name
    FROM public.external_data_sources
    WHERE id = NEW.source_id;

    IF v_vendor_name IS NOT NULL THEN
      SELECT max(updated_at)
        INTO v_latest_persisted
      FROM public.internal_reference_data
      WHERE organization_id IS NOT DISTINCT FROM NEW.organization_id
        AND source = v_vendor_name;
    END IF;

    UPDATE public.external_data_sources
    SET last_refreshed_at = v_latest_persisted,
        next_refresh_at = now() + interval '1 hour',
        last_error = left(
          COALESCE(NULLIF(NEW.error_message, ''), 'External sync fetched data but persisted zero rows'),
          500
        )
    WHERE id = NEW.source_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_sync_source_truth ON public.external_sync_runs;
CREATE TRIGGER trg_external_sync_source_truth
AFTER INSERT OR UPDATE OF status, rows_fetched, rows_upserted, error_message
ON public.external_sync_runs
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_external_source_from_run();

REVOKE ALL ON FUNCTION public.enforce_external_sync_write_truth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_external_source_from_run() FROM PUBLIC;

-- Repair historically abandoned external runs as bookkeeping failures.
UPDATE public.external_sync_runs
SET status = 'error',
    completed_at = COALESCE(completed_at, now()),
    duration_ms = COALESCE(
      duration_ms,
      GREATEST(0, floor(extract(epoch FROM (now() - started_at)) * 1000))::integer
    ),
    error_message = left(
      concat_ws(' | ', nullif(error_message, ''), 'Reconciled stale external sync run'),
      2000
    )
WHERE status = 'running'
  AND started_at < now() - interval '2 hours';

-- Re-evaluate previously mislabeled zero-write terminal runs. The BEFORE/AFTER
-- triggers above correct both the run status and the source freshness metadata.
UPDATE public.external_sync_runs
SET status = status
WHERE rows_fetched > 0
  AND COALESCE(rows_upserted, 0) = 0
  AND status IN ('success', 'partial');
