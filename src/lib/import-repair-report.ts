import type { LocaleDetectionResult } from "./locale-detector";
import type { MixedTypeAnalysis } from "./mixed-type-analyzer";
import type { HeaderRecoveryResult } from "./header-recovery";
import type { CrossSheetDiscoveryResult } from "./cross-sheet-discovery";
import type { ColumnSimilarityReport } from "./column-similarity";
import type { DataDictionary } from "./data-dictionary";
import type { DatasetDiagnostics } from "./data-upload-utils";

export interface ImportRepairReport {
  generatedAt: string;
  locale?: LocaleDetectionResult | null;
  headerRecovery: {
    recoveredCount: number;
    reviewCount: number;
    recovered: HeaderRecoveryResult[];
  };
  mixedTypes: {
    repairedColumnCount: number;
    reviewColumnCount: number;
    columns: Record<string, MixedTypeAnalysis>;
  };
  relationships?: CrossSheetDiscoveryResult | null;
  columnSimilarity?: ColumnSimilarityReport | null;
  dictionary?: DataDictionary | null;
  diagnostics?: DatasetDiagnostics | null;
  summary: {
    repairsApplied: number;
    warnings: string[];
    trustSignal: "strong" | "moderate" | "weak";
    recommendedAction: "Proceed with Import" | "Review before Import" | "Fix Issues First";
  };
}

export function buildImportRepairReport(args: {
  locale?: LocaleDetectionResult | null;
  headerRecovery?: HeaderRecoveryResult[];
  mixedTypes?: Record<string, MixedTypeAnalysis>;
  relationships?: CrossSheetDiscoveryResult | null;
  columnSimilarity?: ColumnSimilarityReport | null;
  dictionary?: DataDictionary | null;
  diagnostics?: DatasetDiagnostics | null;
}): ImportRepairReport {
  const headerRecovery = args.headerRecovery ?? [];
  const mixedTypes = args.mixedTypes ?? {};

  const recoveredHeaders = headerRecovery.filter((item) => item.accepted && item.recovered);
  const headerReview = headerRecovery.filter((item) => !item.accepted && item.confidence < 0.8 && item.recovered);
  const mixedTypeRepairs = Object.values(mixedTypes).filter((analysis) => analysis.recommendation === "convert_invalid_to_null");
  const mixedTypeReviews = Object.values(mixedTypes).filter((analysis) => analysis.recommendation === "manual_review");

  const warnings: string[] = [];
  if (args.locale?.ambiguous) warnings.push("Locale detection is ambiguous");
  if (headerReview.length > 0) warnings.push(`${headerReview.length} recovered header suggestion${headerReview.length === 1 ? "" : "s"} need review`);
  if (mixedTypeReviews.length > 0) warnings.push(`${mixedTypeReviews.length} mixed-type column${mixedTypeReviews.length === 1 ? "" : "s"} need manual review`);
  if ((args.diagnostics?.piiRisk.columns.length ?? 0) > 0) warnings.push(`${args.diagnostics?.piiRisk.columns.length ?? 0} PII column${(args.diagnostics?.piiRisk.columns.length ?? 0) === 1 ? "" : "s"} detected`);
  if ((args.relationships?.relationships.length ?? 0) === 0 && (args.relationships?.sheetCount ?? 0) > 1) warnings.push("No cross-sheet relationships detected in multi-sheet workbook");

  const repairsApplied = recoveredHeaders.length + mixedTypeRepairs.length + (args.columnSimilarity?.groups.length ?? 0);
  const health = args.diagnostics?.healthScore ?? 70;
  const trustSignal = health >= 85 && warnings.length <= 1 ? "strong" : health >= 65 ? "moderate" : "weak";
  const recommendedAction = args.diagnostics?.recommendedAction ?? (trustSignal === "strong" ? "Proceed with Import" : trustSignal === "moderate" ? "Review before Import" : "Fix Issues First");

  return {
    generatedAt: new Date().toISOString(),
    locale: args.locale ?? null,
    headerRecovery: {
      recoveredCount: recoveredHeaders.length,
      reviewCount: headerReview.length,
      recovered: headerRecovery,
    },
    mixedTypes: {
      repairedColumnCount: mixedTypeRepairs.length,
      reviewColumnCount: mixedTypeReviews.length,
      columns: mixedTypes,
    },
    relationships: args.relationships ?? null,
    columnSimilarity: args.columnSimilarity ?? null,
    dictionary: args.dictionary ?? null,
    diagnostics: args.diagnostics ?? null,
    summary: {
      repairsApplied,
      warnings,
      trustSignal,
      recommendedAction,
    },
  };
}

export function renderImportRepairReportMarkdown(report: ImportRepairReport): string {
  const lines: string[] = [
    "# Quantivis Import Repair Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Summary",
    `- Recommended action: ${report.summary.recommendedAction}`,
    `- Trust signal: ${report.summary.trustSignal}`,
    `- Repairs applied: ${report.summary.repairsApplied}`,
    `- Warnings: ${report.summary.warnings.length}`,
    "",
  ];

  if (report.locale) {
    lines.push("## Locale", `- Locale: ${report.locale.locale}`, `- Confidence: ${Math.round(report.locale.confidence * 100)}%`, `- Reason: ${report.locale.reason}`, "");
  }

  lines.push(
    "## Header Recovery",
    `- Recovered headers: ${report.headerRecovery.recoveredCount}`,
    `- Needs review: ${report.headerRecovery.reviewCount}`,
    "",
    "## Mixed-Type Recovery",
    `- Repaired columns: ${report.mixedTypes.repairedColumnCount}`,
    `- Needs review: ${report.mixedTypes.reviewColumnCount}`,
    "",
  );

  if (report.relationships) {
    lines.push("## Cross-Sheet Relationships", `- ${report.relationships.summary}`, `- Confidence: ${Math.round(report.relationships.confidence * 100)}%`, "");
  }

  if (report.columnSimilarity) {
    lines.push("## Column Similarity", `- ${report.columnSimilarity.summary}`, `- Grouped columns: ${report.columnSimilarity.groupedColumnCount}`, "");
  }

  if (report.dictionary) {
    lines.push("## Data Dictionary", `- Fields: ${report.dictionary.fieldCount}`, `- Average confidence: ${Math.round(report.dictionary.summary.averageConfidence * 100)}%`, `- PII fields: ${report.dictionary.summary.piiCount}`, "");
  }

  if (report.summary.warnings.length > 0) {
    lines.push("## Warnings", ...report.summary.warnings.map((warning) => `- ${warning}`), "");
  }

  return lines.join("\n");
}
