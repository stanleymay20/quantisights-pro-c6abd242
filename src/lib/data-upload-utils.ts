// ---- Data Upload Utility Functions ----
// Extracted from DataUpload.tsx for maintainability.
// All ingestion stages (parse → infer → validate → diagnose) share a single
// normalization layer from messy-data-guards.ts so behavior stays consistent.
// The inference rules intentionally let sampled values override header keywords.
// Example: sales_channel contains "sales" but values are text, so it must be a segment, not a metric.

import Papa from "papaparse";
import {
  deduplicateHeaders,
  isBooleanLike,
  isEmailLike,
  isIdentifierHeader,
  isIdentifierLike,
  isPhoneLike,
  isPotentialPiiHeader,
  normalizeCell,
  parseMessyDate,
  parseMessyNumber,
} from "./messy-data-guards";

export const COUNTRY_SAMPLES = new Set([
  "united states", "usa", "us", "china", "india", "germany", "france", "japan",
  "united kingdom", "uk", "brazil", "canada", "australia", "italy", "spain",
  "mexico", "south korea", "russia", "indonesia", "turkey", "saudi arabia",
  "netherlands", "switzerland", "sweden", "norway", "denmark", "finland",
  "egypt", "nigeria", "south africa", "argentina", "colombia", "chile",
  "ghana", "uae", "qatar", "kuwait", "bahrain", "oman", "iraq", "iran", "israel",
  "thailand", "vietnam", "malaysia", "singapore", "philippines", "pakistan",
  "bangladesh", "poland", "portugal", "greece", "czech republic", "austria",
  "belgium", "ireland", "new zealand", "peru", "venezuela",
]);

export type ColumnTarget =
  | "date"
  | "value"
  | "region"
  | "region_code"
  | "segment"
  | "metric_type"
  | "skip";

export interface DetectedSchema {
  column: string;
  colIdx: number;
  inferredType: ColumnTarget;
  confidence: number;
  reason: string;
  sampleValues: string[];
  rulesApplied: string[];
  autoFix?: "year_to_date";
}

export type ColumnMapping = Record<number, ColumnTarget>;

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  validPoints: number;
  invalidPoints: number;
  totalPoints: number;
  errors: HumanizedError[];
  qualityScore: number;
  completeness: number;
  dateRange: { min: string; max: string } | null;
  valueRange: { min: number; max: number } | null;
}

export interface HumanizedError {
  row: number;
  rawMessage: string;
  friendlyTitle: string;
  friendlyDescription: string;
  suggestion?: string;
  autoFixable: boolean;
  fixType?: "year_to_date" | "remove_row" | "trim_value";
}

export interface DatasetIntelligence {
  recordCount: number;
  validPointCount: number;
  columnCount: number;
  dateSpan: string | null;
  regionCount: number;
  regions: string[];
  metricTypes: string[];
  signals: { icon: string; title: string; description: string }[];
  qualityScore: number;
  qualityLabel: string;
}

export interface DatasetDiagnostics {
  missingValuesPct: number;
  outlierCount: number;
  duplicateRows: number;
  nearDuplicateRows: number;
  dateContinuity: "OK" | "Gaps detected" | "N/A";
  dateGapCount: number;
  piiRisk: {
    level: "none" | "low" | "high";
    columns: string[];
  };
  schemaConfidence: number;
  completenessScore: number;
  dataFreshness: {
    label: "Fresh" | "Recent" | "Stale" | "N/A";
    daysSinceLatest: number | null;
  };
  healthScore: number;
  recommendedAction: "Proceed with Import" | "Review before Import" | "Fix Issues First";
}

export type IndustryType =
  | "Finance"
  | "Manufacturing"
  | "HR"
  | "CRM"
  | "Supply Chain"
  | "Government"
  | "Healthcare"
  | "Retail"
  | "SaaS"
  | "General Business";

export interface DatasetClassification {
  type: string;
  industry: IndustryType;
  confidence: number;
  subType?: string;
  recommendedWorkflows: string[];
  matchedKeywords: string[];
}

export type ImportMode = "single" | "multi";

const NOT_DATE_PATTERNS = [
  /_years$/i, /^life_expectancy/i, /^tenure/i, /^age$/i, /^duration/i,
  /_duration$/i, /_age$/i, /^experience/i, /^months$/i, /^days$/i,
  /_months$/i, /_days$/i, /_count$/i, /^headcount$/i,
];

const TEXT_DIMENSION_HEADER_PATTERNS = [
  /(^|_)channel($|_)/i, /(^|_)sales_channel($|_)/i, /(^|_)department($|_)/i,
  /(^|_)region($|_)/i, /(^|_)country($|_)/i, /(^|_)supplier($|_)/i,
  /(^|_)vendor($|_)/i, /(^|_)product($|_)/i, /(^|_)product_line($|_)/i,
  /(^|_)category($|_)/i, /(^|_)segment($|_)/i, /(^|_)industry($|_)/i,
  /(^|_)owner($|_)/i, /(^|_)executive_owner($|_)/i, /(^|_)flag($|_)/i,
  /(^|_)decision_flag($|_)/i, /(^|_)status($|_)/i, /(^|_)type($|_)/i,
];

