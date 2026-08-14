/**
 * Shared config schema + helpers for warehouse / lake connectors.
 *
 * Stored on `data_connectors.config` jsonb for Snowflake, BigQuery, and S3.
 */

type PeriodGrain = "day" | "week" | "month" | "quarter";

export interface WarehouseMapping {
  metric_key_column: string;
  value_column: string;
  period_column: string;
  period_grain?: PeriodGrain;
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
const PERIOD_GRAINS = new Set<PeriodGrain>(["day", "week", "month", "quarter"]);
const MAX_QUERY_ROWS = 50_000;
const DEFAULT_QUERY_ROWS = 10_000;
const OUTER_LIMIT_PATTERN = /\blimit\s+(\d+)(?=\s*(?:offset\s+\d+\s*)?;?\s*$)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return value == null ? undefined : nonEmptyString(value) ?? undefined;
}

function scalarCellString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === "bigint" || typeof value === "boolean") return String(value);
  return undefined;
}

function isPeriodGrain(value: unknown): value is PeriodGrain {
  return typeof value === "string" && PERIOD_GRAINS.has(value as PeriodGrain);
}

export function validateMapping(
  value: unknown,
): { ok: true; mapping: WarehouseMapping } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: "mapping missing" };

  const required: Record<(typeof REQUIRED_MAPPING)[number], string> = {
    metric_key_column: "",
    value_column: "",
    period_column: "",
  };
  for (const key of REQUIRED_MAPPING) {
    const parsed = nonEmptyString(value[key]);
    if (!parsed) return { ok: false, reason: `mapping.${key} required` };
    required[key] = parsed;
  }

  const periodGrain = value.period_grain;
  if (periodGrain != null && !isPeriodGrain(periodGrain)) {
    return { ok: false, reason: "mapping.period_grain invalid" };
  }

  let dimensionColumns: string[] | undefined;
  if (value.dimension_columns != null) {
    if (!Array.isArray(value.dimension_columns)) {
      return { ok: false, reason: "mapping.dimension_columns must be an array" };
    }
    dimensionColumns = [];
    for (const column of value.dimension_columns) {
      const parsed = nonEmptyString(column);
      if (!parsed) return { ok: false, reason: "mapping.dimension_columns must contain column names" };
      if (!dimensionColumns.includes(parsed)) dimensionColumns.push(parsed);
    }
  }

  const mapping: WarehouseMapping = {
    metric_key_column: required.metric_key_column,
    value_column: required.value_column,
    period_column: required.period_column,
  };
  if (isPeriodGrain(periodGrain)) mapping.period_grain = periodGrain;
  const unitColumn = optionalString(value, "unit_column");
  const entityExternalIdColumn = optionalString(value, "entity_external_id_column");
  const entityType = optionalString(value, "entity_type");
  if (unitColumn) mapping.unit_column = unitColumn;
  if (dimensionColumns) mapping.dimension_columns = dimensionColumns;
  if (entityExternalIdColumn) mapping.entity_external_id_column = entityExternalIdColumn;
  if (entityType) mapping.entity_type = entityType;

  return { ok: true, mapping };
}

/** Convert a result row (object keyed by column name) into a CanonicalMetricInput shape. */
export function rowToCanonicalMetric(row: Record<string, unknown>, mapping: WarehouseMapping) {
  const metricKey = String(row[mapping.metric_key_column] ?? "").trim();
  const rawValue = row[mapping.value_column];
  const value = typeof rawValue === "number"
    ? rawValue
    : Number(String(rawValue ?? "").replace(/[, ]/g, ""));
  const periodRaw = row[mapping.period_column];

  if (!metricKey) throw new Error(`metric_key empty (column ${mapping.metric_key_column})`);
  if (!Number.isFinite(value)) throw new Error(`value not numeric (column ${mapping.value_column})`);
  if (periodRaw === null || periodRaw === undefined || periodRaw === "") {
    throw new Error(`period empty (column ${mapping.period_column})`);
  }
  const period = new Date(String(periodRaw));
  if (Number.isNaN(period.getTime())) throw new Error(`period unparseable: ${String(periodRaw)}`);

  const dimensions: Record<string, unknown> = {};
  for (const column of mapping.dimension_columns ?? []) {
    if (column in row) dimensions[column] = row[column];
  }

  const unit = mapping.unit_column ? scalarCellString(row[mapping.unit_column]) : undefined;
  const entityExternalId = mapping.entity_external_id_column
    ? scalarCellString(row[mapping.entity_external_id_column])
    : undefined;

  return {
    metric_key: metricKey,
    value,
    period_start: period.toISOString().slice(0, 10),
    period_grain: mapping.period_grain ?? "day",
    unit,
    dimensions,
    entity_external_id: entityExternalId,
    entity_type: mapping.entity_type,
  };
}

/**
 * Mask SQL strings, quoted identifiers, and comments with spaces while preserving string length.
 * This lets governance inspect executable tokens without being fooled by `LIMIT` or write keywords
 * inside literals/comments, while retaining exact indexes for safe source rewriting.
 */
