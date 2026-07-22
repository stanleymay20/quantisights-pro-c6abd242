import { isBooleanLike, normalizeCell, parseMessyDate, parseMessyNumber } from "./messy-data-guards";

export type DominantColumnType = "numeric" | "date" | "boolean" | "text" | "empty";
export type MixedTypeRecommendation = "treat_as_numeric" | "treat_as_date" | "treat_as_boolean" | "treat_as_text" | "convert_invalid_to_null" | "manual_review";

export interface MixedTypeAnalysis {
  dominantType: DominantColumnType;
  confidence: number;
  validCount: number;
  invalidCount: number;
  emptyCount: number;
  totalCount: number;
  invalidSamples: string[];
  recommendation: MixedTypeRecommendation;
  reason: string;
}

function ratio(count: number, total: number): number {
  return total > 0 ? count / total : 0;
}

export function analyzeMixedTypes(values: Array<string | undefined | null>): MixedTypeAnalysis {
  const normalized = values.map(normalizeCell);
  const nonEmpty = normalized.filter(Boolean);
  const emptyCount = normalized.length - nonEmpty.length;

  if (nonEmpty.length === 0) {
    return {
      dominantType: "empty",
      confidence: 0,
      validCount: 0,
      invalidCount: 0,
      emptyCount,
      totalCount: normalized.length,
      invalidSamples: [],
      recommendation: "manual_review",
      reason: "Column contains no usable sample values",
    };
  }

  const numericValues = nonEmpty.filter((value) => Number.isFinite(parseMessyNumber(value)));
  const dateValues = nonEmpty.filter((value) => parseMessyDate(value) !== null);
  const booleanValues = nonEmpty.filter(isBooleanLike);

  const candidates = [
    { type: "numeric" as DominantColumnType, count: numericValues.length, recommendation: "treat_as_numeric" as MixedTypeRecommendation },
    { type: "date" as DominantColumnType, count: dateValues.length, recommendation: "treat_as_date" as MixedTypeRecommendation },
    { type: "boolean" as DominantColumnType, count: booleanValues.length, recommendation: "treat_as_boolean" as MixedTypeRecommendation },
  ].sort((a, b) => b.count - a.count);

  const top = candidates[0];
  const topRatio = ratio(top.count, nonEmpty.length);
  const confidence = Math.min(0.95, Math.round(topRatio * 100) / 100);

  if (topRatio >= 0.8) {
    const invalidSamples = nonEmpty
      .filter((value) => {
        if (top.type === "numeric") return !Number.isFinite(parseMessyNumber(value));
        if (top.type === "date") return parseMessyDate(value) === null;
        if (top.type === "boolean") return !isBooleanLike(value);
        return false;
      })
      .slice(0, 5);

    return {
      dominantType: top.type,
      confidence,
      validCount: top.count,
      invalidCount: nonEmpty.length - top.count,
      emptyCount,
      totalCount: normalized.length,
      invalidSamples,
      recommendation: invalidSamples.length > 0 ? "convert_invalid_to_null" : top.recommendation,
      reason: `${Math.round(topRatio * 100)}% of non-empty values are ${top.type}`,
    };
  }

  return {
    dominantType: "text",
    confidence: Math.max(0.5, Math.round((1 - topRatio) * 100) / 100),
    validCount: nonEmpty.length,
    invalidCount: 0,
    emptyCount,
    totalCount: normalized.length,
    invalidSamples: [],
    recommendation: "treat_as_text",
    reason: "No numeric, date, or boolean type dominates strongly enough",
  };
}

export function analyzeDatasetMixedTypes(headers: string[], rows: string[][]): Record<string, MixedTypeAnalysis> {
  return Object.fromEntries(headers.map((header, idx) => [
    header,
    analyzeMixedTypes(rows.map((row) => row[idx])),
  ]));
}