const PERIOD_HEADER_PATTERNS = [
  /^date$/i,
  /^month$/i,
  /^quarter$/i,
  /^period$/i,
  /^fiscal_period$/i,
  /^reporting_period$/i,
  /^week$/i,
  /^year$/i,
  /(^|_)date$/i,
  /(^|_)month$/i,
  /(^|_)quarter$/i,
  /(^|_)period$/i,
];

const METRIC_HEADER_KEYWORDS = [
  "value", "amount", "revenue", "gdp", "price", "cost", "total", "income",
  "profit", "spend", "rate", "inflation", "unemployment", "expectancy", "growth",
  "index", "score", "throughput", "utilization", "headcount", "attrition", "nps",
  "satisfaction", "conversion", "churn", "retention", "margin", "balance",
  "receivable", "payable", "orders", "customers", "employees", "units", "turnover",
  "delivery", "defect", "returns", "lead_time",
];

function isNotDateHeader(header: string): boolean {
  return NOT_DATE_PATTERNS.some(p => p.test(header.trim()));
}

function normalizeHeader(header: string): string {
  return header.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isProtectedPeriodHeader(lower: string): boolean {
  return PERIOD_HEADER_PATTERNS.some(p => p.test(lower));
}

function cleanNumericVal(raw: string | undefined): number {
  return parseMessyNumber(raw);
}

function isNumericValue(raw: string | undefined): boolean {
  return Number.isFinite(parseMessyNumber(raw));
}

function isDateValue(raw: string | undefined): boolean {
  return parseMessyDate(raw) !== null;
}

function toDateValue(raw: string | undefined): string | null {
  return parseMessyDate(raw);
}

function cardinality(samples: string[]): number {
  return new Set(samples.map(s => s.toLowerCase().trim()).filter(Boolean)).size;
}

export function parseCSVText(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const result = Papa.parse(cleaned.trim(), {
    header: false,
    skipEmptyLines: "greedy",
    transformHeader: (h: string) => h.trim(),
    transform: (val: string) => normalizeCell(val),
  });
  const data = result.data as string[][];
  if (data.length < 2) return { headers: [], rows: [] };
  const rawHeaders = data[0].map(h => (h ?? "").replace(/^"|"$/g, "").trim());
  const headers = deduplicateHeaders(rawHeaders);
  const rows = data.slice(1).filter(row => row.some(cell => cell && cell.trim()));
  return { headers, rows };
}

export function slugifyMetric(name: string): string {
  return name
    .toLowerCase()
    .replace(/[%]/g, "_pct")
    .replace(/[/]/g, "_per_")
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function deduplicateMetricSlugs(slugs: string[]): string[] {
  const counts = new Map<string, number>();
  return slugs.map(s => {
    const count = (counts.get(s) ?? 0) + 1;
    counts.set(s, count);
    return count > 1 ? `${s}_${count}` : s;
  });
}

function findMappedIdx(mapping: ColumnMapping, target: string): number {
  const entry = Object.entries(mapping).find(([, v]) => v === target);
  return entry ? Number(entry[0]) : -1;
}

function findAllMappedIdx(mapping: ColumnMapping, target: string): number[] {
  return Object.entries(mapping)
    .filter(([, v]) => v === target)
    .map(([k]) => Number(k));
}

export function inferSchema(headers: string[], rows: string[][]): DetectedSchema[] {
  const sampleRows = rows.slice(0, Math.min(rows.length, 100));

  const detections: DetectedSchema[] = headers.map((header, colIdx) => {
    const samples = sampleRows.map(r => r[colIdx]).filter(v => v && v.trim());
    const lower = normalizeHeader(header);
    const uniqueValues = cardinality(samples);
    const numericCount = samples.filter(isNumericValue).length;
    const numericRate = numericCount / Math.max(samples.length, 1);
    const dateCount = samples.filter(isDateValue).length;
    const dateRate = dateCount / Math.max(samples.length, 1);
    const isTextDimensionHeader = TEXT_DIMENSION_HEADER_PATTERNS.some(p => p.test(lower));
    const metricKeyword = METRIC_HEADER_KEYWORDS.find(k => lower.includes(k));

    if (samples.length === 0) {
      return {
        column: header,
        colIdx,
        inferredType: "skip",
        confidence: 30,
        reason: "No sample values found",
        sampleValues: [],
        rulesApplied: ["empty_samples"],
      };
    }

    const looksLikeDateHeader =
      !isNotDateHeader(header) &&
      (isProtectedPeriodHeader(lower) ||
        lower === "date" || lower === "year" || lower === "time" ||
        lower.endsWith("_date") || lower.startsWith("date_"));

    // Identifier guard — never treat IDs/SKUs/UUIDs as numeric metrics.
    // Skip when the column is clearly a date/period column or the values parse as dates.
    if (!looksLikeDateHeader && dateRate < 0.5) {
      const idValueRate =
        samples.filter(s => isIdentifierLike(s) && !isDateValue(s)).length /
        Math.max(samples.length, 1);
      if (isIdentifierHeader(header) || idValueRate > 0.6) {
        return {
          column: header,
          colIdx,
          inferredType: "segment",
          confidence: 90,
          reason: "Identifier column detected (kept as segment, not a metric)",
          sampleValues: samples.slice(0, 3),
          rulesApplied: ["identifier_guard", `idValueRate=${(idValueRate * 100).toFixed(0)}%`],
        };
      }
    }

    // Boolean guard — true/false, yes/no, y/n. Skip pure 0/1 since it conflicts with numeric metrics.
    const boolRate =
      samples.filter(s => isBooleanLike(s) && !/^[01]$/.test(normalizeCell(s))).length /
      Math.max(samples.length, 1);
    if (boolRate >= 0.9 && uniqueValues <= 3) {
      return {
        column: header,
        colIdx,
        inferredType: "segment",
        confidence: 88,
        reason: "Boolean-like column detected",
        sampleValues: samples.slice(0, 3),
        rulesApplied: ["boolean_guard", `boolRate=${(boolRate * 100).toFixed(0)}%`],
      };
    }

    // Protected time bucket rule. Month/quarter/period fields are never numeric metrics.
    if (!isNotDateHeader(header) && isProtectedPeriodHeader(lower)) {
      const allYears = samples.every(s => /^\d{4}$/.test(s.trim()));
      const inferredType: ColumnTarget = dateRate >= 0.6 ? "date" : "segment";
      return {
        column: header,
        colIdx,
        inferredType,
        confidence: inferredType === "date" ? 96 : 86,
        reason: inferredType === "date"
          ? "Protected period/time column detected"
          : "Protected period label kept as segment",
        sampleValues: samples.slice(0, 3),
        autoFix: allYears ? "year_to_date" : undefined,
        rulesApplied: ["protected_period_header", `dateRate=${(dateRate * 100).toFixed(0)}%`, `numericRate=${(numericRate * 100).toFixed(0)}%`],
      };
    }

    if (isTextDimensionHeader && numericRate < 0.8) {
      const type: ColumnTarget = lower.includes("region") || lower.includes("country") ? "region" : "segment";
      return {
        column: header,
        colIdx,
        inferredType: type,
        confidence: 92,
        reason: "Categorical business dimension detected from header and text samples",
        sampleValues: samples.slice(0, 3),
        rulesApplied: ["header_match:text_dimension", `numericRate=${(numericRate * 100).toFixed(0)}%`],
      };
    }

    const isDateHeader = !isNotDateHeader(header) && (
      lower === "date" || lower === "year" || lower === "period" || lower === "time" ||
      lower === "month" || lower === "quarter" || lower.endsWith("_date") || lower.startsWith("date_")
    );

    if (isDateHeader && dateRate >= 0.9) {
      const allYears = samples.every(s => /^\d{4}$/.test(s.trim()));
      return {
        column: header,
        colIdx,
        inferredType: "date",
        confidence: lower === "date" ? 98 : 90,
        reason: allYears ? "Year values detected" : "Date-like values detected",
        sampleValues: samples.slice(0, 3),
        autoFix: allYears ? "year_to_date" : undefined,
        rulesApplied: ["header_match:date_keyword", `dateRate=${(dateRate * 100).toFixed(0)}%`],
      };
    }

    if ((lower.includes("region") || lower.includes("country") || lower.includes("nation") || lower.includes("state") || lower.includes("territory")) && numericRate < 0.8) {
      return {
        column: header,
        colIdx,
        inferredType: "region",
        confidence: 90,
        reason: "Geographic dimension detected",
        sampleValues: samples.slice(0, 3),
        rulesApplied: ["header_match:geo_keyword"],
      };
    }

    const countryMatchRate = samples.filter(s => COUNTRY_SAMPLES.has(s.toLowerCase().trim())).length / Math.max(samples.length, 1);
    if (countryMatchRate > 0.5) {
      return {
        column: header,
        colIdx,
        inferredType: "region",
        confidence: 88,
        reason: `${Math.round(countryMatchRate * 100)}% of values match known countries`,
        sampleValues: samples.slice(0, 3),
        rulesApplied: ["COUNTRY_SAMPLES", `matchRate=${(countryMatchRate * 100).toFixed(0)}%`],
      };
    }

    if ((lower.includes("code") || lower.includes("iso") || lower.includes("site_id") || lower.includes("dept_id")) && numericRate < 0.8) {
      const codeRate = samples.filter(s => /^[A-Z0-9_-]{2,12}$/i.test(s.trim())).length / Math.max(samples.length, 1);
      if (codeRate > 0.7) {
        return {
          column: header,
          colIdx,
          inferredType: "region_code",
          confidence: 82,
          reason: "Short business/location codes detected",
          sampleValues: samples.slice(0, 3),
          rulesApplied: ["header_match:code_keyword", `codeRate=${(codeRate * 100).toFixed(0)}%`],
        };
      }
    }

    // Critical guard: header keywords alone are not enough. Values must be numeric.
    if (metricKeyword && numericRate >= 0.85) {
      return {
        column: header,
        colIdx,
        inferredType: "value",
        confidence: Math.round(78 + numericRate * 20),
        reason: "Numeric metric column detected from header and sampled values",
        sampleValues: samples.slice(0, 3),
        rulesApplied: [`header_match:${metricKeyword}`, `numericRate=${(numericRate * 100).toFixed(0)}%`],
      };
    }

    if (metricKeyword && numericRate < 0.85) {
      return {
        column: header,
        colIdx,
        inferredType: "segment",
        confidence: 86,
        reason: "Header sounded like a metric, but sampled values are text",
        sampleValues: samples.slice(0, 3),
        rulesApplied: [`header_match:${metricKeyword}`, "value_guard:demoted_to_segment", `numericRate=${(numericRate * 100).toFixed(0)}%`],
      };
    }

    const avgMagnitude = samples.reduce((sum, s) => sum + Math.abs(cleanNumericVal(s) || 0), 0) / Math.max(samples.length, 1);
    if (numericRate >= 0.95 && avgMagnitude > 0) {
      const allLookLikeYears = samples.every(s => {
        const n = cleanNumericVal(s);
        return n >= 1900 && n <= 2100 && Number.isInteger(n);
      });
      return {
        column: header,
        colIdx,
        inferredType: allLookLikeYears && !lower.includes("amount") && !lower.includes("value") ? "skip" : "value",
        confidence: allLookLikeYears ? 55 : 82,
        reason: allLookLikeYears ? "Ambiguous year-like numeric values" : "Numeric values detected by sample statistics",
        sampleValues: samples.slice(0, 3),
        rulesApplied: [`numericRate=${(numericRate * 100).toFixed(0)}%`, `avgMagnitude=${avgMagnitude.toFixed(1)}`],
      };
    }

    if (lower.includes("metric") || lower.includes("indicator") || lower.includes("measure")) {
      return {
        column: header,
        colIdx,
        inferredType: "metric_type",
        confidence: 80,
        reason: "Metric identifier column detected",
        sampleValues: samples.slice(0, 3),
        rulesApplied: ["header_match:metric_type"],
      };
    }

    if (uniqueValues <= Math.max(50, samples.length * 0.8) && numericRate < 0.3) {
      return {
        column: header,
        colIdx,
        inferredType: "segment",
        confidence: uniqueValues <= 20 ? 75 : 62,
        reason: `Text category detected (${uniqueValues} unique sampled values)`,
        sampleValues: samples.slice(0, 3),
        rulesApplied: [`uniqueValues=${uniqueValues}`, `numericRate=${(numericRate * 100).toFixed(0)}%`],
      };
    }

    return {
      column: header,
      colIdx,
      inferredType: "skip",
      confidence: 40,
      reason: "No clear pattern detected",
      sampleValues: samples.slice(0, 3),
      rulesApplied: ["no_rule_matched"],
    };
  });

  const dateDetections = detections.filter(d => d.inferredType === "date");
  if (dateDetections.length > 1) {
    const bestDate = dateDetections.reduce((best, d) => d.confidence > best.confidence ? d : best);
    detections.forEach((d) => {
      if (d.inferredType === "date" && d.colIdx !== bestDate.colIdx) {
        const samples = sampleRows.map(r => r[d.colIdx]).filter(Boolean);
        const uniqueValues = cardinality(samples);
        (d as { inferredType: ColumnTarget }).inferredType = "segment";
        d.reason = "Secondary date-like column kept as segment for grouping";
        d.confidence = 75;
        d.rulesApplied = [...d.rulesApplied, "single_date_rule:demoted_to_segment", `uniqueValues=${uniqueValues}`];
      }
    });
  }

  return detections;
}

export function humanizeError(row: number, rawMessage: string): HumanizedError {
  const lower = rawMessage.toLowerCase();

  if (lower.includes("invalid date") || lower.includes("date format")) {
    const yearMatch = rawMessage.match(/"(\d{4})"/);
    if (yearMatch) {
      return {
        row, rawMessage,
        friendlyTitle: "Year-only date detected",
        friendlyDescription: `Row ${row} contains "${yearMatch[1]}" instead of a full date.`,
        suggestion: `We can convert this automatically: ${yearMatch[1]} → ${yearMatch[1]}-01-01`,
        autoFixable: true, fixType: "year_to_date",
      };
    }
    return {
      row, rawMessage,
      friendlyTitle: "Date format issue",
      friendlyDescription: `Row ${row} has an unrecognized date format.`,
      suggestion: "Expected format: YYYY-MM-DD or YYYY-MM.",
      autoFixable: false,
    };
  }

  if (lower.includes("missing date")) {
    return {
      row, rawMessage,
      friendlyTitle: "Missing date",
      friendlyDescription: `Row ${row} is missing a date value.`,
      suggestion: "This row will be skipped during import unless a date is provided.",
      autoFixable: true, fixType: "remove_row",
    };
  }

  if (lower.includes("missing value")) {
    return {
      row, rawMessage,
      friendlyTitle: "Missing metric value",
      friendlyDescription: `Row ${row} has no numeric value.`,
      suggestion: "Rows without values will be excluded from analysis.",
      autoFixable: true, fixType: "remove_row",
    };
  }

  if (lower.includes("non-numeric") || lower.includes("not a number")) {
    const columnMatch = rawMessage.match(/column "([^"]+)"/i);
    return {
      row, rawMessage,
      friendlyTitle: "Non-numeric value detected",
      friendlyDescription: columnMatch
        ? `Row ${row} contains text in metric column "${columnMatch[1]}".`
        : `Row ${row} contains text where a number is expected.`,
      suggestion: "Change text columns such as channel, supplier, product, status, or month to Segment instead of Metric.",
      autoFixable: false,
    };
  }

  if (lower.includes("exceeds limit") || lower.includes("exceeds max")) {
    return {
      row, rawMessage,
      friendlyTitle: "Value out of range",
      friendlyDescription: `Row ${row} has an unusually large value that exceeds safe limits.`,
      suggestion: "Values must be within ±1 trillion. Check for unit mismatches.",
      autoFixable: true, fixType: "trim_value",
    };
  }

  return {
    row, rawMessage,
    friendlyTitle: "Data issue",
    friendlyDescription: rawMessage,
    autoFixable: false,
  };
}

export function validateData(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  importMode: ImportMode = "single",
): ValidationResult {
  const dateIdx = findMappedIdx(mapping, "date");
  const hasDateColumn = dateIdx >= 0;
  const valueIndices = findAllMappedIdx(mapping, "value");
  const primaryValueIdx = valueIndices[0] ?? -1;

  const errors: HumanizedError[] = [];
  let validRows = 0;
  let validPoints = 0;
  let invalidPoints = 0;
  const dates: string[] = [];
  const values: number[] = [];
  let totalCells = 0;
  let filledCells = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    let rowValid = true;
    let dateValid = true;

    row.forEach((cell) => {
      totalCells += 1;
      if (cell && cell.trim()) filledCells += 1;
    });

    if (hasDateColumn) {
      const normalizedDate = toDateValue(row[dateIdx]);
      if (!normalizedDate) {
        errors.push(humanizeError(i + 2, `Invalid date format: "${row[dateIdx] ?? ""}"`));
        rowValid = false;
        dateValid = false;
      } else {
        dates.push(normalizedDate);
      }
    }

    const checkIndices = importMode === "multi" ? valueIndices : (primaryValueIdx >= 0 ? [primaryValueIdx] : []);
    for (const vIdx of checkIndices) {
      const raw = row[vIdx];
      const num = cleanNumericVal(raw);
      if (!raw || !raw.trim()) {
        if (importMode === "single") {
          errors.push(humanizeError(i + 2, `Missing value in column "${headers[vIdx] ?? vIdx}"`));
          rowValid = false;
        }
        invalidPoints += 1;
      } else if (!Number.isFinite(num)) {
        errors.push(humanizeError(i + 2, `Non-numeric value in column "${headers[vIdx] ?? vIdx}": "${raw}"`));
        rowValid = false;
        invalidPoints += 1;
      } else if (Math.abs(num) > 1e12) {
        errors.push(humanizeError(i + 2, `Value exceeds limit: ${num}`));
        rowValid = false;
        invalidPoints += 1;
      } else {
        // A numerically-valid value on a row with an invalid date still
        // gets skipped (the row as a whole is invalid) -- previously this
        // fell through neither branch when dateValid was false, so the
        // point vanished from both validPoints and invalidPoints. That
        // undercounted "N data points will be skipped" below relative to
        // what the row-level valid/invalid banner already reported.
        if (dateValid) {
          validPoints += 1;
          values.push(num);
        } else {
          invalidPoints += 1;
        }
      }
    }

    if (rowValid) validRows += 1;
  }

  const totalPoints = importMode === "multi" ? rows.length * Math.max(1, valueIndices.length) : rows.length;
  const completeness = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
  const errorRate = rows.length > 0 ? (errors.length / rows.length) * 100 : 0;
  const structureBonus = (primaryValueIdx >= 0 ? 10 : 0) + (hasDateColumn ? 10 : 0);
  const qualityScore = Math.max(0, Math.min(100, Math.round(
    completeness * 0.4 + (100 - errorRate) * 0.4 + structureBonus
  )));

  const sortedDates = [...dates].sort();
  return {
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
    validPoints,
    invalidPoints,
    totalPoints,
    errors: errors.slice(0, 50),
    qualityScore,
    completeness,
    dateRange: sortedDates.length > 0 ? { min: sortedDates[0], max: sortedDates[sortedDates.length - 1] } : null,
    valueRange: values.length > 0
      ? { min: Math.min(...values), max: Math.max(...values) }
      : null,
  };
}

