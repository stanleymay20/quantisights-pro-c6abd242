import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  createSyncJob,
  failSyncJob,
  finalizeSyncJob,
  findIdempotentJob,
} from "../_shared/ingest-jobs.ts";
import { sha256Hex, normalizeDateInput, isRecord } from "../_shared/ingest-utils.ts";

/* ── Limits ─────────────────────────────────────────────────────── */
const MAX_RECORDS_PER_REQUEST = 10_000;
const MAX_RECORDS_PER_HOUR = 50_000;
const MAX_BODY_SIZE = 100 * 1024; // 100 KB
const MAX_VALUE = 1e12;
const MAX_DATE_AGE_YEARS = 5;
const BATCH_SIZE = 500;

/* ── Helpers ─────────────────────────────────────────────────────── */

function isValidISODate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(d) && !isNaN(Date.parse(d));
}

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error (unserializable)";
  }
}

interface StructuredLog {
  fn: string;
  step: string;
  ts: string;
  [key: string]: unknown;
}

function structuredLog(step: string, details: Record<string, unknown>): void {
  const entry: StructuredLog = {
    fn: "webhook-ingest",
    step,
    ts: new Date().toISOString(),
    ...details,
  };
  console.log(JSON.stringify(entry));
}

interface RecordError {
  index: number;
  reason: string;
  record_excerpt?: Record<string, unknown>;
}

function excerptRecord(r: unknown): Record<string, unknown> | undefined {
  if (!isRecord(r)) return undefined;
  const ex: Record<string, unknown> = {};
  let count = 0;
  for (const [k, v] of Object.entries(r)) {
    if (count >= 5) break;
    ex[k] = typeof v === "string" ? v.slice(0, 80) : v;
    count++;
  }
  return ex;
}

