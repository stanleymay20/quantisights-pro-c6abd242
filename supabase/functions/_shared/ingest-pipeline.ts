/**
 * Unified Ingestion Pipeline
 *
 * Stages: queued → extracting → validating → extracted → transforming →
 *         transformed → aggregating → complete | partial_success | failed
 *
 * All connector ingestion (CSV, REST, webhook, future DB sources) flows
 * through this pipeline. It is responsible for:
 *  - creating a connector_sync_runs row
 *  - writing extracted rows to raw_records
 *  - applying field mappings to produce metric rows
 *  - capturing per-row errors in connector_sync_run_errors
 *  - emitting connector_lineage_events at each stage
 *  - refreshing metric summaries/aggregates on success
 *  - finalizing the run with timing + counts
 *
 * Tenant safety: every write includes organization_id; the connector and
 * dataset are validated to belong to the same organization before any rows
 * are touched.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type SvcClient = any;

export interface ExtractedRow {
  /** Raw payload from the source (CSV row, REST item, etc.) */
  raw: Record<string, unknown>;
  /** Optional per-row index from the source */
  index?: number;
}

export interface FieldMapping {
  /** Canonical field name (metric_type, value, date, region, segment, ...) */
  canonical: string;
  /** Data type expected: text | number | date */
  data_type: "text" | "number" | "date";
  required?: boolean;
}

export interface PipelineConnector {
  id: string;
  organization_id: string;
  dataset_id: string | null;
  name: string;
  connector_type: string;
  cursor_field: string | null;
}

export interface RunContext {
  connector: PipelineConnector;
  runId: string;
  requestId: string;
  triggeredBy: "manual" | "schedule" | "api";
  /** source_field → mapping definition */
  mappings: Record<string, FieldMapping>;
  /** Optional cursor checkpoint to start from */
  checkpointBefore?: Record<string, unknown> | null;
}

export interface FinalizeResult {
  status: "complete" | "partial_success" | "failed";
  rows_extracted: number;
  rows_valid: number;
  rows_invalid: number;
  rows_inserted: number;
  rows_skipped: number;
  duration_ms: number;
  error_summary?: string;
}

const STAGE_TIMINGS_KEY = "stage_timings";

export function makeServiceClient(): SvcClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Find an existing run for the same (connector, request_id), used for replay protection. */
export async function findExistingRun(
  svc: SvcClient,
  connectorId: string,
  requestId: string,
): Promise<{ id: string; status: string } | null> {
  const { data } = await svc
    .from("connector_sync_runs")
    .select("id,status")
    .eq("connector_id", connectorId)
    .eq("request_id", requestId)
    .maybeSingle();
  return (data as { id: string; status: string } | null) ?? null;
}

export async function createRun(
  svc: SvcClient,
  connector: PipelineConnector,
  requestId: string,
  triggeredBy: "manual" | "schedule" | "api",
  checkpointBefore?: Record<string, unknown> | null,
): Promise<string> {
  const { data, error } = await svc
    .from("connector_sync_runs")
    .insert({
      organization_id: connector.organization_id,
      connector_id: connector.id,
      dataset_id: connector.dataset_id,
      request_id: requestId,
      triggered_by: triggeredBy,
      status: "queued",
      current_stage: "queued",
      checkpoint_before: checkpointBefore ?? null,
    })
    .select("id")
    .single();
  if (error || !data?.id) throw new Error(`createRun failed: ${error?.message}`);
  return data.id as string;
}

export async function setStage(
  svc: SvcClient,
  runId: string,
  stage: string,
  status?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { current_stage: stage };
  if (status) patch.status = status;
  await svc.from("connector_sync_runs").update(patch).eq("id", runId);
}

export async function recordLineage(
  svc: SvcClient,
  ctx: RunContext,
  eventType: "extract" | "validate" | "transform" | "aggregate",
  recordsCount: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  await svc.from("connector_lineage_events").insert({
    organization_id: ctx.connector.organization_id,
    connector_id: ctx.connector.id,
    sync_run_id: ctx.runId,
    dataset_id: ctx.connector.dataset_id,
    event_type: eventType,
    records_count: recordsCount,
    details,
  });
}

export async function recordError(
  svc: SvcClient,
  ctx: RunContext,
  errorKind: "validation" | "transform" | "insert" | "extract",
  errorMessage: string,
  rowIndex?: number,
  rawPayload?: Record<string, unknown>,
): Promise<void> {
  await svc.from("connector_sync_run_errors").insert({
    organization_id: ctx.connector.organization_id,
    sync_run_id: ctx.runId,
    connector_id: ctx.connector.id,
    error_kind: errorKind,
    row_index: rowIndex ?? null,
    raw_payload: rawPayload ?? null,
    error_message: errorMessage.slice(0, 2000),
  });
}

