import type { IngestionIntelligenceResult } from "./ingestion-intelligence";
import type { CrossSheetDiscoveryResult } from "./cross-sheet-discovery";

export interface IngestionMetadataSnapshot {
  locale: {
    locale: string;
    confidence: number;
    decimalSeparator: string | null;
    thousandsSeparator: string | null;
    ambiguous: boolean;
    reason: string;
  };
  repairReport: {
    repairsApplied: number;
    warnings: string[];
    trustSignal: string;
    recommendedAction: string;
    recoveredHeaders: number;
    mixedTypeRepairs: number;
    mixedTypeReviewColumns: number;
  };
  dataDictionary: {
    fieldCount: number;
    metricCount: number;
    dimensionCount: number;
    identifierCount: number;
    piiCount: number;
    reviewRequiredCount: number;
    averageConfidence: number;
  };
  semanticSchema: {
    kpiColumns: string[];
    entityColumns: string[];
    piiColumns: string[];
    reviewRequiredColumns: string[];
  };
  columnSimilarity: {
    groupCount: number;
    groupedColumnCount: number;
    groups: Array<{
      canonicalName: string;
      columns: string[];
      confidence: number;
    }>;
  };
  relationships?: {
    sheetCount: number;
    relationshipCount: number;
    confidence: number;
    summary: string;
  } | null;
}

export function toIngestionMetadataSnapshot(
  intelligence: IngestionIntelligenceResult,
  relationships?: CrossSheetDiscoveryResult | null,
): IngestionMetadataSnapshot {
  return {
    locale: {
      locale: intelligence.locale.locale,
      confidence: intelligence.locale.confidence,
      decimalSeparator: intelligence.locale.decimalSeparator,
      thousandsSeparator: intelligence.locale.thousandsSeparator,
      ambiguous: intelligence.locale.ambiguous,
      reason: intelligence.locale.reason,
    },
    repairReport: {
      repairsApplied: intelligence.repairReport.summary.repairsApplied,
      warnings: intelligence.repairReport.summary.warnings,
      trustSignal: intelligence.repairReport.summary.trustSignal,
      recommendedAction: intelligence.repairReport.summary.recommendedAction,
      recoveredHeaders: intelligence.repairReport.headerRecovery.recoveredCount,
      mixedTypeRepairs: intelligence.repairReport.mixedTypes.repairedColumnCount,
      mixedTypeReviewColumns: intelligence.repairReport.mixedTypes.reviewColumnCount,
    },
    dataDictionary: {
      fieldCount: intelligence.dictionary.fieldCount,
      metricCount: intelligence.dictionary.summary.metricCount,
      dimensionCount: intelligence.dictionary.summary.dimensionCount,
      identifierCount: intelligence.dictionary.summary.identifierCount,
      piiCount: intelligence.dictionary.summary.piiCount,
      reviewRequiredCount: intelligence.dictionary.summary.reviewRequiredCount,
      averageConfidence: intelligence.dictionary.summary.averageConfidence,
    },
    semanticSchema: {
      kpiColumns: intelligence.semanticSchema.kpiColumns,
      entityColumns: intelligence.semanticSchema.identifierColumns,
      piiColumns: intelligence.semanticSchema.piiColumns,
      reviewRequiredColumns: intelligence.semanticSchema.profiles
        .filter((p) => p.reviewRequired)
        .map((p) => p.column),
    },
    columnSimilarity: {
      groupCount: intelligence.columnSimilarity.groups.length,
      groupedColumnCount: intelligence.columnSimilarity.groupedColumnCount,
      groups: intelligence.columnSimilarity.groups.map((group) => ({
        canonicalName: group.canonicalName,
        columns: group.columns,
        confidence: group.confidence,
      })),
    },
    relationships: relationships
      ? {
          sheetCount: relationships.sheetCount,
          relationshipCount: relationships.relationships.length,
          confidence: relationships.confidence,
          summary: relationships.summary,
        }
      : null,
  };
}
