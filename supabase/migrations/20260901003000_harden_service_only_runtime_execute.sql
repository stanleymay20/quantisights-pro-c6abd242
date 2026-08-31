-- Converge upgraded projects with clean-replay staging privileges.
--
-- Older production environments can retain explicit anon/authenticated EXECUTE
-- grants even after PUBLIC is revoked. These runtime/worker helpers are
-- service-role-only (or trigger-only) and must not be reachable through the
-- exposed PostgREST RPC surface by browser roles.

-- Trigger-only functions: no client or service-role direct execution required.
REVOKE ALL ON FUNCTION public.enforce_external_sync_write_truth()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_external_source_from_run()
  FROM PUBLIC, anon, authenticated, service_role;

-- Service-role-only pipeline/runtime helpers.
REVOKE ALL ON FUNCTION public.reconcile_stale_pipeline_runs()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_metric_ingest(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_metric_ingest_batch(integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_metric_ingest(bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.move_metric_ingest_to_dlq(bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_metric_ingest_job(uuid, integer, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_metric_ingest_chunk_result(text, uuid, uuid, uuid, integer, boolean, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_metric_ingest_job(uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_metric_ingest_job(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.monitor_metric_ingest_queue_health()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.persist_metric_ingest_chunk(text, uuid, uuid, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_metric_aggregates_scoped(uuid, uuid, text[])
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reconcile_stale_pipeline_runs()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_metric_ingest(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.read_metric_ingest_batch(integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_metric_ingest(bigint)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.move_metric_ingest_to_dlq(bigint, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_metric_ingest_job(uuid, integer, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_metric_ingest_chunk_result(text, uuid, uuid, uuid, integer, boolean, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_metric_ingest_job(uuid, uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_metric_ingest_job(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.monitor_metric_ingest_queue_health()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.persist_metric_ingest_chunk(text, uuid, uuid, uuid, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_metric_aggregates_scoped(uuid, uuid, text[])
  TO service_role;

NOTIFY pgrst, 'reload schema';