// ----------------------------------------------------------------------------
// Stage 1: write extracted rows to raw_records
// ----------------------------------------------------------------------------
export async function persistRawRecords(
  svc: SvcClient,
  ctx: RunContext,
  rows: ExtractedRow[],
): Promise<{ raw_ids: string[] }> {
  if (rows.length === 0) return { raw_ids: [] };
  if (!ctx.connector.dataset_id) {
    throw new Error("Connector has no linked dataset_id — cannot persist raw_records");
  }

  const ingestedAt = new Date().toISOString();
  const payload = rows.map((r, i) => ({
    organization_id: ctx.connector.organization_id,
    dataset_id: ctx.connector.dataset_id,
    row_index: r.index ?? i,
    raw_data: r.raw,
    transform_status: "pending",
    ingested_at: ingestedAt,
    data_origin: "client",
    source_name: `connector:${ctx.connector.name}`,
  }));

  // Insert in chunks of 500 to stay within payload limits
  const ids: string[] = [];
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { data, error } = await svc.from("raw_records").insert(chunk).select("id");
    if (error) throw new Error(`raw_records insert failed: ${error.message}`);
    for (const row of data ?? []) ids.push((row as { id: string }).id);
  }
  return { raw_ids: ids };
}

// ----------------------------------------------------------------------------
// Stage 2: validate + transform extracted rows into canonical metric records
// ----------------------------------------------------------------------------
export interface CanonicalMetric {
  metric_type: string;
  value: number;
  date: string;
  region?: string | null;
  segment?: string | null;
  source_id?: string | null;
  source_name?: string | null;
  raw_index: number;
}

export interface TransformResult {
  valid: CanonicalMetric[];
  invalid: Array<{ index: number; reason: string; raw: Record<string, unknown> }>;
}

export function transformWithMappings(
  rows: ExtractedRow[],
  mappings: Record<string, FieldMapping>,
  connectorName: string,
): TransformResult {
  const valid: CanonicalMetric[] = [];
  const invalid: TransformResult["invalid"] = [];

  // Reverse map: canonical → source field
  const canonicalToSource: Record<string, string> = {};
  for (const [src, m] of Object.entries(mappings)) canonicalToSource[m.canonical] = src;

  const requiredCanonical = ["metric_type", "value", "date"];
  const missingRequired = requiredCanonical.filter((c) => !canonicalToSource[c]);
  if (missingRequired.length > 0) {
    return {
      valid: [],
      invalid: rows.map((r, i) => ({
        index: r.index ?? i,
        reason: `Mapping incomplete — missing canonical: ${missingRequired.join(", ")}`,
        raw: r.raw,
      })),
    };
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const idx = r.index ?? i;
    try {
      const metricType = pickString(r.raw, canonicalToSource["metric_type"]);
      const value = pickNumber(r.raw, canonicalToSource["value"]);
      const date = pickDate(r.raw, canonicalToSource["date"]);

      if (!metricType) throw new Error("metric_type is empty");
      if (value === null || Number.isNaN(value)) throw new Error("value is not numeric");
      if (!date) throw new Error("date could not be parsed");

      valid.push({
        metric_type: metricType,
        value,
        date,
        region: canonicalToSource["region"]
          ? pickString(r.raw, canonicalToSource["region"])
          : null,
        segment: canonicalToSource["segment"]
          ? pickString(r.raw, canonicalToSource["segment"])
          : null,
        source_id: canonicalToSource["source_id"]
          ? pickString(r.raw, canonicalToSource["source_id"])
          : null,
        source_name: connectorName,
        raw_index: idx,
      });
    } catch (e) {
      invalid.push({
        index: idx,
        reason: e instanceof Error ? e.message : String(e),
        raw: r.raw,
      });
    }
  }

  return { valid, invalid };
}