export function generateIntelligence(
  headers: string[],
  rows: string[][],
  mapping: ColumnMapping,
  validation: ValidationResult,
  importMode: ImportMode = "single",
): DatasetIntelligence {
  const regionIdx = findMappedIdx(mapping, "region");
  const metricIdx = findMappedIdx(mapping, "metric_type");
  const valueIndices = findAllMappedIdx(mapping, "value");
  const regions = regionIdx >= 0 ? [...new Set(rows.map(r => r[regionIdx]).filter(Boolean))] : [];
  const valueCols = valueIndices.map(i => headers[i] || `col_${i}`);

  let metricTypes: string[];
  if (metricIdx >= 0) metricTypes = [...new Set(rows.map(r => r[metricIdx]).filter(Boolean))];
  else if (importMode === "multi" && valueCols.length > 1) metricTypes = valueCols.map(c => slugifyMetric(c));
  else metricTypes = valueCols.length ? [slugifyMetric(valueCols[0])] : [];

  const signals: { icon: string; title: string; description: string }[] = [];
  if (importMode === "multi" && valueCols.length > 1) {
    signals.push({
      icon: "📊",
      title: `${valueCols.length} metrics detected`,
      description: `Multi-metric dataset: ${valueCols.slice(0, 4).join(", ")}${valueCols.length > 4 ? ` +${valueCols.length - 4} more` : ""}.`,
    });
  }
  if (regions.length > 0) {
    signals.push({ icon: "🌍", title: `${regions.length} regions detected`, description: `Regional analysis enabled across ${regions.slice(0, 5).join(", ")}.` });
  }
  if (validation.qualityScore >= 85) {
    signals.push({ icon: "✅", title: "High-quality dataset", description: "The uploaded data is ready for executive analysis." });
  } else if (validation.qualityScore < 60) {
    signals.push({ icon: "⚠️", title: "Data quality needs review", description: "Some records require mapping or formatting attention before analysis." });
  }

  const dateSpan = validation.dateRange ? `${validation.dateRange.min} → ${validation.dateRange.max}` : null;
  const qualityLabel = validation.qualityScore >= 85 ? "Excellent" : validation.qualityScore >= 70 ? "Good" : validation.qualityScore >= 50 ? "Fair" : "Needs review";

  return {
    recordCount: rows.length,
    validPointCount: validation.validPoints,
    columnCount: headers.length,
    dateSpan,
    regionCount: regions.length,
    regions: regions.slice(0, 50),
    metricTypes,
    signals,
    qualityScore: validation.qualityScore,
    qualityLabel,
  };
}

