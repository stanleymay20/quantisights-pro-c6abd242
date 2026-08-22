-- Atomic idempotency claim for high-velocity metric ingestion. A read-before-
-- insert check is not sufficient when identical requests arrive concurrently.

CREATE OR REPLACE FUNCTION public.claim_metric_ingest_job(
  _organization_id uuid,
  _data_source_id uuid,
  _request_id text
)
RETURNS TABLE(job_id uuid, created boolean, job_status text, records_synced integer, error_message text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
BEGIN
  IF _request_id IS NULL OR btrim(_request_id) = '' OR length(_request_id) > 128 THEN
    RAISE EXCEPTION 'invalid request id';
  END IF;

  INSERT INTO public.data_sync_jobs (
    data_source_id,
    organization_id,
    request_id,
    status,
    records_synced,
    started_at
  ) VALUES (
    _data_source_id,
    _organization_id,
    _request_id,
    'pending',
    0,
    now()
  )
  ON CONFLICT (organization_id, data_source_id, request_id)
    WHERE request_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO _new_id;

  IF _new_id IS NOT NULL THEN
    RETURN QUERY SELECT _new_id, true, 'pending'::text, 0, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT j.id, false, j.status, COALESCE(j.records_synced, 0), j.error_message
  FROM public.data_sync_jobs j
  WHERE j.organization_id = _organization_id
    AND j.data_source_id = _data_source_id
    AND j.request_id = _request_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'idempotency claim conflict could not be resolved';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_metric_ingest_job(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_metric_ingest_job(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.claim_metric_ingest_job(uuid, uuid, text) IS
  'Atomically claims a tenant/source/request idempotency key and returns whether this caller created the sync job.';
