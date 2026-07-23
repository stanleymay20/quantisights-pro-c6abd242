// @ts-nocheck
/**
 * Shared config schema + helpers for warehouse / lake connectors.
 *
 * Stored on `data_connectors.config` jsonb:
 *
 * Snowflake / BigQuery:
 *   {
 *     warehouse?: string, database?: string, schema?: string,  // snowflake
 *     project_id?: string, location?: string,                  // bigquery
 *     query: string,                              // user-authored SELECT
 *     limit_rows?: number,                        // hard cap, default 10_000
 *     max_bytes_billed?: string,                  // bigquery only
 *     mapping: {
 *       metric_key_column: string,                // e.g. "metric_key"
 *       value_column: string,                     // e.g. "value"
 *       period_column: string,                    // e.g. "period_start" (date)
 *       period_grain?: "day"|"week"|"month"|"quarter",
 *       unit_column?: string,
 *       dimension_columns?: string[],             // any extra cols -> dimensions{}
 *       entity_external_id_column?: string,
 *       entity_type?: string
 *     }
 *   }
 *
 * S3:
 *   {
 *     prefix: string,                             // "data/exports/"
 *     file_pattern?: string,                      // regex, default \.(csv|json|jsonl)$
 *     format?: "csv"|"json"|"jsonl",              // auto-detect by extension
 *     max_files_per_run?: number,                 // default 25
 *     max_rows_per_file?: number,                 // default 50_000
 *     mapping: { ... same as warehouse ... }
 *   }
 */

export interface WarehouseMapping {
  metric_key_column: string;
  value_column: string;
  period_column: string;
  period_grain?: "day" | "week" | "month" | "quarter";
  unit_column?: string;
  dimension_columns?: string[];
  entity_external_id_column?: string;
  entity_type?: string;
}

export interface SnowflakeConfig {
  warehouse?: string;
  database?: string;
  schema?: string;
  query: string;
  limit_rows?: number;
  mapping: WarehouseMapping;
}

export interface BigQueryConfig {
  project_id: string;
  location?: string;
  query: string;
  limit_rows?: number;
  max_bytes_billed?: string;
  mapping: WarehouseMapping;
}

export interface S3Config {
  prefix: string;
  file_pattern?: string;
  format?: "csv" | "json" | "jsonl";
  max_files_per_run?: number;
  max_rows_per_file?: number;
  mapping: WarehouseMapping;
}

const REQUIRED_MAPPING = ["metric_key_column", "value_column", "period_column"] as const;

export function validateMapping(m: unknown): { ok: true; mapping: WarehouseMapping } | { ok: false; reason: string } {
  if (!m || typeof m !== "object") return { ok: false, reason: "mapping missing" };
  for (const k of REQUIRED_MAPPING) {
    if (!(k in (m as Record<string, unknown>)) || typeof (m as any)[k] !== "string") {
      return { ok: false, reason: `mapping.${k} required` };
    }
  }
  return { ok: true, mapping: m as WarehouseMapping };
}

/** Convert a result row (object keyed by column name) into a CanonicalMetricInput shape. */
export function rowToCanonicalMetric(row: Record<string, unknown>, mapping: WarehouseMapping) {
  const metric_key = String(row[mapping.metric_key_column] ?? "").trim();
  const rawVal = row[mapping.value_column];
  const value = typeof rawVal === "number" ? rawVal : Number(String(rawVal ?? "").replace(/[, ]/g, ""));
  const periodRaw = row[mapping.period_column];
  if (!metric_key) throw new Error(`metric_key empty (column ${mapping.metric_key_column})`);
  if (!Number.isFinite(value)) throw new Error(`value not numeric (column ${mapping.value_column})`);
  if (periodRaw === null || periodRaw === undefined || periodRaw === "") {
    throw new Error(`period empty (column ${mapping.period_column})`);
  }
  const period = new Date(String(periodRaw));
  if (Number.isNaN(period.getTime())) throw new Error(`period unparseable: ${String(periodRaw)}`);

  const dimensions: Record<string, unknown> = {};
  for (const col of mapping.dimension_columns ?? []) {
    if (col in row) dimensions[col] = row[col];
  }

  return {
    metric_key,
    value,
    period_start: period.toISOString().slice(0, 10),
    period_grain: mapping.period_grain ?? "day",
    unit: mapping.unit_column ? (row[mapping.unit_column] as string | undefined) ?? undefined : undefined,
    dimensions,
    entity_external_id: mapping.entity_external_id_column
      ? (row[mapping.entity_external_id_column] as string | undefined)
      : undefined,
    entity_type: mapping.entity_type,
  };
}

/** Inject a LIMIT clause if the query lacks one — defense in depth against full-table scans. */
export function enforceLimit(query: string, maxRows: number): string {
  const trimmed = query.trim().replace(/;+\s*$/, "");
  if (/\blimit\s+\d+\b/i.test(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${maxRows}`;
}

/**
 * Reject anything that isn't a read-only single SELECT/WITH statement.
 * Blocks INSERT/UPDATE/DELETE/MERGE/CREATE/DROP/ALTER/TRUNCATE/GRANT/CALL and stacked statements.
 */
export function assertSelectOnly(query: string): void {
  const stripped = query
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .trim()
    .replace(/;+\s*$/, "");
  if (!stripped) throw new Error("query is empty");
  if (stripped.includes(";")) throw new Error("multiple statements not allowed");
  if (!/^\s*(select|with)\b/i.test(stripped)) {
    throw new Error("only SELECT/WITH queries are allowed");
  }
  if (/\b(insert|update|delete|merge|create|drop|alter|truncate|grant|revoke|call|copy|use)\b/i.test(stripped)) {
    throw new Error("write/DDL keywords are not allowed");
  }
}

/** Structured JSON log line for connector telemetry — parseable by log aggregators. */
export function logConnectorEvent(event: {
  connector_type: string;
  connector_id: string;
  organization_id: string;
  phase: "start" | "complete" | "error" | "skipped" | "cost_block";
  rows_extracted?: number;
  rows_inserted?: number;
  rows_failed?: number;
  bytes_processed?: number;
  bytes_cap?: number;
  duration_ms?: number;
  error?: string;
  reason?: string;
}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...event }));
}