export function computeDiagnostics(
  rows: string[][],
  headers: string[],
  mapping: ColumnMapping,
  schema?: DetectedSchema[],
): DatasetDiagnostics {
  const dateIdx = findMappedIdx(mapping, "date");
  const valueIndices = findAllMappedIdx(mapping, "value");
  let missing = 0;
  let total = 0;

  rows.forEach(row => {
    row.forEach(cell => {
      total += 1;
      if (!cell || !cell.trim()) missing += 1;
    });
  });

  // Exact duplicates
  const seen = new Set<string>();
  let duplicateRows = 0;
  rows.forEach(row => {
    const key = row.join("||");
    if (seen.has(key)) duplicateRows += 1;
    seen.add(key);
  });

  // Near-duplicates: same date + same segment values, but different numeric magnitudes.
  // Heuristic: hash of all non-value cells. Two rows with identical dimensions but
  // different metric values are flagged as near-dupes (often double-entry artifacts).
  let nearDuplicateRows = 0;
  if (valueIndices.length > 0) {
    const dimSeen = new Map<string, number>();
    rows.forEach(row => {
      const dimKey = row
        .map((cell, idx) => (valueIndices.includes(idx) ? "" : (cell ?? "").trim().toLowerCase()))
        .join("||");
      if (!dimKey.replace(/\|/g, "")) return;
      const prior = dimSeen.get(dimKey) ?? 0;
      if (prior > 0) nearDuplicateRows += 1;
      dimSeen.set(dimKey, prior + 1);
    });
    nearDuplicateRows = Math.max(0, nearDuplicateRows - duplicateRows);
  }

  const nums = valueIndices.flatMap(idx => rows.map(r => cleanNumericVal(r[idx])).filter(Number.isFinite));
  let outlierCount = 0;
  if (nums.length > 5) {
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const sd = Math.sqrt(nums.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / nums.length);
    outlierCount = sd > 0 ? nums.filter(v => Math.abs(v - mean) > sd * 3).length : 0;
  }

  let dateContinuity: DatasetDiagnostics["dateContinuity"] = "N/A";
  let dateGapCount = 0;
  let latestDate: Date | null = null;
  if (dateIdx >= 0) {
    const uniqueDates = [...new Set(rows.map(r => toDateValue(r[dateIdx])).filter(Boolean) as string[])].sort();
    if (uniqueDates.length > 2) {
      dateContinuity = "OK";
      for (let i = 1; i < uniqueDates.length; i += 1) {
        const prev = new Date(uniqueDates[i - 1]).getTime();
        const curr = new Date(uniqueDates[i]).getTime();
        const days = (curr - prev) / 86400000;
        if (days > 32) dateGapCount += 1;
      }
      if (dateGapCount > 0) dateContinuity = "Gaps detected";
    }
    if (uniqueDates.length > 0) {
      latestDate = new Date(uniqueDates[uniqueDates.length - 1]);
    }
  }

  // Data freshness
  let dataFreshness: DatasetDiagnostics["dataFreshness"] = { label: "N/A", daysSinceLatest: null };
  if (latestDate && !Number.isNaN(latestDate.getTime())) {
    const days = Math.floor((Date.now() - latestDate.getTime()) / 86400000);
    const label = days <= 30 ? "Fresh" : days <= 180 ? "Recent" : "Stale";
    dataFreshness = { label, daysSinceLatest: days };
  }

  // PII detection
  const sampleRows = rows.slice(0, Math.min(rows.length, 200));
  const piiColumns: string[] = [];
  headers.forEach((header, idx) => {
    const headerHit = isPotentialPiiHeader(header);
    const samples = sampleRows.map(r => r[idx]).filter(v => v && v.trim());
    if (samples.length === 0 && !headerHit) return;
    const emailRate = samples.filter(isEmailLike).length / Math.max(samples.length, 1);
    const phoneRate = samples.filter(isPhoneLike).length / Math.max(samples.length, 1);
    if (headerHit || emailRate > 0.5 || phoneRate > 0.5) {
      piiColumns.push(header);
    }
  });
  const piiLevel: DatasetDiagnostics["piiRisk"]["level"] =
    piiColumns.length === 0 ? "none" : piiColumns.length >= 2 ? "high" : "low";

  // Schema confidence — average of inferred-column confidence scores.
  const schemaConfidence = schema && schema.length > 0
    ? Math.round(schema.reduce((sum, s) => sum + s.confidence, 0) / schema.length)
    : 0;

  const missingValuesPct = total > 0 ? Math.round((missing / total) * 100) : 0;
  const completenessScore = Math.max(0, 100 - missingValuesPct);

  // Composite health score (0–100). Weighted blend of dimensions that matter
  // for downstream Quantivis analysis. Penalties never exceed each weight.
  const dupRate = rows.length > 0 ? (duplicateRows + nearDuplicateRows) / rows.length : 0;
  const outlierRate = nums.length > 0 ? outlierCount / nums.length : 0;
  const continuityPenalty = dateContinuity === "Gaps detected" ? 8 : 0;
  const piiPenalty = piiLevel === "high" ? 6 : piiLevel === "low" ? 2 : 0;
  const freshnessPenalty =
    dataFreshness.label === "Stale" ? 6 :
    dataFreshness.label === "Recent" ? 2 : 0;

  const healthScore = Math.max(0, Math.min(100, Math.round(
    completenessScore * 0.35 +
    (100 - dupRate * 100) * 0.15 +
    (100 - Math.min(100, outlierRate * 200)) * 0.10 +
    (schemaConfidence || 70) * 0.30 +
    (100 - continuityPenalty - piiPenalty - freshnessPenalty) * 0.10,
  )));

  const recommendedAction: DatasetDiagnostics["recommendedAction"] =
    healthScore >= 85 ? "Proceed with Import" :
    healthScore >= 65 ? "Review before Import" :
    "Fix Issues First";

  return {
    missingValuesPct,
    outlierCount,
    duplicateRows,
    nearDuplicateRows,
    dateContinuity,
    dateGapCount,
    piiRisk: { level: piiLevel, columns: piiColumns },
    schemaConfidence,
    completenessScore,
    dataFreshness,
    healthScore,
    recommendedAction,
  };
}

