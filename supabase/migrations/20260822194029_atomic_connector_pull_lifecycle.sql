-- Restore the narrow service-role DML surface required by the certified HubSpot runtime
-- on freshly replayed staging projects, then persist connector/source lifecycle atomically.
-- Production already has these grants; staging did not, so the supposedly certified path
-- could not provision, schedule, sync, checkpoint, throttle, dead-letter, or persist canonical data.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_connectors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_sources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_sync_schedules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_sync_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_circuit_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_throttle_state TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_sync_checkpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.connector_sync_run_errors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_entities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.canonical_relationships TO service_role;

CREATE OR REPLACE FUNCTION public.persist_connector_pull_lifecycle(
  _organization_id uuid,
  _connector_id uuid,
  _data_source_id uuid,
  _final_status text,
  _records_synced integer,
  _error_message text DEFAULT NULL,
  _completed_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_current_failures integer;
BEGIN
  IF _organization_id IS NULL OR _connector_id IS NULL OR _data_source_id IS NULL THEN
    RAISE EXCEPTION 'organization_id, connector_id and data_source_id are required'
      USING ERRCODE = 'not_null_violation';
  END IF;

  IF _completed_at IS NULL THEN
    RAISE EXCEPTION 'completed_at is required' USING ERRCODE = 'not_null_violation';
  END IF;

  IF _final_status NOT IN ('completed', 'partial', 'failed') THEN
    RAISE EXCEPTION 'final_status must be completed, partial or failed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _records_synced IS NULL OR _records_synced < 0 THEN
    RAISE EXCEPTION 'records_synced must be a non-negative integer'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_status = 'partial' AND _records_synced = 0 THEN
    RAISE EXCEPTION 'partial connector pull requires at least one persisted record'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_status = 'failed' AND _records_synced <> 0 THEN
    RAISE EXCEPTION 'failed connector pull cannot claim persisted records'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_status = 'completed' AND NULLIF(btrim(COALESCE(_error_message, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'completed connector pull cannot include an error message'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _final_status IN ('partial', 'failed')
     AND NULLIF(btrim(COALESCE(_error_message, '')), '') IS NULL THEN
    RAISE EXCEPTION 'partial/failed connector pull requires an error message'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT dc.consecutive_failures
  INTO v_current_failures
  FROM public.data_connectors dc
  WHERE dc.id = _connector_id
    AND dc.organization_id = _organization_id
    AND dc.data_source_id = _data_source_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'connector/data-source link not found in organization'
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM 1
  FROM public.data_sources ds
  WHERE ds.id = _data_source_id
    AND ds.organization_id = _organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'data source not found in organization'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF _final_status = 'failed' THEN
    UPDATE public.data_connectors
    SET status = 'error',
        health = 'unhealthy',
        last_error_at = _completed_at,
        last_error_message = left(_error_message, 2000),
        consecutive_failures = COALESCE(v_current_failures, 0) + 1,
        updated_at = _completed_at
    WHERE id = _connector_id
      AND organization_id = _organization_id;

    UPDATE public.data_sources
    SET status = 'error',
        updated_at = _completed_at
    WHERE id = _data_source_id
      AND organization_id = _organization_id;
    RETURN;
  END IF;

  UPDATE public.data_sources
  SET status = 'active',
      last_synced_at = _completed_at,
      updated_at = _completed_at
  WHERE id = _data_source_id
    AND organization_id = _organization_id;

  IF _final_status = 'partial' THEN
    UPDATE public.data_connectors
    SET status = 'active',
        health = 'degraded',
        last_success_at = _completed_at,
        last_synced_at = _completed_at,
        last_error_at = _completed_at,
        last_error_message = left(_error_message, 2000),
        consecutive_failures = 0,
        updated_at = _completed_at
    WHERE id = _connector_id
      AND organization_id = _organization_id;
  ELSE
    UPDATE public.data_connectors
    SET status = 'active',
        health = 'healthy',
        last_success_at = _completed_at,
        last_synced_at = _completed_at,
        last_error_message = NULL,
        consecutive_failures = 0,
        updated_at = _completed_at
    WHERE id = _connector_id
      AND organization_id = _organization_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.persist_connector_pull_lifecycle(
  uuid, uuid, uuid, text, integer, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.persist_connector_pull_lifecycle(
  uuid, uuid, uuid, text, integer, text, timestamptz
) TO service_role;

NOTIFY pgrst, 'reload schema';
