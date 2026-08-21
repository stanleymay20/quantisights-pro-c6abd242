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

const MAX_RECORDS_PER_REQUEST = 10_000;
const MAX_RECORDS_PER_HOUR = 50_000;
const MAX_BODY_SIZE = 100 * 1024;
const MAX_VALUE = 1e12;
const MAX_DATE_AGE_YEARS = 5;
const BATCH_SIZE = 500;
const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";

function isValidISODate(d: string): boolean {
  return /^\d{4}-\d{2}-\d{2}/.test(d) && !Number.isNaN(Date.parse(d));
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

function structuredLog(step: string, details: Record<string, unknown>): void {
  console.log(JSON.stringify({
    fn: "webhook-ingest",
    step,
    ts: new Date().toISOString(),
    ...details,
  }));
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

function metricIdentity(row: Record<string, unknown>): string {
  return [
    row.organization_id ?? "",
    row.dataset_id ?? "",
    String(row.metric_type ?? "").trim().toLowerCase(),
    row.date ?? "",
    String(row.region ?? "").trim(),
    String(row.segment ?? "").trim(),
    row.source_id ?? "",
  ].join("\u001f");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const startTime = Date.now();

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!supabaseUrl || !serviceKey) {
    structuredLog("configuration_error", { error: "Missing Supabase service configuration" });
    return respond({ error: "Webhook ingestion service unavailable" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  let jobId: string | null = null;
  let sourceId: string | null = null;
  let orgId: string | null = null;

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
      try {
        await failSyncJob(supabase, { jobId, errorMessage: error });
      } catch (bookkeepingError) {
        structuredLog("job_bookkeeping_error", {
          job_id: jobId,
          error: safeErrorMessage(bookkeepingError),
        });
      }
    }
    return respond({ error, stage, request_id: requestId, ...details }, status);
  };

  try {
    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) return fail(401, "x-api-key header required", "auth");

    const requestId = req.headers.get("x-request-id");
    if (!requestId) return fail(400, "x-request-id header required for idempotency", "auth");

    const keyHash = await sha256Hex(apiKey);
    const { data: source, error: srcErr } = await supabase
      .from("data_sources")
      .select("id,organization_id,name,config")
      .eq("credentials_key_hash", keyHash)
      .eq("source_type", "webhook")
      .eq("status", "active")
      .single();
    if (srcErr || !source) return fail(403, "Invalid API key", "auth");

    sourceId = source.id;
    orgId = source.organization_id;
    structuredLog("authenticated", { source_id: sourceId, organization_id: orgId, request_id: requestId });

    const existing = await findIdempotentJob(supabase, requestId, orgId!, sourceId!);
    if (existing) {
      structuredLog("idempotent_replay", {
        request_id: requestId,
        job_id: existing.id,
        job_status: existing.status,
      });
      return respond({
        success: existing.status === "completed" || existing.status === "partial",
        idempotent: true,
        job_id: existing.id,
        job_status: existing.status,
        records_synced: existing.records_synced ?? 0,
        error_message: existing.error_message,
      }, existing.status === "failed" ? 409 : 200);
    }

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", orgId!)
      .eq("status", "active")
      .maybeSingle();
    if (subError) return fail(500, "Subscription lookup failed", "subscription");
    if (!sub) return fail(403, "Active subscription required", "subscription");

    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { data: recentJobs, error: recentJobsError } = await supabase
      .from("data_sync_jobs")
      .select("records_synced")
      .eq("data_source_id", sourceId!)
      .in("status", ["completed", "partial"])
      .gte("completed_at", oneHourAgo);
    if (recentJobsError) return fail(500, "Rate-limit state unavailable", "rate_limit");

    const recentRecords = (recentJobs || []).reduce(
      (sum: number, j: { records_synced: number | null }) => sum + (j.records_synced || 0),
      0,
    );
    if (recentRecords >= MAX_RECORDS_PER_HOUR) {
      return fail(429, `Rate limit exceeded: ${MAX_RECORDS_PER_HOUR} records/hour`, "rate_limit", {
        recent_records: recentRecords,
      });
    }

    const contentLength = Number.parseInt(req.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      return fail(413, `Request body exceeds ${MAX_BODY_SIZE} bytes limit`, "body_size");
    }

    jobId = await createSyncJob(supabase, {
      dataSourceId: sourceId!,
      organizationId: orgId!,
      requestId,
      status: "running",
    });

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

    let records: unknown[];
    if (Array.isArray(body)) records = body;
    else if (isRecord(body)) {
      if (Array.isArray(body.records)) records = body.records as unknown[];
      else if (Array.isArray(body.data)) records = body.data as unknown[];
      else records = [body];
    } else {
      return fail(400, "Body must be a JSON object or array", "parse");
    }

    if (records.length === 0) return fail(400, "No records provided", "validation");
    if (records.length > MAX_RECORDS_PER_REQUEST) {
      return fail(400, `Exceeds max ${MAX_RECORDS_PER_REQUEST} records per request`, "batch_size", {
        received: records.length,
        max: MAX_RECORDS_PER_REQUEST,
      });
    }
    if (recentRecords + records.length > MAX_RECORDS_PER_HOUR) {
      return fail(429, `Would exceed hourly rate limit of ${MAX_RECORDS_PER_HOUR} records`, "rate_limit", {
        current: recentRecords,
        incoming: records.length,
      });
    }

    const sourceConfig = isRecord(source.config) ? source.config as Record<string, unknown> : {};
    const fieldMap = (sourceConfig.field_mapping ?? {}) as Record<string, string>;
    const defaultMetricType = (sourceConfig.default_metric_type as string) || "revenue";
    const configuredDatasetId = typeof sourceConfig.dataset_id === "string" && sourceConfig.dataset_id
      ? sourceConfig.dataset_id
      : null;

    let datasetId: string | null = null;
    if (configuredDatasetId) {
      const { data: dataset, error: datasetError } = await supabase
        .from("datasets")
        .select("id")
        .eq("id", configuredDatasetId)
        .eq("organization_id", orgId!)
        .maybeSingle();
      if (datasetError) return fail(500, "Configured dataset lookup failed", "dataset_scope");
      if (!dataset?.id) return fail(400, "Configured dataset does not belong to this organization", "dataset_scope");
      datasetId = dataset.id;
    }

    const minDate = new Date();
    minDate.setFullYear(minDate.getFullYear() - MAX_DATE_AGE_YEARS);
    const validationErrors: RecordError[] = [];
    const candidateMetrics: Record<string, unknown>[] = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!isRecord(r)) {
        validationErrors.push({ index: i, reason: "Record is not a valid JSON object" });
        continue;
      }

      const rec = r as Record<string, unknown>;
      const dateField = fieldMap.date || "date";
      const valueField = fieldMap.value || "value";
      const metricField = fieldMap.metric_type || "metric_type";
      const regionField = fieldMap.region || "region";
      const segmentField = fieldMap.segment || "segment";

      const date = normalizeDateInput(rec[dateField]);
      if (!date || !isValidISODate(date)) {
        validationErrors.push({
          index: i,
          reason: `Invalid or missing date in field "${dateField}"`,
          record_excerpt: excerptRecord(rec),
        });
        continue;
      }
      if (new Date(date) < minDate) {
        validationErrors.push({ index: i, reason: `Date older than ${MAX_DATE_AGE_YEARS} years`, record_excerpt: excerptRecord(rec) });
        continue;
      }

      const rawValue = rec[valueField];
      const value = Number.parseFloat(String(rawValue ?? ""));
      if (!Number.isFinite(value) || Math.abs(value) > MAX_VALUE) {
        validationErrors.push({ index: i, reason: `Invalid numeric value in field "${valueField}"`, record_excerpt: excerptRecord(rec) });
        continue;
      }

      candidateMetrics.push({
        organization_id: orgId,
        dataset_id: datasetId,
        metric_type: typeof rec[metricField] === "string" && rec[metricField]
          ? String(rec[metricField]).trim()
          : defaultMetricType,
        date,
        value,
        region: typeof rec[regionField] === "string" ? String(rec[regionField]).trim() : "",
        segment: typeof rec[segmentField] === "string" ? String(rec[segmentField]).trim() : "",
        source_id: sourceId,
      });
    }

    if (candidateMetrics.length === 0) {
      return fail(400, "No valid records after validation", "validation", {
        total_received: records.length,
        total_failed: validationErrors.length,
        errors: validationErrors.slice(0, 20),
      });
    }

    // Dedupe across the entire request rather than independently per batch so
    // the persisted count and rate-limit ledger describe unique metric writes.
    const deduped = new Map<string, Record<string, unknown>>();
    for (const row of candidateMetrics) deduped.set(metricIdentity(row), row);
    const metrics = Array.from(deduped.values());
    const duplicateCount = candidateMetrics.length - metrics.length;

    let inserted = 0;
    const writeErrors: RecordError[] = [];
    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const { error: upsertErr } = await supabase.from("metrics").upsert(batch, {
        onConflict: METRIC_CONFLICT_KEY,
      });

      if (!upsertErr) {
        inserted += batch.length;
        continue;
      }

      structuredLog("batch_write_error", {
        source_id: sourceId,
        request_id: requestId,
        batch_index: Math.floor(i / BATCH_SIZE),
        batch_size: batch.length,
        error: safeErrorMessage(upsertErr),
      });

      for (let j = 0; j < batch.length; j++) {
        const { error: singleErr } = await supabase.from("metrics").upsert(batch[j], {
          onConflict: METRIC_CONFLICT_KEY,
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
    }

    const allErrors = [
      ...validationErrors.map((e) => `Record ${e.index}: ${e.reason}`),
      ...writeErrors.map((e) => `Record ${e.index}: ${e.reason}`),
    ];
    const jobStatus = await finalizeSyncJob(supabase, { jobId, inserted, errors: allErrors });

    // last_synced_at means at least one canonical metric reached storage.
    if (inserted > 0) {
      const { error: sourceFreshnessError } = await supabase
        .from("data_sources")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", sourceId!)
        .eq("organization_id", orgId!);
      if (sourceFreshnessError) {
        structuredLog("source_freshness_error", { error: safeErrorMessage(sourceFreshnessError), job_id: jobId });
      }
    }

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
      job_id: jobId,
      job_status: jobStatus,
      total_received: records.length,
      unique_metric_identities: metrics.length,
      duplicate_identities_collapsed: duplicateCount,
      total_succeeded: inserted,
      total_failed: validationErrors.length + writeErrors.length,
      execution_time_ms: executionMs,
    });

    const combinedErrors = [...validationErrors, ...writeErrors];
    const responseBody: Record<string, unknown> = {
      success: inserted > 0,
      job_status: jobStatus,
      total_received: records.length,
      unique_metric_identities: metrics.length,
      duplicate_identities_collapsed: duplicateCount,
      total_succeeded: inserted,
      total_failed: validationErrors.length + writeErrors.length,
      job_id: jobId,
      request_id: requestId,
      execution_ms: executionMs,
    };
    if (combinedErrors.length > 0) responseBody.errors = combinedErrors.slice(0, 20);

    // At this point at least one input was valid. Zero persisted rows is a
    // server/write failure, not a client validation error.
    return respond(responseBody, inserted === 0 ? 500 : 200);
  } catch (err: unknown) {
    return fail(500, safeErrorMessage(err), "unhandled_exception");
  }
});
