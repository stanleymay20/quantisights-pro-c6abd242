import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";
import { isValidUUID } from "../_shared/input-validation.ts";

const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
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
    .select("paused,batch_size,visibility_timeout_seconds,max_retries")
    .eq("id", 1)
    .single();
  if (stateError || !state) {
    return json({ error: `Queue state unavailable: ${stateError?.message ?? "missing row"}` }, 503);
  }
  if (state.paused) return json({ skipped: true, reason: "paused" });

  const { data: messages, error: readError } = await svc.rpc("read_metric_ingest_batch", {
    _batch_size: state.batch_size,
    _vt: state.visibility_timeout_seconds,
  });
  if (readError) return json({ error: `Queue read failed: ${readError.message}` }, 503);
  if (!messages?.length) return json({ processed_chunks: 0, failed_chunks: 0, retried_chunks: 0 });

  let processedChunks = 0;
  let failedChunks = 0;
  let retriedChunks = 0;
  let persistedRows = 0;
  const errors: string[] = [];

  for (const raw of messages as QueueRow[]) {
    let envelope: QueueMessage | null = null;
    try {
      envelope = validateEnvelope(raw.message);

      // Service-role processing must re-prove all envelope resources belong to
      // the same tenant before trusting any metric payload fields.
      const [{ data: dataset, error: datasetError }, { data: source, error: sourceError }, { data: job, error: jobError }] = await Promise.all([
        svc.from("datasets").select("id").eq("id", envelope.dataset_id).eq("organization_id", envelope.organization_id).maybeSingle(),
        svc.from("data_sources").select("id").eq("id", envelope.data_source_id).eq("organization_id", envelope.organization_id).maybeSingle(),
        svc.from("data_sync_jobs").select("id,status").eq("id", envelope.job_id).eq("organization_id", envelope.organization_id).eq("data_source_id", envelope.data_source_id).maybeSingle(),
      ]);
      if (datasetError) throw new Error(`Dataset scope lookup failed: ${datasetError.message}`);
      if (sourceError) throw new Error(`Source scope lookup failed: ${sourceError.message}`);
      if (jobError) throw new Error(`Job scope lookup failed: ${jobError.message}`);
      if (!dataset?.id) throw new Error("Dataset does not belong to queue organization");
      if (!source?.id) throw new Error("Data source does not belong to queue organization");
      if (!job?.id) throw new Error("Sync job does not belong to queue source/organization");

      // At-least-once delivery means a message can reappear after its terminal
      // chunk result was already committed (for example if queue deletion/DLQ
      // movement failed after progress persistence). Never execute business
      // writes again once that durable terminal marker exists.
      const { data: terminalChunk, error: terminalChunkError } = await svc
        .from("metric_ingest_chunk_results")
        .select("status,inserted_count,error_message")
        .eq("chunk_id", envelope.chunk_id)
        .eq("job_id", envelope.job_id)
        .eq("organization_id", envelope.organization_id)
        .maybeSingle();
      if (terminalChunkError) throw new Error(`Chunk-result lookup failed: ${terminalChunkError.message}`);

      if (terminalChunk?.status === "completed") {
        const { data: deleted, error: deleteError } = await svc.rpc("delete_metric_ingest", { _message_id: raw.msg_id });
        if (deleteError || deleted !== true) {
          errors.push(`msg ${raw.msg_id}: completed chunk cleanup failed: ${deleteError?.message ?? "message not deleted"}`);
          retriedChunks += 1;
          continue;
        }
        processedChunks += 1;
        continue;
      }

      if (terminalChunk?.status === "failed") {
        const { error: dlqError } = await svc.rpc("move_metric_ingest_to_dlq", {
          _message_id: raw.msg_id,
          _payload: {
            ...raw.message,
            dlq_reason: terminalChunk.error_message ?? "Previously recorded terminal chunk failure",
            dlq_at: new Date().toISOString(),
          },
        });
        if (dlqError) {
          errors.push(`msg ${raw.msg_id}: failed chunk DLQ cleanup failed: ${dlqError.message}`);
          retriedChunks += 1;
          continue;
        }
        failedChunks += 1;
        continue;
      }

      const canonical = envelope.metrics.map((metric, index) => {
        const metricType = typeof metric.metric_type === "string" ? metric.metric_type.trim() : "";
        if (!metricType || metricType.length > 200) throw new Error(`Metric ${index}: invalid metric_type`);
        const date = toDateOnly(metric.date);
        if (!date) throw new Error(`Metric ${index}: invalid date`);
        const value = Number(metric.value);
        if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) throw new Error(`Metric ${index}: invalid value`);
        return {
          organization_id: envelope!.organization_id,
          dataset_id: envelope!.dataset_id,
          metric_type: metricType,
          date,
          value,
          region: typeof metric.region === "string" ? metric.region.trim() : "",
          segment: typeof metric.segment === "string" ? metric.segment.trim() : "",
          source_id: envelope!.data_source_id,
          source_type: typeof envelope!.source_type === "string" && envelope!.source_type.trim()
            ? envelope!.source_type.trim()
            : "queued_api",
          quality_score: typeof metric.quality_score === "number" && Number.isFinite(metric.quality_score)
            ? Math.max(0, Math.min(100, metric.quality_score))
            : 85,
        };
      });

      // Collapse duplicate identities inside a chunk before touching Postgres.
      const deduped = new Map<string, (typeof canonical)[number]>();
      for (const metric of canonical) {
        const key = [metric.organization_id, metric.dataset_id, metric.metric_type, metric.date, metric.region, metric.segment, metric.source_id].join("\u001f");
        deduped.set(key, metric);
      }
      const rows = Array.from(deduped.values());

      const { error: upsertError } = await svc.from("metrics").upsert(rows, { onConflict: METRIC_CONFLICT_KEY });
      if (upsertError) throw new Error(`Metric chunk persistence failed: ${upsertError.message}`);

      const { data: jobStatus, error: progressError } = await svc.rpc("record_metric_ingest_chunk_result", {
        _chunk_id: envelope.chunk_id,
        _job_id: envelope.job_id,
        _organization_id: envelope.organization_id,
        _dataset_id: envelope.dataset_id,
        _inserted: rows.length,
        _failed: false,
        _error_message: null,
      });
      if (progressError) throw new Error(`Chunk progress persistence failed: ${progressError.message}`);

      // Freshness is advanced only when the complete queued job has reached a
      // terminal state and at least one chunk was persisted.
      if (jobStatus === "completed" || jobStatus === "partial") {
        const { error: freshnessError } = await svc.from("datasets").update({
          last_refreshed_at: new Date().toISOString(),
          status: "active",
        }).eq("id", envelope.dataset_id).eq("organization_id", envelope.organization_id);
        if (freshnessError) throw new Error(`Dataset freshness update failed: ${freshnessError.message}`);
      }

      const { data: deleted, error: deleteError } = await svc.rpc("delete_metric_ingest", { _message_id: raw.msg_id });
      if (deleteError || deleted !== true) {
        throw new Error(`Queue delete failed: ${deleteError?.message ?? "message not deleted"}`);
      }

      processedChunks += 1;
      persistedRows += rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`msg ${raw.msg_id}: ${message}`);

      // Poison payloads and exhausted retry budgets are terminal. Until then,
      // leave the message claimed; PGMQ will make it visible again after VT.
      if ((raw.read_ct ?? 0) >= state.max_retries) {
        try {
          const fallback = envelope ?? (raw.message as QueueMessage);

          // Persist terminal job progress BEFORE removing the poison message
          // from the live queue. If the DLQ move fails afterward, the message
          // can be redelivered and the terminal-chunk short circuit above will
          // retry only the DLQ cleanup, never the metric business write.
          if (fallback?.chunk_id && fallback?.job_id && fallback?.organization_id && fallback?.dataset_id) {
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

          const { error: dlqError } = await svc.rpc("move_metric_ingest_to_dlq", {
            _message_id: raw.msg_id,
            _payload: { ...raw.message, dlq_reason: message, dlq_at: new Date().toISOString() },
          });
          if (dlqError) throw new Error(`DLQ move failed: ${dlqError.message}`);

          failedChunks += 1;
        } catch (dlqFailure) {
          errors.push(`msg ${raw.msg_id} DLQ: ${dlqFailure instanceof Error ? dlqFailure.message : String(dlqFailure)}`);
          retriedChunks += 1;
        }
      } else {
        retriedChunks += 1;
      }
    }
  }

  return json({
    processed_chunks: processedChunks,
    failed_chunks: failedChunks,
    retried_chunks: retriedChunks,
    persisted_rows: persistedRows,
    errors: errors.slice(0, 20),
  }, failedChunks > 0 || retriedChunks > 0 ? 207 : 200);
});
