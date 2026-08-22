import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { failSyncJob, findIdempotentJob } from "../_shared/ingest-jobs.ts";
import { isRecord, normalizeDateInput, parseJsonBody, sha256Hex, toDateOnly } from "../_shared/ingest-utils.ts";

const MAX_RECORDS = 50_000;
const CHUNK_SIZE = 500;
const MAX_VALUE = 1e12;
const OVERLOAD_RETRY_AFTER_SECONDS = 30;

type CanonicalMetric = {
  metric_type: string;
  date: string;
  value: number;
  region: string;
  segment: string;
  quality_score: number;
};

type ClaimedJob = {
  job_id: string;
  created: boolean;
  job_status: string;
  records_synced: number | null;
  error_message: string | null;
};

function identity(metric: CanonicalMetric): string {
  return [metric.metric_type.toLowerCase(), metric.date, metric.region, metric.segment].join("\u001f");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const logger = createLogger("queued-metric-ingest", req);
  const respond = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return respond({ error: "Queued ingestion unavailable" }, 503);
  const svc = createClient(supabaseUrl, serviceKey);

  let jobId: string | null = null;
  try {
    const apiKey = req.headers.get("x-api-key")?.trim();
    const requestId = req.headers.get("x-request-id")?.trim();
    const datasetId = req.headers.get("x-dataset-id")?.trim();
    if (!apiKey) return respond({ error: "x-api-key header required" }, 401);
    if (!requestId || requestId.length > 128) return respond({ error: "x-request-id is required and must be <= 128 characters" }, 400);
    if (!datasetId) return respond({ error: "x-dataset-id header required for queued ingestion" }, 400);

    const keyHash = await sha256Hex(apiKey);
    const { data: source, error: sourceError } = await svc
      .from("data_sources")
      .select("id,organization_id")
      .eq("credentials_key_hash", keyHash)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (sourceError) return respond({ error: "Ingestion authentication unavailable" }, 503);
    if (!source?.id || !source.organization_id) return respond({ error: "Invalid API key" }, 401);
    logger.setOrg(source.organization_id);

    const { data: dataset, error: datasetError } = await svc
      .from("datasets")
      .select("id")
      .eq("id", datasetId)
      .eq("organization_id", source.organization_id)
      .maybeSingle();
    if (datasetError) return respond({ error: `Dataset scope validation failed: ${datasetError.message}` }, 503);
    if (!dataset?.id) return respond({ error: "Dataset not found for API-key organization" }, 403);

    const existing = await findIdempotentJob(svc, requestId, source.organization_id, source.id);
    if (existing) {
      const terminal = ["completed", "partial", "failed"].includes(existing.status);
      return respond({
        idempotent_replay: true,
        job_id: existing.id,
        job_status: existing.status,
        records_synced: existing.records_synced ?? 0,
        error_message: existing.error_message,
      }, existing.status === "failed" ? 409 : terminal ? 200 : 202);
    }

    const parsed = await parseJsonBody(req);
    if (parsed.error) return respond({ error: parsed.error }, 400);
    const body = parsed.body;
    const records = Array.isArray(body)
      ? body
      : isRecord(body) && Array.isArray(body.records)
        ? body.records
        : [];
    if (records.length === 0) return respond({ error: "Body must contain a non-empty records array" }, 400);
    if (records.length > MAX_RECORDS) return respond({ error: `Max ${MAX_RECORDS} records per queued request` }, 413);

    const validated: CanonicalMetric[] = [];
    const validationErrors: string[] = [];
    for (let i = 0; i < records.length; i++) {
      const raw = records[i];
      if (!isRecord(raw)) {
        validationErrors.push(`Record ${i}: invalid object`);
        continue;
      }
      const metricType = typeof raw.metric_type === "string" ? raw.metric_type.trim() : "";
      if (!metricType || metricType.length > 200) {
        validationErrors.push(`Record ${i}: invalid metric_type`);
        continue;
      }
      const normalizedDate = normalizeDateInput(raw.date ?? raw.period ?? raw.timestamp);
      if (!normalizedDate) {
        validationErrors.push(`Record ${i}: invalid date`);
        continue;
      }
      const value = Number(raw.value ?? raw.amount ?? raw.metric_value);
      if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) {
        validationErrors.push(`Record ${i}: invalid value`);
        continue;
      }
      const quality = raw.quality_score === undefined ? 85 : Number(raw.quality_score);
      if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
        validationErrors.push(`Record ${i}: quality_score must be between 0 and 100`);
        continue;
      }
      validated.push({
        metric_type: metricType,
        date: toDateOnly(normalizedDate),
        value,
        region: String(raw.region ?? raw.country ?? "").trim(),
        segment: String(raw.segment ?? raw.category ?? "").trim(),
        quality_score: quality,
      });
    }

    // High-volume ingestion is atomic at the request acceptance boundary. A
    // malformed record causes a 422 and no queue/job side effects, preventing
    // clients from believing an incomplete batch was durably accepted.
    if (validationErrors.length > 0) {
      return respond({
        error: "Queued batch rejected because one or more records are invalid",
        records_received: records.length,
        invalid_records: validationErrors.length,
        validation_errors: validationErrors.slice(0, 50),
      }, 422);
    }

    const deduped = new Map<string, CanonicalMetric>();
    for (const metric of validated) deduped.set(identity(metric), metric);
    const metrics = Array.from(deduped.values());

    // Atomic database claim closes the read-before-insert race above. If an
    // identical request won between the early lookup and this RPC, this caller
    // returns that same job instead of creating or enqueueing duplicate work.
    const { data: claimRows, error: claimError } = await svc.rpc("claim_metric_ingest_job", {
      _organization_id: source.organization_id,
      _data_source_id: source.id,
      _request_id: requestId,
    });
    if (claimError) throw new Error(`Idempotency claim failed: ${claimError.message}`);
    const claim = Array.isArray(claimRows) ? claimRows[0] as ClaimedJob | undefined : undefined;
    if (!claim?.job_id) throw new Error("Idempotency claim returned no job");

    if (!claim.created) {
      const terminal = ["completed", "partial", "failed"].includes(claim.job_status);
      return respond({
        idempotent_replay: true,
        job_id: claim.job_id,
        job_status: claim.job_status,
        records_synced: claim.records_synced ?? 0,
        error_message: claim.error_message,
      }, claim.job_status === "failed" ? 409 : terminal ? 200 : 202);
    }
    jobId = claim.job_id;

    const chunks: Array<Record<string, unknown>> = [];
    for (let i = 0; i < metrics.length; i += CHUNK_SIZE) {
      const chunkIndex = Math.floor(i / CHUNK_SIZE);
      chunks.push({
        chunk_id: `${requestId}:${chunkIndex}`,
        job_id: jobId,
        organization_id: source.organization_id,
        dataset_id: datasetId,
        data_source_id: source.id,
        request_id: requestId,
        source_type: "queued_api",
        metrics: metrics.slice(i, i + CHUNK_SIZE),
      });
    }

    const { data: chunkCount, error: enqueueError } = await svc.rpc("enqueue_metric_ingest_job", {
      _job_id: jobId,
      _organization_id: source.organization_id,
      _data_source_id: source.id,
      _chunks: chunks,
    });
    if (enqueueError) {
      const isBackpressure = enqueueError.message.includes("METRIC_QUEUE_BACKPRESSURE") || enqueueError.message.includes("METRIC_QUEUE_PAUSED");
      if (isBackpressure) {
        // The enqueue RPC rejects before sending any PGMQ message. Remove the
        // provisional idempotency claim so the SAME request ID can be retried
        // after capacity becomes available.
        const { error: cleanupError } = await svc
          .from("data_sync_jobs")
          .delete()
          .eq("id", jobId)
          .eq("organization_id", source.organization_id)
          .eq("data_source_id", source.id)
          .eq("status", "pending")
          .eq("chunks_total", 0);
        if (cleanupError) {
          await failSyncJob(svc, { jobId, errorMessage: `Backpressure rejection cleanup failed: ${cleanupError.message}` });
          return respond({ error: "Queue overloaded and retry state could not be reset safely", job_id: jobId }, 503);
        }

        const rejectedJobId = jobId;
        jobId = null;
        logger.info("queued ingest rejected by backpressure", {
          request_id: requestId,
          dataset_id: datasetId,
          provisional_job_id: rejectedJobId,
          reason: enqueueError.message,
        });
        return respond({
          accepted: false,
          retryable: true,
          error: enqueueError.message.includes("PAUSED") ? "Metric ingestion is temporarily paused" : "Metric ingestion queue is at capacity",
          retry_after_seconds: OVERLOAD_RETRY_AFTER_SECONDS,
        }, 429, { "Retry-After": String(OVERLOAD_RETRY_AFTER_SECONDS) });
      }

      await failSyncJob(svc, { jobId, errorMessage: `Atomic queue enqueue failed: ${enqueueError.message}` });
      return respond({ error: "Queued ingestion could not be accepted", job_id: jobId }, 503);
    }

    const { error: auditError } = await svc.from("audit_log").insert({
      organization_id: source.organization_id,
      actor_type: "system",
      action_type: "queued_metric_ingest_accepted",
      resource_type: "data_source",
      resource_id: source.id,
      payload: {
        job_id: jobId,
        request_id: requestId,
        dataset_id: datasetId,
        records_received: records.length,
        unique_records_queued: metrics.length,
        duplicate_identities_collapsed: records.length - metrics.length,
        chunks_queued: chunkCount,
      },
    });
    if (auditError) {
      // The batch is already durable and must not be falsely reported rejected.
      logger.error("queued ingest acceptance audit failed", { job_id: jobId, error: auditError.message });
    }

    return respond({
      accepted: true,
      durable: true,
      job_id: jobId,
      job_status: "pending",
      records_received: records.length,
      unique_records_queued: metrics.length,
      duplicate_identities_collapsed: records.length - metrics.length,
      chunks_queued: chunkCount,
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jobId) {
      try { await failSyncJob(svc, { jobId, errorMessage: message }); } catch { /* preserve original failure */ }
    }
    logger.error("queued metric ingest failed", { job_id: jobId, error: message });
    return respond({ error: message, job_id: jobId }, 500);
  }
});
