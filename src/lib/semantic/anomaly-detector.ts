/**
 * Upload-Time Anomaly Detector — Phase 8
 *
 * Runs across numeric columns of a sampled dataset to surface spikes,
 * drops, extreme outliers, and impossible values. Heuristic-only — designed
 * to be fast enough to run synchronously during ingestion preview.
 */

export type AnomalySeverity = "info" | "low" | "medium" | "high" | "critical";

export interface SemanticAnomaly {
  column: string;
  severity: AnomalySeverity;
  kind: "spike" | "drop" | "outlier" | "impossible" | "constant";
  affectedRows: number;
  explanation: string;
  recommendation: string;
}

export interface AnomalyDetectionResult {
  anomalies: SemanticAnomaly[];
  affectedColumns: string[];
  summary: string;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,\s€$£%]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
    const n = Number(cleaned.replace(/,(\d+)$/, ".$1"));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

interface ColumnStats {
  values: number[];
  mean: number;
  std: number;
  min: number;
  max: number;
  negativeCount: number;
}

function statsFor(values: number[]): ColumnStats {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  let min = values[0], max = values[0], neg = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    if (v < 0) neg++;
  }
  return { values, mean, std, min, max, negativeCount: neg };
}

const NON_NEGATIVE_HINTS = [
  "revenue", "sales", "price", "amount", "quantity", "qty", "count",
  "headcount", "inventory", "stock", "units", "cost",
];

const PERCENT_HINTS = ["pct", "percent", "rate", "ratio", "%"];

function isLikelyNonNegative(col: string): boolean {
  const n = col.toLowerCase();
  return NON_NEGATIVE_HINTS.some((h) => n.includes(h));
}

function isLikelyPercent(col: string): boolean {
  const n = col.toLowerCase();
  return PERCENT_HINTS.some((h) => n.includes(h));
}

export function detectAnomalies(
  headers: string[],
  rows: Array<Record<string, unknown> | unknown[]>,
): AnomalyDetectionResult {
  const anomalies: SemanticAnomaly[] = [];
  const affected = new Set<string>();
  if (rows.length === 0) return { anomalies, affectedColumns: [], summary: "No rows to analyze." };

  for (let c = 0; c < headers.length; c++) {
    const col = headers[c];
    const nums: number[] = [];
    for (const r of rows) {
      const raw = Array.isArray(r) ? r[c] : (r as Record<string, unknown>)[col];
      const n = toNumber(raw);
      if (n !== null) nums.push(n);
    }
    if (nums.length < 5) continue;

    const s = statsFor(nums);

    // Constant column (low information, often a pipeline error)
    if (s.std === 0) {
      anomalies.push({
        column: col,
        severity: "low",
        kind: "constant",
        affectedRows: nums.length,
        explanation: `All ${nums.length} numeric values equal ${s.min}.`,
        recommendation: "Verify the column is populated correctly upstream.",
      });
      affected.add(col);
      continue;
    }

    // Impossible values — negatives in a column that should be non-negative
    if (isLikelyNonNegative(col) && s.negativeCount > 0) {
      anomalies.push({
        column: col,
        severity: "high",
        kind: "impossible",
        affectedRows: s.negativeCount,
        explanation: `${s.negativeCount} negative value(s) in "${col}" which is expected to be ≥ 0.`,
        recommendation: "Review source system — likely sign-convention bug or refund leak.",
      });
      affected.add(col);
    }

    // Percent column with out-of-range values
    if (isLikelyPercent(col)) {
      const oor = nums.filter((v) => v < 0 || v > (s.max > 1.5 ? 100 : 1)).length;
      if (oor > 0) {
        anomalies.push({
          column: col,
          severity: "medium",
          kind: "impossible",
          affectedRows: oor,
          explanation: `${oor} value(s) outside expected percent range.`,
          recommendation: "Confirm whether the column is a fraction (0–1) or percent (0–100).",
        });
        affected.add(col);
      }
    }

    // Outliers via robust z (mean + 4σ as a sharp cut)
    let extreme = 0;
    for (const v of nums) {
      if (Math.abs(v - s.mean) > 4 * s.std) extreme++;
    }
    if (extreme > 0) {
      const sev: AnomalySeverity =
        extreme / nums.length > 0.05 ? "high" : extreme > 3 ? "medium" : "low";
      anomalies.push({
        column: col,
        severity: sev,
        kind: "outlier",
        affectedRows: extreme,
        explanation: `${extreme} value(s) > 4σ from mean (μ=${s.mean.toFixed(2)}, σ=${s.std.toFixed(2)}).`,
        recommendation: "Investigate whether these are legitimate spikes or data-entry errors.",
      });
      affected.add(col);
    }

    // Spike/drop vs running median of first 25%
    if (nums.length >= 20) {
      const baseSlice = nums.slice(0, Math.floor(nums.length / 4));
      const baseMean = baseSlice.reduce((a, b) => a + b, 0) / baseSlice.length;
      if (baseMean !== 0) {
        const ratio = s.max / Math.max(Math.abs(baseMean), 1e-9);
        if (ratio > 10) {
          anomalies.push({
            column: col,
            severity: "medium",
            kind: "spike",
            affectedRows: 1,
            explanation: `Peak value ${s.max.toFixed(2)} is ${ratio.toFixed(1)}× the early-window mean.`,
            recommendation: "Confirm event-driven spike or unit mismatch.",
          });
          affected.add(col);
        }
        const dropRatio = baseMean / Math.max(Math.abs(s.min), 1e-9);
        if (s.min < baseMean * 0.1 && baseMean > 0 && dropRatio > 10) {
          anomalies.push({
            column: col,
            severity: "medium",
            kind: "drop",
            affectedRows: 1,
            explanation: `Minimum value ${s.min.toFixed(2)} collapses vs early-window mean ${baseMean.toFixed(2)}.`,
            recommendation: "Check for outages or data-collection gaps.",
          });
          affected.add(col);
        }
      }
    }
  }

  anomalies.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return {
    anomalies,
    affectedColumns: [...affected],
    summary:
      anomalies.length === 0
        ? "No anomalies detected in sample."
        : `${anomalies.length} anomaly signal(s) across ${affected.size} column(s).`,
  };
}

function severityRank(s: AnomalySeverity): number {
  return { info: 0, low: 1, medium: 2, high: 3, critical: 4 }[s];
}