// ---- Industry classification ----
// Each industry has a list of strong keywords. We tokenize headers, score each
// industry by hit count weighted by keyword specificity, and return the top
// match. Confidence reflects how dominant the winner is over the runner-up.

interface IndustrySignature {
  industry: IndustryType;
  type: string;
  keywords: string[];
  workflows: string[];
}

const INDUSTRY_SIGNATURES: IndustrySignature[] = [
  {
    industry: "Finance",
    type: "Financial Performance",
    keywords: [
      "revenue", "ebitda", "cash_flow", "cashflow", "arr", "mrr", "gross_profit",
      "net_income", "operating_income", "cogs", "opex", "capex", "ar", "ap",
      "receivable", "payable", "margin", "ebit", "free_cash_flow", "burn",
      "runway", "p_and_l", "balance_sheet", "general_ledger",
    ],
    workflows: ["CFO Dashboard", "Forecasting", "Risk & Compliance"],
  },
  {
    industry: "Manufacturing",
    type: "Manufacturing Operations",
    keywords: [
      "yield", "defect_rate", "defect", "downtime", "oee", "throughput",
      "scrap", "rework", "first_pass_yield", "fpy", "mtbf", "mttr",
      "production_volume", "line_id", "shift", "cycle_time", "takt_time",
    ],
    workflows: ["Operational Risk", "Process Reliability", "Executive Intelligence"],
  },
  {
    industry: "HR",
    type: "Workforce & People",
    keywords: [
      "employee_id", "employee", "headcount", "attrition", "attrition_rate",
      "salary", "compensation", "tenure", "tenure_years", "hires", "terminations",
      "promotion", "engagement_score", "performance_rating", "department",
      "manager_id", "fte",
    ],
    workflows: ["Workforce Analytics", "Retention Modeling", "Executive Intelligence"],
  },
  {
    industry: "CRM",
    type: "Sales & Pipeline",
    keywords: [
      "lead_id", "lead_source", "opportunity", "opportunity_stage", "pipeline",
      "stage", "deal_size", "close_date", "won", "lost", "sales_rep",
      "account_id", "contact_id", "quota", "forecast", "conversion_rate",
    ],
    workflows: ["Pipeline Forecasting", "Sales Performance", "Executive Intelligence"],
  },
  {
    industry: "Supply Chain",
    type: "Supply Chain Operations",
    keywords: [
      "supplier", "vendor", "po_number", "purchase_order", "lead_time",
      "inventory", "stock_level", "on_time_delivery", "otd", "fill_rate",
      "warehouse", "sku", "units_shipped", "backorder", "freight_cost",
    ],
    workflows: ["Supplier Risk", "Inventory Optimization", "Operational Risk"],
  },
  {
    industry: "Government",
    type: "Public Sector / Government",
    keywords: [
      "fiscal_year", "agency", "department_code", "appropriation", "budget_line",
      "grant_id", "obligation", "outlay", "program_code", "ministry",
      "constituency", "permit_id", "case_id", "citizen_id",
    ],
    workflows: ["Public Reporting", "Budget Accountability", "Compliance"],
  },
  {
    industry: "Healthcare",
    type: "Healthcare Operations",
    keywords: [
      "patient_id", "encounter_id", "diagnosis", "icd", "icd10", "cpt",
      "admission", "discharge", "los", "readmission", "mortality",
      "claim_id", "payer", "provider_id", "bed_occupancy",
    ],
    workflows: ["Care Quality", "Operational Risk", "Compliance"],
  },
  {
    industry: "Retail",
    type: "Retail & Commerce",
    keywords: [
      "store_id", "store", "basket_size", "transactions", "footfall",
      "same_store_sales", "comp_sales", "aov", "average_order_value",
      "sku", "category", "shrinkage", "markdown", "gmv",
    ],
    workflows: ["Store Performance", "Demand Forecasting", "Executive Intelligence"],
  },
  {
    industry: "SaaS",
    type: "SaaS / Subscription",
    keywords: [
      "mrr", "arr", "churn", "churn_rate", "nrr", "grr", "logo_churn",
      "expansion", "downgrade", "active_users", "mau", "dau", "subscription",
      "plan", "trial", "cac", "ltv", "payback_period",
    ],
    workflows: ["Subscription Analytics", "Cohort Retention", "Forecasting"],
  },
];

