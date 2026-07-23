import {
  computeDiagnostics,
  inferSchema,
  type ColumnMapping,
  type DatasetDiagnostics,
  type DetectedSchema,
} from "./data-upload-utils";
import {
  applyAutoFixes,
  buildRecommendedAutoFixOperations,
  type AutoFixOperation,
  type AutoFixResult,
} from "./ingestion-auto-fix";
import { buildIngestionIntelligence, type IngestionIntelligenceResult } from "./ingestion-intelligence";
import { buildImportRemediationPlan, type ImportRemediationPlan } from "./ingestion-remediation";

export interface AutoFixRecomputeResult {
  headers: string[];
  rows: string[][];
  schema: DetectedSchema[];
  mapping: ColumnMapping;
  diagnostics: DatasetDiagnostics;
  autoFix: AutoFixResult;
  intelligence: IngestionIntelligenceResult;
  remediation: ImportRemediationPlan;
}

export function buildMappingFromSchema(schema: DetectedSchema[]): ColumnMapping {
  return Object.fromEntries(schema.map((column) => [column.colIdx, column.inferredType]));
}

export function applyAutoFixesAndRecompute(args: {
  headers: string[];
  rows: string[][];
  operations?: AutoFixOperation[];
}): AutoFixRecomputeResult {
  const operations = args.operations ?? buildRecommendedAutoFixOperations(args.headers);
  const autoFix = applyAutoFixes({
    headers: args.headers,
    rows: args.rows,
    operations,
  });

  const schema = inferSchema(autoFix.headers, autoFix.rows);
  const mapping = buildMappingFromSchema(schema);
  const diagnostics = computeDiagnostics(autoFix.rows, autoFix.headers, mapping, schema);
  const intelligence = buildIngestionIntelligence({
    headers: autoFix.headers,
    rows: autoFix.rows,
    schema,
    mapping,
    diagnostics,
  });
  const remediation = buildImportRemediationPlan({
    schema,
    diagnostics,
    intelligence,
  });

  return {
    headers: autoFix.headers,
    rows: autoFix.rows,
    schema,
    mapping,
    diagnostics,
    autoFix,
    intelligence,
    remediation,
  };
}
