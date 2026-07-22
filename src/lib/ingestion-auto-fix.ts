import { deduplicateHeaders, parseMessyDate, parseMessyNumber } from "./messy-data-guards";

export type AutoFixKind =
  | "deduplicate_headers"
  | "normalize_nulls"
  | "normalize_numbers"
  | "normalize_dates"
  | "trim_whitespace"
  | "mask_pii";

export interface AutoFixOperation {
  kind: AutoFixKind;
  column?: string;
  columnIndex?: number;
  enabled?: boolean;
}

export interface AutoFixChange {
  kind: AutoFixKind;
  column?: string;
  columnIndex?: number;
  rowIndex?: number;
  before: string;
  after: string;
}

export interface AutoFixResult {
  headers: string[];
  rows: string[][];
  changes: AutoFixChange[];
  summary: {
    totalChanges: number;
    headerChanges: number;
    cellChanges: number;
    operationsApplied: AutoFixKind[];
  };
}

const NULL_TOKENS = new Set(["", "null", "nil", "none", "n/a", "na", "not available", "undefined", "-", "—"]);

function normalizeValue(value: unknown): string {
  return String(value ?? "").trim();
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!name || !domain) return "[masked]";
  return `${name.slice(0, 1)}***@${domain}`;
}

function maskPiiValue(value: string): string {
  if (!value) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return maskEmail(value);
  if (/\+?\d[\d\s().-]{6,}\d/.test(value)) return "[masked-phone]";
  return "[masked]";
}

function isDateLikeColumn(header: string): boolean {
  return /date|day|month|year|period|timestamp|time/i.test(header);
}

function isNumericLikeColumn(header: string): boolean {
  return /amount|revenue|sales|cost|price|profit|margin|rate|score|quantity|qty|count|total|value|spend|budget|turnover|income/i.test(header);
}

function isPiiLikeColumn(header: string): boolean {
  return /email|phone|mobile|ssn|passport|national_id|name|address/i.test(header);
}

function shouldApply(operation: AutoFixOperation, kind: AutoFixKind): boolean {
  return operation.kind === kind && operation.enabled !== false;
}

export function buildRecommendedAutoFixOperations(headers: string[]): AutoFixOperation[] {
  return [
    { kind: "deduplicate_headers" },
    { kind: "trim_whitespace" },
    { kind: "normalize_nulls" },
    ...headers.flatMap((header, columnIndex) => {
      const ops: AutoFixOperation[] = [];
      if (isNumericLikeColumn(header)) ops.push({ kind: "normalize_numbers", column: header, columnIndex });
      if (isDateLikeColumn(header)) ops.push({ kind: "normalize_dates", column: header, columnIndex });
      if (isPiiLikeColumn(header)) ops.push({ kind: "mask_pii", column: header, columnIndex, enabled: false });
      return ops;
    }),
  ];
}

export function applyAutoFixes(args: {
  headers: string[];
  rows: string[][];
  operations?: AutoFixOperation[];
}): AutoFixResult {
  const operations = args.operations ?? buildRecommendedAutoFixOperations(args.headers);
  let headers = [...args.headers];
  const rows = args.rows.map((row) => [...row]);
  const changes: AutoFixChange[] = [];

  if (operations.some((operation) => shouldApply(operation, "deduplicate_headers"))) {
    const nextHeaders = deduplicateHeaders(headers);
    nextHeaders.forEach((header, columnIndex) => {
      if (header !== headers[columnIndex]) {
        changes.push({
          kind: "deduplicate_headers",
          columnIndex,
          before: headers[columnIndex],
          after: header,
        });
      }
    });
    headers = nextHeaders;
  }

  const trimAll = operations.some((operation) => shouldApply(operation, "trim_whitespace"));
  const normalizeNulls = operations.some((operation) => shouldApply(operation, "normalize_nulls"));
  const numericColumns = new Set(operations.filter((operation) => shouldApply(operation, "normalize_numbers")).map((operation) => operation.columnIndex));
  const dateColumns = new Set(operations.filter((operation) => shouldApply(operation, "normalize_dates")).map((operation) => operation.columnIndex));
  const piiColumns = new Set(operations.filter((operation) => shouldApply(operation, "mask_pii")).map((operation) => operation.columnIndex));

  rows.forEach((row, rowIndex) => {
    for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
      const before = String(row[columnIndex] ?? "");
      let after = before;

      if (trimAll) after = normalizeValue(after);
      if (normalizeNulls && NULL_TOKENS.has(after.toLowerCase())) after = "";

      if (numericColumns.has(columnIndex) && after) {
        const parsed = parseMessyNumber(after);
        if (Number.isFinite(parsed)) after = String(parsed);
      }

      if (dateColumns.has(columnIndex) && after) {
        const parsed = parseMessyDate(after);
        if (parsed) after = parsed;
      }

      if (piiColumns.has(columnIndex) && after) {
        after = maskPiiValue(after);
      }

      if (after !== before) {
        changes.push({
          kind: piiColumns.has(columnIndex)
            ? "mask_pii"
            : dateColumns.has(columnIndex)
              ? "normalize_dates"
              : numericColumns.has(columnIndex)
                ? "normalize_numbers"
                : normalizeNulls && NULL_TOKENS.has(normalizeValue(before).toLowerCase())
                  ? "normalize_nulls"
                  : "trim_whitespace",
          column: headers[columnIndex],
          columnIndex,
          rowIndex,
          before,
          after,
        });
        row[columnIndex] = after;
      }
    }
  });

  return {
    headers,
    rows,
    changes,
    summary: {
      totalChanges: changes.length,
      headerChanges: changes.filter((change) => change.rowIndex === undefined).length,
      cellChanges: changes.filter((change) => change.rowIndex !== undefined).length,
      operationsApplied: Array.from(new Set(changes.map((change) => change.kind))),
    },
  };
}
