import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

const MAX_METRICS_PER_CHUNK = 1000;
const MAX_VALUE = 1e12;

type QueueMessage = {
  chunk_id: string;
  job_id: string;
  organization_id: string;
  dataset_id: string;
  data_source_id: string;
  request_id?: string;
  source_type?: string;
  metrics: Array<Record<string, unknown>>;
};

type QueueRow = {
  msg_id: number;
  read_ct: number;
  enqueued_at?: string;
  message: QueueMessage;
};

type PersistResult = {
  job_status: string;
  chunk_status: "completed" | "failed";
  persisted_count: number;
};

type ChunkOutcome = {
  processed: number;
  failed: number;
  retried: number;
  persistedRows: number;
  error?: string;
};

type ServiceClient = ReturnType<typeof createClient>;

const toDateOnly = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const validateEnvelope = (value: unknown): QueueMessage => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Queue payload must be an object");
  }
  const msg = value as Partial<QueueMessage>;
  if (typeof msg.chunk_id !== "string" || !msg.chunk_id.trim() || msg.chunk_id.length > 200) {
    throw new Error("Invalid chunk_id");
  }
  for (const [name, id] of [
    ["job_id", msg.job_id],
    ["organization_id", msg.organization_id],
    ["dataset_id", msg.dataset_id],
    ["data_source_id", msg.data_source_id],
  ] as const) {
    if (typeof id !== "string" || !isValidUUID(id)) throw new Error(`Invalid ${name}`);
  }
  if (!Array.isArray(msg.metrics) || msg.metrics.length === 0 || msg.metrics.length > MAX_METRICS_PER_CHUNK) {
    throw new Error(`metrics must contain 1-${MAX_METRICS_PER_CHUNK} rows`);
  }
  return msg as QueueMessage;
};

const hasProgressIdentity = (value: unknown): value is QueueMessage => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const msg = value as Partial<QueueMessage>;
  return typeof msg.chunk_id === "string" && msg.chunk_id.length > 0 &&
    typeof msg.job_id === "string" && isValidUUID(msg.job_id) &&
    typeof msg.organization_id === "string" && isValidUUID(msg.organization_id) &&
    typeof msg.dataset_id === "string" && isValidUUID(msg.dataset_id);
};

const deleteLiveMessage = async (svc: ServiceClient, messageId: number) => {
  const { data, error } = await svc.rpc("delete_metric_ingest", { _message_id: messageId });
  if (error || data !== true) throw new Error(`Queue delete failed: ${error?.message ?? "message not deleted"}`);
};

const moveToDlq = async (svc: ServiceClient, raw: QueueRow, reason: string) => {
  const { error } = await svc.rpc("move_metric_ingest_to_dlq", {
    _message_id: raw.msg_id,
    _payload: { ...raw.message, dlq_reason: reason, dlq_at: new Date().toISOString() },
  });
  if (error) throw new Error(`DLQ move failed: ${error.message}`);
};

