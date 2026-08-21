/**
 * Unified Ingestion Pipeline
 *
 * Stages: queued → extracting → validating → extracted → transforming →
 *         transformed → aggregating → complete | partial_success | failed
 *
 * Shared by connector ingestion paths. The pipeline is intentionally strict
 * about tenant/dataset identity and intentionally replay-safe: a connector
 * retry must update the same canonical metric identity rather than fail on a
 * uniqueness collision or overwrite another dataset.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// deno-lint-ignore no-explicit-any
type SvcClient = any;

export interface ExtractedRow {
  raw: Record<string, unknown>;
  index?: number;
}

export interface FieldMapping {
  canonical: string;
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
  mappings: Record<string, FieldMapping>;
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

export interface AggregateRefreshResult {
  ok: boolean;
  errors: string[];
}

const STAGE_TIMINGS_KEY = "stage_timings";
const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";

export function makeServiceClient(): SvcClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function findExistingRun(
  svc: SvcClient,
  connectorId: string,
  requestId: string,
): Promise<{ id: string; status: string } | null> {
  const { data, error } = await svc
    .from("connector_sync_runs")
    .select("id,status")
    .eq("connector_id", connectorId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(`findExistingRun failed: ${error.message}`);
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
  if (error || !data?.id) throw new Error(`createRun failed: ${error?.message ?? "no row returned"}`);
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
  const { error } = await svc.from("connector_sync_runs").update(patch).eq("id", runId);
  if (error) throw new Error(`setStage(${stage}) failed: ${error.message}`);
}

export async function recordLineage(
  svc: SvcClient,
  ctx: RunContext,
  eventType: "extract" | "validate" | "transform" | "aggregate",
  recordsCount: number,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await svc.from("connector_lineage_events").insert({
    organization_id: ctx.connector.organization_id,
    connector_id: ctx.connector.id,
    sync_run_id: ctx.runId,
    dataset_id: ctx.connector.dataset_id,
    event_type: eventType,
    records_count: recordsCount,
    details,
  });
  if (error) throw new Error(`recordLineage(${eventType}) failed: ${error.message}`);
}

export async function recordError(
  svc: SvcClient,
  ctx: RunContext,
  errorKind: "validation" | "transform" | "insert" | "extract",
  errorMessage: string,
  rowIndex?: number,
  rawPayload?: Record<string, unknown>,
): Promise<void> {
  const { error } = await svc.from("connector_sync_run_errors").insert({
    organization_id: ctx.connector.organization_id,
    sync_run_id: ctx.runId,
    connector_id: ctx.connector.id,
    error_kind: errorKind,
    row_index: rowIndex ?? null,
    raw_payload: rawPayload ?? null,
    error_message: errorMessage.slice(0, 2000),
  });
  if (error) throw new Error(`recordError failed: ${error.message}`);
}

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

  const ids: string[] = [];
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const { data, error } = await svc.from("raw_records").insert(chunk).select("id");
    if (error) throw new Error(`raw_records insert failed: ${error.message}`);
    for (const row of data ?? []) ids.push((row as { id: string }).id);
  }
  return { raw_ids: ids };
}

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
      const metricType = pickString(r.raw, canonicalToSource.metric_type);
      const value = pickNumber(r.raw, canonicalToSource.value);
      const date = pickDate(r.raw, canonicalToSource.date);
      if (!metricType) throw new Error("metric_type is empty");
      if (value === null || Number.isNaN(value)) throw new Error("value is not numeric");
      if (!date) throw new Error("date could not be parsed");
      valid.push({
        metric_type: metricType,
        value,
        date,
        region: canonicalToSource.region ? pickString(r.raw, canonicalToSource.region) : null,
        segment: canonicalToSource.segment ? pickString(r.raw, canonicalToSource.segment) : null,
        source_id: canonicalToSource.source_id ? pickString(r.raw, canonicalToSource.source_id) : null,
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
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().split("T")[0];
}

function metricIdentity(
  organizationId: string,
  datasetId: string,
  metric: CanonicalMetric,
): string {
  return [
    organizationId,
    datasetId,
    metric.metric_type,
    metric.date,
    metric.region ?? "",
    metric.segment ?? "",
    metric.source_id ?? "",
  ].join("\u001f");
}

/**
 * Replay-safe canonical metric persistence.
 *
 * The database uniqueness contract is dataset-scoped. We also collapse
 * duplicate identities inside the same incoming batch before issuing the
 * upsert because PostgreSQL cannot update the same conflict target twice in a
 * single INSERT ... ON CONFLICT statement.
 */
