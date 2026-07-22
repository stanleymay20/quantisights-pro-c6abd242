import type { DetectedSchema, ColumnMapping, DatasetDiagnostics } from "./data-upload-utils";
import { detectNumberLocale, type LocaleDetectionResult } from "./locale-detector";
import { analyzeDatasetMixedTypes, type MixedTypeAnalysis } from "./mixed-type-analyzer";
import { recoverHeaders, type HeaderRecoveryResult } from "./header-recovery";
import { classifySemanticSchema, type SemanticSchemaSummary } from "./semantic-column-classifier";
import { generateDataDictionary, type DataDictionary } from "./data-dictionary";
import { groupSimilarColumns, type ColumnSimilarityReport } from "./column-similarity";
import { buildImportRepairReport, type ImportRepairReport } from "./import-repair-report";
import type { CrossSheetDiscoveryResult } from "./cross-sheet-discovery";

export interface IngestionIntelligenceResult {
  locale: LocaleDetectionResult;
  headerRecovery: HeaderRecoveryResult[];
  mixedTypes: Record<string, MixedTypeAnalysis>;
  semanticSchema: SemanticSchemaSummary;
  dictionary: DataDictionary;
  columnSimilarity: ColumnSimilarityReport;
  repairReport: ImportRepairReport;
}

export function buildIngestionIntelligence(args: {
  headers: string[];
  rows: string[][];
  schema: DetectedSchema[];
  mapping?: ColumnMapping;
  diagnostics?: DatasetDiagnostics | null;
  relationships?: CrossSheetDiscoveryResult | null;
}): IngestionIntelligenceResult {
  const { headers, rows, schema, diagnostics, relationships } = args;

  const locale = detectNumberLocale(rows);
  const headerRecovery = recoverHeaders(headers, rows);
  const mixedTypes = analyzeDatasetMixedTypes(headers, rows);
  const semanticSchema = classifySemanticSchema({ schema, rows });
  const dictionary = generateDataDictionary({ schema, rows, semantic: semanticSchema });
  const columnSimilarity = groupSimilarColumns(headers);
  const repairReport = buildImportRepairReport({
    locale,
    headerRecovery,
    mixedTypes,
    relationships: relationships ?? null,
    columnSimilarity,
    dictionary,
    diagnostics: diagnostics ?? null,
  });

  return {
    locale,
    headerRecovery,
    mixedTypes,
    semanticSchema,
    dictionary,
    columnSimilarity,
    repairReport,
  };
}

export function summarizeIngestionIntelligence(result: IngestionIntelligenceResult): string[] {
  const lines: string[] = [];
  lines.push(`Locale: ${result.locale.locale} (${Math.round(result.locale.confidence * 100)}%)`);
  lines.push(`Recovered headers: ${result.repairReport.headerRecovery.recoveredCount}`);
  lines.push(`Mixed-type repairs: ${result.repairReport.mixedTypes.repairedColumnCount}`);
  lines.push(`Dictionary fields: ${result.dictionary.fieldCount}`);
  lines.push(`Related column groups: ${result.columnSimilarity.groups.length}`);
  lines.push(`PII fields: ${result.dictionary.summary.piiCount}`);
  lines.push(`Trust signal: ${result.repairReport.summary.trustSignal}`);
  lines.push(`Recommended action: ${result.repairReport.summary.recommendedAction}`);
  return lines;
}