function pickString(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function pickNumber(raw: Record<string, unknown>, key: string): number | null {
  const v = raw[key];
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function pickDate(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  // YYYY only → first day of year
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  // ISO YYYY-MM-DD or full timestamp
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

// ----------------------------------------------------------------------------
// Stage 3: insert canonical metrics
// ----------------------------------------------------------------------------
export async function insertMetrics(
  svc: SvcClient,
  ctx: RunContext,
  metrics: CanonicalMetric[],
): Promise<{ inserted: number; errors: Array<{ index: number; reason: string }> }> {
  if (metrics.length === 0) return { inserted: 0, errors: [] };
  if (!ctx.connector.dataset_id) {
    return {
      inserted: 0,
      errors: metrics.map((m) => ({ index: m.raw_index, reason: "No dataset linked" })),
    };
  }

  const payload = metrics.map((m) => ({
    organization_id: ctx.connector.organization_id,
    dataset_id: ctx.connector.dataset_id,
    metric_type: m.metric_type,
    value: m.value,
    date: m.date,
    region: m.region,
    segment: m.segment,
    source_id: m.source_id,
    source_name: m.source_name,
    data_origin: "client",
  }));

  let inserted = 0;
  const errors: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const chunkOriginal = metrics.slice(i, i + 500);
    const { error, count } = await svc
      .from("metrics")
      .insert(chunk, { count: "exact" });
    if (error) {
      // poison batch: try one-by-one to isolate
      for (let j = 0; j < chunk.length; j++) {
        const single = chunk[j];
        const { error: singleErr } = await svc.from("metrics").insert(single);
        if (singleErr) {
          errors.push({
            index: chunkOriginal[j].raw_index,
            reason: singleErr.message,
          });
        } else {
          inserted++;
        }
      }
    } else {
      inserted += count ?? chunk.length;
    }
  }

  return { inserted, errors };
}

// ----------------------------------------------------------------------------
// Stage 4: refresh aggregates/summaries (best-effort)
// ----------------------------------------------------------------------------
export async function refreshAggregates(
  svc: SvcClient,
  ctx: RunContext,
): Promise<void> {
  if (!ctx.connector.dataset_id) return;
  try {
    await svc.rpc("refresh_metric_summaries", {
      _org_id: ctx.connector.organization_id,
      _dataset_id: ctx.connector.dataset_id,
    });
    await svc.rpc("refresh_metric_aggregates", {
      _org_id: ctx.connector.organization_id,
      _dataset_id: ctx.connector.dataset_id,
      _period_type: "monthly",
    });
  } catch {
    // best-effort — do not fail run on aggregation issues
  }
}

// ----------------------------------------------------------------------------
// Finalize: compute status, persist counts + timings, update connector health
// ----------------------------------------------------------------------------
export async function finalizeRun(
  svc: SvcClient,
  ctx: RunContext,
  startedAtMs: number,
  counts: {
    rows_extracted: number;
    rows_valid: number;
    rows_invalid: number;
    rows_inserted: number;
    rows_skipped: number;
  },
  stageTimings: Record<string, number>,
  errorSummary?: string,
  checkpointAfter?: Record<string, unknown> | null,
): Promise<FinalizeResult> {
  const duration_ms = Date.now() - startedAtMs;

  const status: FinalizeResult["status"] =
    counts.rows_inserted === 0 && counts.rows_extracted > 0
      ? "failed"
      : counts.rows_invalid > 0
        ? "partial_success"
        : "complete";

  await svc
    .from("connector_sync_runs")
    .update({
      status,
      current_stage: status,
      completed_at: new Date().toISOString(),
      duration_ms,
      rows_extracted: counts.rows_extracted,
      rows_valid: counts.rows_valid,
      rows_invalid: counts.rows_invalid,
      rows_inserted: counts.rows_inserted,
      rows_skipped: counts.rows_skipped,
      checkpoint_after: checkpointAfter ?? null,
      error_summary: errorSummary?.slice(0, 2000) ?? null,
      [STAGE_TIMINGS_KEY]: stageTimings,
    })
    .eq("id", ctx.runId);

  // Update connector health
  const isFailure = status === "failed";
  const update: Record<string, unknown> = isFailure
    ? {
        last_error_at: new Date().toISOString(),
        last_error_message: (errorSummary ?? "Run failed").slice(0, 500),
        consecutive_failures: undefined, // increment via RPC below if we had one — simple set:
        health: "unhealthy",
      }
    : {
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        health: status === "partial_success" ? "degraded" : "healthy",
        last_error_message: null,
      };

  if (isFailure) {
    // increment via raw select+update (no RPC)
    const { data: c } = await svc
      .from("data_connectors")
      .select("consecutive_failures")
      .eq("id", ctx.connector.id)
      .maybeSingle();
    update.consecutive_failures =
      ((c as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
  }

  await svc.from("data_connectors").update(update).eq("id", ctx.connector.id);

  // Persist checkpoint for incremental syncs
  if (ctx.connector.cursor_field && checkpointAfter) {
    await svc
      .from("connector_sync_checkpoints")
      .upsert(
        {
          organization_id: ctx.connector.organization_id,
          connector_id: ctx.connector.id,
          cursor_field: ctx.connector.cursor_field,
          cursor_value: String(checkpointAfter[ctx.connector.cursor_field] ?? ""),
          last_sync_run_id: ctx.runId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "connector_id,cursor_field" },
      );
  }

  return {
    status,
    duration_ms,
    error_summary: errorSummary,
    ...counts,
  };
}

export async function failRun(
  svc: SvcClient,
  ctx: RunContext,
  startedAtMs: number,
  errorMessage: string,
): Promise<void> {
  await svc
    .from("connector_sync_runs")
    .update({
      status: "failed",
      current_stage: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAtMs,
      error_summary: errorMessage.slice(0, 2000),
    })
    .eq("id", ctx.runId);

  await svc
    .from("data_connectors")
    .update({
      last_error_at: new Date().toISOString(),
      last_error_message: errorMessage.slice(0, 500),
      health: "unhealthy",
    })
    .eq("id", ctx.connector.id);
}