/* ── Main handler ─────────────────────────────────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let jobId: string | null = null;
  let sourceId: string | null = null;
  let orgId: string | null = null;

  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const fail = async (
    status: number,
    error: string,
    stage: string,
    details?: Record<string, unknown>,
  ) => {
    const requestId = req.headers.get("x-request-id");
    structuredLog("error", {
      source_id: sourceId,
      organization_id: orgId,
      request_id: requestId,
      error,
      stage,
      ...details,
    });
    if (jobId) {
      await failSyncJob(supabase, { jobId, errorMessage: error });
    }
    return respond(
      {
        error,
        stage,
        request_id: requestId,
        ...details,
      },
      status,
    );
  };

  try {
    /* ── 1. Auth ────────────────────────────────────────────── */
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return fail(401, "x-api-key header required", "auth");

    const requestId = req.headers.get("x-request-id");
    if (!requestId) return fail(400, "x-request-id header required for idempotency", "auth");

    const keyHash = await sha256Hex(apiKey);

    const { data: source, error: srcErr } = await supabase
      .from("data_sources")
      .select("id, organization_id, name, config")
      .eq("credentials_key_hash", keyHash)
      .eq("source_type", "webhook")
      .eq("status", "active")
      .single();

    if (srcErr || !source) return fail(403, "Invalid API key", "auth");

    sourceId = source.id;
    orgId = source.organization_id;

    structuredLog("authenticated", {
      source_id: sourceId,
      organization_id: orgId,
      request_id: requestId,
    });

    /* ── 2. Idempotency ─────────────────────────────────────── */
    const existing = await findIdempotentJob(supabase, requestId, orgId!, sourceId!);
    if (existing) {
      structuredLog("idempotent_replay", {
        request_id: requestId,
        job_id: existing.id,
        job_status: existing.status,
      });
      return respond(
        {
          success: existing.status !== "failed",
          idempotent: true,
          job_id: existing.id,
          job_status: existing.status,
          records_synced: existing.records_synced ?? 0,
          error_message: existing.error_message,
        },
        existing.status === "failed" ? 409 : 200,
      );
    }

    /* ── 3. Subscription check ──────────────────────────────── */
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", orgId!)
      .eq("status", "active")
      .maybeSingle();

    if (!sub) return fail(403, "Active subscription required", "subscription");

    /* ── 4. Rate limiting ───────────────────────────────────── */
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recentJobs } = await supabase
      .from("data_sync_jobs")
      .select("records_synced")
      .eq("data_source_id", sourceId!)
      .eq("status", "completed")
      .gte("completed_at", oneHourAgo);

    const recentRecords = (recentJobs || []).reduce(
      (sum: number, j: { records_synced: number | null }) => sum + (j.records_synced || 0),
      0,
    );
    if (recentRecords >= MAX_RECORDS_PER_HOUR) {
      return fail(429, `Rate limit exceeded: ${MAX_RECORDS_PER_HOUR} records/hour`, "rate_limit", {
        recent_records: recentRecords,
      });
    }

    /* ── 5. Body size check ─────────────────────────────────── */
    const contentLength = parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      return fail(413, `Request body exceeds ${MAX_BODY_SIZE} bytes limit`, "body_size");
    }

    /* ── 6. Create sync job ─────────────────────────────────── */
    jobId = await createSyncJob(supabase, {
      dataSourceId: sourceId!,
      organizationId: orgId!,
      requestId,
      status: "running",
    });

    /* ── 7. Parse body ──────────────────────────────────────── */
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_SIZE) {
      return fail(413, `Request body exceeds ${MAX_BODY_SIZE} bytes limit`, "body_size");
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return fail(400, "Invalid JSON body", "parse");
    }

    /* ── 8. Extract records array ───────────────────────────── */
    let records: unknown[];
    if (Array.isArray(body)) {
      records = body;
    } else if (isRecord(body)) {
      if (Array.isArray((body as Record<string, unknown>).records)) {
        records = (body as Record<string, unknown>).records as unknown[];
      } else if (Array.isArray((body as Record<string, unknown>).data)) {
        records = (body as Record<string, unknown>).data as unknown[];
      } else {
        // Single record wrapped in an object
        records = [body];
      }
    } else {
      return fail(400, "Body must be a JSON object or array", "parse");
    }

    if (records.length === 0) {
      return fail(400, "No records provided", "validation");
    }

    if (records.length > MAX_RECORDS_PER_REQUEST) {
      return fail(
        400,
        `Exceeds max ${MAX_RECORDS_PER_REQUEST} records per request`,
        "batch_size",
        { received: records.length, max: MAX_RECORDS_PER_REQUEST },
      );
    }

    if (recentRecords + records.length > MAX_RECORDS_PER_HOUR) {
      return fail(
        429,
        `Would exceed hourly rate limit of ${MAX_RECORDS_PER_HOUR} records`,
        "rate_limit",
        { current: recentRecords, incoming: records.length },
      );
    }

    structuredLog("payload_parsed", {
      source_id: sourceId,
      request_id: requestId,
      record_count: records.length,
    });

    /* ── 9. Validate and map records ────────────────────────── */
    const sourceConfig = isRecord(source.config) ? source.config as Record<string, unknown> : {};
    const fieldMap = (sourceConfig.field_mapping ?? {}) as Record<string, string>;
    const defaultMetricType = (sourceConfig.default_metric_type as string) || "revenue";
    const datasetId = (sourceConfig.dataset_id as string) || null;
    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - MAX_DATE_AGE_YEARS);

    const validationErrors: RecordError[] = [];
    const metrics: Record<string, unknown>[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];

      if (!isRecord(r)) {
        validationErrors.push({
          index: i,
          reason: "Record is not a valid JSON object",
          record_excerpt: undefined,
        });
        continue;
      }

      const rec = r as Record<string, unknown>;
      const dateField = fieldMap.date || "date";
      const valueField = fieldMap.value || "value";
      const metricField = fieldMap.metric_type || "metric_type";
      const regionField = fieldMap.region || "region";
      const segmentField = fieldMap.segment || "segment";

      // Extract and normalize date
      let date = normalizeDateInput(rec[dateField]);
      if (!date || !isValidISODate(date)) {
        validationErrors.push({
          index: i,
          reason: `Invalid or missing date in field "${dateField}": ${JSON.stringify(rec[dateField])}`,
          record_excerpt: excerptRecord(rec),
        });
        continue;
      }

      if (new Date(date) < minDate) {
        validationErrors.push({
          index: i,
          reason: `Date older than ${MAX_DATE_AGE_YEARS} years`,
          record_excerpt: excerptRecord(rec),
        });
        continue;
      }

      // Validate value
      const rawValue = rec[valueField];
      const value = parseFloat(String(rawValue ?? ""));
      if (isNaN(value) || !isFinite(value)) {
        validationErrors.push({
          index: i,
          reason: `Value must be a finite number in field "${valueField}": ${JSON.stringify(rawValue)}`,
          record_excerpt: excerptRecord(rec),
        });
        continue;
      }
      if (Math.abs(value) > MAX_VALUE) {
        validationErrors.push({
          index: i,
          reason: `Value ${value} exceeds max ±${MAX_VALUE}`,
          record_excerpt: excerptRecord(rec),
        });
        continue;
      }

      metrics.push({
        organization_id: orgId,
        dataset_id: datasetId,
        metric_type: typeof rec[metricField] === "string" && rec[metricField]
          ? rec[metricField]
          : defaultMetricType,
        date,
        value,
        region: (typeof rec[regionField] === "string" ? (rec[regionField] as string).trim() : ""),
        segment: (typeof rec[segmentField] === "string" ? (rec[segmentField] as string).trim() : ""),
        source_id: sourceId,
      });
    }

    if (metrics.length === 0) {
      const errSummary = validationErrors.slice(0, 20);
      structuredLog("all_records_invalid", {
        source_id: sourceId,
        request_id: requestId,
        total_received: records.length,
        validation_error_count: validationErrors.length,
      });
      return fail(400, "No valid records after validation", "validation", {
        total_received: records.length,
        total_failed: validationErrors.length,
        errors: errSummary,
      });
    }

    /* ── 10. Batch upsert with per-batch error recovery ───── */
    let inserted = 0;
    const writeErrors: RecordError[] = [];

    // Dedupe within each batch on the upsert conflict key — Postgres rejects
    // ON CONFLICT when the same key appears twice in one statement.
    const CONFLICT_KEYS = ["organization_id", "metric_type", "date", "region", "segment", "source_id"] as const;
    // Normalize like Postgres will after upsert: trim whitespace and lowercase
    // metric_type so "Revenue" and "revenue " collapse to the same conflict key
    // and the ON CONFLICT DO UPDATE statement can't hit the same row twice.
    const normalizeKeyPart = (k: string, v: unknown): string => {
      if (v === null || v === undefined) return "";
      const s = String(v).trim();
      return k === "metric_type" ? s.toLowerCase() : s;
    };
    const dedupeKey = (r: Record<string, unknown>) =>
      CONFLICT_KEYS.map((k) => normalizeKeyPart(k, r[k])).join("|");

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const rawBatch = metrics.slice(i, i + BATCH_SIZE);
      // Last-write-wins dedupe inside the batch
      const seen = new Map<string, Record<string, unknown>>();
      for (const row of rawBatch) seen.set(dedupeKey(row as Record<string, unknown>), row);
      const batch = Array.from(seen.values());
      const batchIndex = Math.floor(i / BATCH_SIZE);

      const { error: upsertErr } = await supabase
        .from("metrics")
        .upsert(batch, {
          onConflict: "organization_id,metric_type,date,region,segment,source_id",
        });

      if (upsertErr) {
        const errMsg = safeErrorMessage(upsertErr);
        structuredLog("batch_write_error", {
          source_id: sourceId,
          request_id: requestId,
          batch_index: batchIndex,
          batch_size: batch.length,
          error: errMsg,
        });

        // If batch fails, try individual inserts for recovery
        for (let j = 0; j < batch.length; j++) {
          const { error: singleErr } = await supabase
            .from("metrics")
            .upsert([batch[j]], {
              onConflict: "organization_id,metric_type,date,region,segment,source_id",
            });

          if (singleErr) {
            writeErrors.push({
              index: i + j,
              reason: `Write failed: ${safeErrorMessage(singleErr)}`,
              record_excerpt: excerptRecord(batch[j]),
            });
          } else {
            inserted++;
          }
        }
      } else {
        inserted += batch.length;
      }
    }


    /* ── 11. Finalize job ────────────────────────────────────── */
    const allErrors = [
      ...validationErrors.map((e) => `Record ${e.index}: ${e.reason}`),
      ...writeErrors.map((e) => `Record ${e.index}: ${e.reason}`),
    ];

    await finalizeSyncJob(supabase, {
      jobId,
      inserted,
      errors: allErrors,
    });

    await supabase
      .from("data_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", sourceId!);

    // Refresh precomputed metric summaries (fire-and-forget, non-blocking)
    if (inserted > 0 && orgId && datasetId) {
      supabase.rpc("refresh_metric_summaries", {
        _org_id: orgId,
        _dataset_id: datasetId,
      }).then(({ error }) => {
        if (error) structuredLog("summary_refresh_error", { error: safeErrorMessage(error) });
        else structuredLog("summary_refreshed", { org_id: orgId, dataset_id: datasetId });
      });
    }

    const executionMs = Date.now() - startTime;

    structuredLog("complete", {
      source_id: sourceId,
      organization_id: orgId,
      request_id: requestId,
      total_received: records.length,
      total_processed: metrics.length,
      total_succeeded: inserted,
      total_failed: validationErrors.length + writeErrors.length,
      execution_time_ms: executionMs,
      job_id: jobId,
    });

    /* ── 12. Response ────────────────────────────────────────── */
    const combinedErrors = [...validationErrors, ...writeErrors];
    const responseBody: Record<string, unknown> = {
      success: inserted > 0,
      total_received: records.length,
      total_processed: metrics.length,
      total_succeeded: inserted,
      total_failed: validationErrors.length + writeErrors.length,
      job_id: jobId,
      request_id: requestId,
      execution_ms: executionMs,
    };

    if (combinedErrors.length > 0) {
      responseBody.errors = combinedErrors.slice(0, 20);
    }

    // Status: 200 if all ok, 200 if partial, 400 if none succeeded
    const httpStatus = inserted === 0 ? 400 : 200;

    return respond(responseBody, httpStatus);
  } catch (err: unknown) {
    const message = safeErrorMessage(err);
    return fail(500, message, "unhandled_exception");
  }
});