const processMessage = async (
  svc: ServiceClient,
  raw: QueueRow,
  maxRetries: number,
): Promise<ChunkOutcome> => {
  let envelope: QueueMessage | null = null;
  try {
    envelope = validateEnvelope(raw.message);

    const canonical = envelope.metrics.map((metric, index) => {
      const metricType = typeof metric.metric_type === "string" ? metric.metric_type.trim() : "";
      if (!metricType || metricType.length > 200) throw new Error(`Metric ${index}: invalid metric_type`);
      const date = toDateOnly(metric.date);
      if (!date) throw new Error(`Metric ${index}: invalid date`);
      const value = Number(metric.value);
      if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) throw new Error(`Metric ${index}: invalid value`);
      return {
        metric_type: metricType,
        date,
        value,
        region: typeof metric.region === "string" ? metric.region.trim() : "",
        segment: typeof metric.segment === "string" ? metric.segment.trim() : "",
        source_type: typeof envelope!.source_type === "string" && envelope!.source_type.trim()
          ? envelope!.source_type.trim()
          : "queued_api",
        quality_score: typeof metric.quality_score === "number" && Number.isFinite(metric.quality_score)
          ? Math.max(0, Math.min(100, metric.quality_score))
          : 85,
      };
    });

    const deduped = new Map<string, (typeof canonical)[number]>();
    for (const metric of canonical) {
      const key = [metric.metric_type.toLowerCase(), metric.date, metric.region, metric.segment].join("\u001f");
      deduped.set(key, metric);
    }
    const rows = Array.from(deduped.values());

    // One transactional RPC performs privileged scope revalidation, metric
    // upsert, idempotent chunk progress, terminal job status, and freshness.
    const { data, error } = await svc.rpc("persist_metric_ingest_chunk", {
      _chunk_id: envelope.chunk_id,
      _job_id: envelope.job_id,
      _organization_id: envelope.organization_id,
      _dataset_id: envelope.dataset_id,
      _data_source_id: envelope.data_source_id,
      _metrics: rows,
    });
    if (error) throw new Error(`Transactional metric chunk persistence failed: ${error.message}`);

    const result = Array.isArray(data) ? data[0] as PersistResult | undefined : undefined;
    if (!result?.chunk_status) throw new Error("Transactional metric chunk persistence returned no result");

    // Redelivery after a terminal failed marker must never execute business
    // writes again. The RPC recognizes the marker and reports it back here.
    if (result.chunk_status === "failed") {
      try {
        await moveToDlq(svc, raw, "Previously recorded terminal chunk failure");
        return { processed: 0, failed: 1, retried: 0, persistedRows: 0 };
      } catch (cleanupError) {
        return {
          processed: 0,
          failed: 0,
          retried: 1,
          persistedRows: 0,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        };
      }
    }

    // If this is a redelivery after successful persistence, the RPC returns the
    // durable prior result without upserting or incrementing progress again.
    try {
      await deleteLiveMessage(svc, raw.msg_id);
    } catch (cleanupError) {
      return {
        processed: 0,
        failed: 0,
        retried: 1,
        persistedRows: 0,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      };
    }

    return {
      processed: 1,
      failed: 0,
      retried: 0,
      persistedRows: Math.max(0, Number(result.persisted_count) || 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((raw.read_ct ?? 0) < maxRetries) {
      return { processed: 0, failed: 0, retried: 1, persistedRows: 0, error: message };
    }

    try {
      const fallback: unknown = envelope ?? raw.message;

      // persist_metric_ingest_chunk is transactional, so a failed call cannot
      // leave metric rows committed without progress. At retry exhaustion it is
      // therefore safe to record a failed terminal chunk before removing it.
      if (hasProgressIdentity(fallback)) {
        const { error: progressError } = await svc.rpc("record_metric_ingest_chunk_result", {
          _chunk_id: fallback.chunk_id,
          _job_id: fallback.job_id,
          _organization_id: fallback.organization_id,
          _dataset_id: fallback.dataset_id,
          _inserted: 0,
          _failed: true,
          _error_message: message,
        });
        if (progressError) throw new Error(`DLQ progress persistence failed: ${progressError.message}`);
      }

      // Progress first, queue removal second. If this move fails, redelivery is
      // safe because the transactional RPC sees the terminal failed marker.
      await moveToDlq(svc, raw, message);
      return { processed: 0, failed: 1, retried: 0, persistedRows: 0, error: message };
    } catch (dlqError) {
      return {
        processed: 0,
        failed: 0,
        retried: 1,
        persistedRows: 0,
        error: `${message}; DLQ: ${dlqError instanceof Error ? dlqError.message : String(dlqError)}`,
      };
    }
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Queue worker configuration unavailable" }, 503);
  const svc = createClient(supabaseUrl, serviceKey);

  const { data: state, error: stateError } = await svc
    .from("metric_ingest_queue_state")
    .select("paused,batch_size,visibility_timeout_seconds,max_retries,worker_concurrency,max_chunks_per_run,max_runtime_ms")
    .eq("id", 1)
    .single();
  if (stateError || !state) return json({ error: `Queue state unavailable: ${stateError?.message ?? "missing row"}` }, 503);
  if (state.paused) return json({ skipped: true, reason: "paused" });

  const startedAt = Date.now();
  let claimedChunks = 0;
  let processedChunks = 0;
  let failedChunks = 0;
  let retriedChunks = 0;
  let persistedRows = 0;
  let queueEmpty = false;
  let readFailure: string | null = null;
  const errors: string[] = [];

  while (
    claimedChunks < state.max_chunks_per_run &&
    Date.now() - startedAt < state.max_runtime_ms
  ) {
    const remaining = state.max_chunks_per_run - claimedChunks;
    const readCount = Math.max(1, Math.min(state.batch_size, remaining));
    const { data: messages, error: readError } = await svc.rpc("read_metric_ingest_batch", {
      _batch_size: readCount,
      _vt: state.visibility_timeout_seconds,
    });
    if (readError) {
      readFailure = `Queue read failed: ${readError.message}`;
      errors.push(readFailure);
      break;
    }
    if (!messages?.length) {
      queueEmpty = true;
      break;
    }

    const batch = messages as QueueRow[];
    claimedChunks += batch.length;

    for (let offset = 0; offset < batch.length; offset += state.worker_concurrency) {
      const group = batch.slice(offset, offset + state.worker_concurrency);
      const outcomes = await Promise.all(group.map((raw) => processMessage(svc, raw, state.max_retries)));
      for (const outcome of outcomes) {
        processedChunks += outcome.processed;
        failedChunks += outcome.failed;
        retriedChunks += outcome.retried;
        persistedRows += outcome.persistedRows;
        if (outcome.error) errors.push(outcome.error);
      }
    }
  }

  const runtimeMs = Date.now() - startedAt;
  const runtimeBudgetReached = runtimeMs >= state.max_runtime_ms && !queueEmpty;
  const chunkBudgetReached = claimedChunks >= state.max_chunks_per_run && !queueEmpty;
  const status = readFailure && claimedChunks === 0
    ? 503
    : failedChunks > 0 || retriedChunks > 0 || readFailure
      ? 207
      : 200;

  return json({
    claimed_chunks: claimedChunks,
    processed_chunks: processedChunks,
    failed_chunks: failedChunks,
    retried_chunks: retriedChunks,
    persisted_rows_confirmed: persistedRows,
    queue_empty: queueEmpty,
    runtime_ms: runtimeMs,
    runtime_budget_reached: runtimeBudgetReached,
    chunk_budget_reached: chunkBudgetReached,
    worker_concurrency: state.worker_concurrency,
    max_chunks_per_run: state.max_chunks_per_run,
    errors: errors.slice(0, 20),
  }, status);
});