function maskSqlNonCode(query: string): string {
  const chars = [...query];
  const masked = [...query];
  let mode: "code" | "single" | "double" | "backtick" | "line_comment" | "block_comment" = "code";

  const blank = (index: number) => {
    if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
  };

  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i];
    const next = chars[i + 1];

    if (mode === "line_comment") {
      blank(i);
      if (current === "\n") mode = "code";
      continue;
    }
    if (mode === "block_comment") {
      blank(i);
      if (current === "*" && next === "/") {
        blank(i + 1);
        i += 1;
        mode = "code";
      }
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "backtick") {
      const quote = mode === "single" ? "'" : mode === "double" ? '"' : "`";
      blank(i);
      if (current === quote) {
        if (next === quote) {
          blank(i + 1);
          i += 1;
        } else {
          mode = "code";
        }
      }
      continue;
    }

    if (current === "-" && next === "-") {
      blank(i);
      blank(i + 1);
      i += 1;
      mode = "line_comment";
      continue;
    }
    if (current === "/" && next === "*") {
      blank(i);
      blank(i + 1);
      i += 1;
      mode = "block_comment";
      continue;
    }
    if (current === "'") {
      blank(i);
      mode = "single";
      continue;
    }
    if (current === '"') {
      blank(i);
      mode = "double";
      continue;
    }
    if (current === "`") {
      blank(i);
      mode = "backtick";
    }
  }

  return masked.join("");
}

/**
 * Find the end of the executable statement while counting quoted literals/identifiers as part of
 * the statement, but excluding comments, trailing whitespace, and a trailing semicolon.
 */
function statementInsertionIndex(query: string): number {
  const chars = [...query];
  let mode: "code" | "single" | "double" | "backtick" | "line_comment" | "block_comment" = "code";
  let lastStatementChar = -1;

  for (let i = 0; i < chars.length; i += 1) {
    const current = chars[i];
    const next = chars[i + 1];

    if (mode === "line_comment") {
      if (current === "\n") mode = "code";
      continue;
    }
    if (mode === "block_comment") {
      if (current === "*" && next === "/") {
        i += 1;
        mode = "code";
      }
      continue;
    }
    if (mode === "single" || mode === "double" || mode === "backtick") {
      lastStatementChar = i;
      const quote = mode === "single" ? "'" : mode === "double" ? '"' : "`";
      if (current === quote) {
        if (next === quote) {
          lastStatementChar = i + 1;
          i += 1;
        } else {
          mode = "code";
        }
      }
      continue;
    }

    if (current === "-" && next === "-") {
      i += 1;
      mode = "line_comment";
      continue;
    }
    if (current === "/" && next === "*") {
      i += 1;
      mode = "block_comment";
      continue;
    }
    if (current === "'") {
      lastStatementChar = i;
      mode = "single";
      continue;
    }
    if (current === '"') {
      lastStatementChar = i;
      mode = "double";
      continue;
    }
    if (current === "`") {
      lastStatementChar = i;
      mode = "backtick";
      continue;
    }
    if (!/\s/.test(current ?? "") && current !== ";") lastStatementChar = i;
  }

  return lastStatementChar + 1;
}

function boundedRowCap(maxRows: number): number {
  if (!Number.isFinite(maxRows)) return DEFAULT_QUERY_ROWS;
  return Math.min(MAX_QUERY_ROWS, Math.max(1, Math.floor(maxRows)));
}

/**
 * Enforce a bounded OUTER LIMIT. Inner CTE limits and literal/comment text do not count.
 * Existing outer limits above policy are reduced rather than trusted as-is.
 */
export function enforceLimit(query: string, maxRows: number): string {
  const cap = boundedRowCap(maxRows);
  const masked = maskSqlNonCode(query);
  const match = OUTER_LIMIT_PATTERN.exec(masked);

  if (match?.[1]) {
    const requested = Number(match[1]);
    const bounded = Number.isSafeInteger(requested) && requested >= 0 ? Math.min(requested, cap) : cap;
    const digitOffset = match[0].lastIndexOf(match[1]);
    const start = match.index + digitOffset;
    const end = start + match[1].length;
    return `${query.slice(0, start)}${bounded}${query.slice(end)}`;
  }

  const insertAt = statementInsertionIndex(query);
  if (insertAt === 0) return `LIMIT ${cap}`;
  const prefix = query.slice(0, insertAt).trimEnd();
  return `${prefix} LIMIT ${cap}${query.slice(insertAt)}`;
}

/**
 * Reject anything that isn't a read-only single SELECT/WITH statement.
 * Blocks mutation/DDL keywords in executable SQL while ignoring harmless string/comment content.
 */
export function assertSelectOnly(query: string): void {
  const masked = maskSqlNonCode(query).trim();
  const normalized = masked.replace(/;+\s*$/, "");
  if (!normalized) throw new Error("query is empty");
  if (normalized.includes(";")) throw new Error("multiple statements not allowed");
  if (!/^\s*(select|with)\b/i.test(normalized)) {
    throw new Error("only SELECT/WITH queries are allowed");
  }
  if (/\b(insert|update|delete|merge|create|drop|alter|truncate|grant|revoke|call|copy|use)\b/i.test(normalized)) {
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