export async function insertMetrics(
  svc: SvcClient,
  ctx: RunContext,
  metrics: CanonicalMetric[],
): Promise<{ inserted: number; errors: Array<{ index: number; reason: string }> }> {
  if (metrics.length === 0) return { inserted: 0, errors: [] };
  const datasetId = ctx.connector.dataset_id;
  if (!datasetId) {
    return {
      inserted: 0,
      errors: metrics.map((m) => ({ index: m.raw_index, reason: "No dataset linked" })),
    };
  }

  const deduped = new Map<string, CanonicalMetric>();
  for (const metric of metrics) {
    deduped.set(metricIdentity(ctx.connector.organization_id, datasetId, metric), metric);
  }
  const uniqueMetrics = Array.from(deduped.values());
  const payload = uniqueMetrics.map((m) => ({
    organization_id: ctx.connector.organization_id,
    dataset_id: datasetId,
    metric_type: m.metric_type,
    value: m.value,
    date: m.date,
    region: m.region ?? null,
    segment: m.segment ?? null,
    source_id: m.source_id ?? null,
    source_name: m.source_name,
    data_origin: "client",
  }));

  let inserted = 0;
  const errors: Array<{ index: number; reason: string }> = [];
  for (let i = 0; i < payload.length; i += 500) {
    const chunk = payload.slice(i, i + 500);
    const originals = uniqueMetrics.slice(i, i + 500);
    const { error } = await svc.from("metrics").upsert(chunk, { onConflict: METRIC_CONFLICT_KEY });
    if (!error) {
      inserted += chunk.length;
      continue;
    }

    // Isolate malformed rows without converting an otherwise valid retry into
    // a full poison-batch failure.
    for (let j = 0; j < chunk.length; j++) {
      const { error: singleErr } = await svc
        .from("metrics")
        .upsert(chunk[j], { onConflict: METRIC_CONFLICT_KEY });
      if (singleErr) {
        errors.push({ index: originals[j].raw_index, reason: singleErr.message });
      } else {
        inserted++;
      }
    }
  }
  return { inserted, errors };
}

/**
 * Refresh summaries and monthly aggregates and report the real outcome.
 * Supabase RPC failures are returned as `{ error }`; they do not normally
 * throw, so callers must not rely on try/catch alone.
 */
export async function refreshAggregates(
  svc: SvcClient,
  ctx: RunContext,
): Promise<AggregateRefreshResult> {
  if (!ctx.connector.dataset_id) {
    return { ok: false, errors: ["Connector has no linked dataset_id"] };
  }

  const errors: string[] = [];
  try {
    const { error: summaryError } = await svc.rpc("refresh_metric_summaries", {
      _org_id: ctx.connector.organization_id,
      _dataset_id: ctx.connector.dataset_id,
    });
    if (summaryError) errors.push(`refresh_metric_summaries: ${summaryError.message}`);

    const { error: aggregateError } = await svc.rpc("refresh_metric_aggregates", {
      _org_id: ctx.connector.organization_id,
      _dataset_id: ctx.connector.dataset_id,
      _period_type: "monthly",
    });
    if (aggregateError) errors.push(`refresh_metric_aggregates: ${aggregateError.message}`);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return { ok: errors.length === 0, errors };
}

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
      : counts.rows_invalid > 0 || Boolean(errorSummary)
        ? "partial_success"
        : "complete";

  const { error: runUpdateError } = await svc
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
  if (runUpdateError) throw new Error(`finalize run update failed: ${runUpdateError.message}`);

  const isFailure = status === "failed";
  const update: Record<string, unknown> = isFailure
    ? {
        last_error_at: new Date().toISOString(),
        last_error_message: (errorSummary ?? "Run failed").slice(0, 500),
        health: "unhealthy",
      }
    : {
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        health: status === "partial_success" ? "degraded" : "healthy",
        last_error_message: status === "partial_success" ? (errorSummary ?? "Partial success").slice(0, 500) : null,
      };

  if (isFailure) {
    const { data: c, error: readHealthError } = await svc
      .from("data_connectors")
      .select("consecutive_failures")
      .eq("id", ctx.connector.id)
      .maybeSingle();
    if (readHealthError) throw new Error(`connector health read failed: ${readHealthError.message}`);
    update.consecutive_failures = ((c as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;
  }

  const { error: connectorUpdateError } = await svc
    .from("data_connectors")
    .update(update)
    .eq("id", ctx.connector.id);
  if (connectorUpdateError) throw new Error(`connector health update failed: ${connectorUpdateError.message}`);

  if (ctx.connector.cursor_field && checkpointAfter && status !== "failed") {
    const { error: checkpointError } = await svc
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
    if (checkpointError) throw new Error(`checkpoint update failed: ${checkpointError.message}`);
  }

  return { status, duration_ms, error_summary: errorSummary, ...counts };
}

export async function failRun(
  svc: SvcClient,
  ctx: RunContext,
  startedAtMs: number,
  errorMessage: string,
): Promise<void> {
  const { error: runError } = await svc
    .from("connector_sync_runs")
    .update({
      status: "failed",
      current_stage: "failed",
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAtMs,
      error_summary: errorMessage.slice(0, 2000),
    })
    .eq("id", ctx.runId);
  if (runError) console.error("[ingest-pipeline] failRun ledger update failed", runError.message);

  const { data: current } = await svc
    .from("data_connectors")
    .select("consecutive_failures")
    .eq("id", ctx.connector.id)
    .maybeSingle();
  const consecutiveFailures = ((current as { consecutive_failures?: number } | null)?.consecutive_failures ?? 0) + 1;

  const { error: connectorError } = await svc
    .from("data_connectors")
    .update({
      last_error_at: new Date().toISOString(),
      last_error_message: errorMessage.slice(0, 500),
      consecutive_failures: consecutiveFailures,
      health: "unhealthy",
    })
    .eq("id", ctx.connector.id);
  if (connectorError) console.error("[ingest-pipeline] failRun connector update failed", connectorError.message);
}