export function classifyDataset(headers: string[], mapping: ColumnMapping): DatasetClassification {
  const normalized = headers.map(h => normalizeHeader(h));
  const tokens = new Set<string>();
  normalized.forEach(h => {
    tokens.add(h);
    h.split("_").forEach(t => t && tokens.add(t));
  });

  const scores = INDUSTRY_SIGNATURES.map(sig => {
    const matched: string[] = [];
    let score = 0;
    for (const kw of sig.keywords) {
      // Whole-token match scores higher than substring.
      if (tokens.has(kw)) {
        score += 3;
        matched.push(kw);
      } else if (kw.length >= 4 && normalized.some(h => h.includes(kw))) {
        score += 1;
        matched.push(kw);
      }
    }
    return { sig, score, matched };
  }).sort((a, b) => b.score - a.score);

  const top = scores[0];
  const runnerUp = scores[1];
  const metricCount = Object.values(mapping).filter(v => v === "value").length;

  if (!top || top.score === 0) {
    return {
      type: metricCount > 1 ? "Multi-Metric Dataset" : "General Business Dataset",
      industry: "General Business",
      confidence: 50,
      recommendedWorkflows: ["Data Exploration", "Decision Intelligence"],
      matchedKeywords: [],
    };
  }

  // Confidence: dominance over runner-up, scaled by absolute score.
  const dominance = runnerUp && runnerUp.score > 0
    ? top.score / (top.score + runnerUp.score)
    : 1;
  const absScore = Math.min(1, top.score / 12); // 4+ strong matches → full marks
  const confidence = Math.round(50 + dominance * 30 + absScore * 20);

  return {
    type: top.sig.type,
    industry: top.sig.industry,
    confidence: Math.max(50, Math.min(98, confidence)),
    subType: `${top.sig.industry} KPIs`,
    recommendedWorkflows: top.sig.workflows,
    matchedKeywords: top.matched.slice(0, 6),
  };
}

export function confidenceColor(confidence: number): string {
  if (confidence >= 85) return "text-success";
  if (confidence >= 65) return "text-warning";
  return "text-muted-foreground";
}

export function qualityColor(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-primary";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}
