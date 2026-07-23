import type { DetectedSchema, ColumnTarget } from "./data-upload-utils";
import type { SemanticSchemaSummary, BusinessRole, SemanticColumnType } from "./semantic-column-classifier";

export interface DataDictionaryField {
  name: string;
  index: number;
  inferredType: ColumnTarget;
  semanticType?: SemanticColumnType;
  businessRole?: BusinessRole;
  description: string;
  confidence: number;
  nullable: boolean;
  sampleValues: string[];
  governanceFlags: string[];
}

export interface DataDictionary {
  generatedAt: string;
  fieldCount: number;
  fields: DataDictionaryField[];
  summary: {
    metricCount: number;
    dimensionCount: number;
    identifierCount: number;
    piiCount: number;
    reviewRequiredCount: number;
    averageConfidence: number;
  };
}

function humanizeName(name: string): string {
  return name
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function describeField(name: string, inferredType: ColumnTarget, semanticType?: SemanticColumnType, businessRole?: BusinessRole): string {
  const label = humanizeName(name);
  if (businessRole === "financial_kpi") return `${label} is a financial KPI used for performance and executive analysis.`;
  if (businessRole === "operational_kpi") return `${label} is an operational KPI used to monitor process or production performance.`;
  if (businessRole === "customer_kpi") return `${label} is a customer KPI used to monitor customer outcomes or market response.`;
  if (businessRole === "workforce_kpi") return `${label} is a workforce KPI used for people and HR analysis.`;
  if (businessRole === "risk_kpi") return `${label} is a risk or control KPI used for governance and exception monitoring.`;
  if (businessRole === "entity_key") return `${label} is a business identifier and should not be aggregated as a metric.`;
  if (businessRole === "geo_dimension") return `${label} is a geographic dimension for regional grouping.`;
  if (businessRole === "time_dimension") return `${label} is a time dimension for trend analysis.`;
  if (semanticType === "pii") return `${label} appears to contain sensitive information and should be governed carefully.`;
  if (inferredType === "value") return `${label} is a numeric measure for analysis.`;
  if (inferredType === "segment") return `${label} is a categorical segment for grouping and filtering.`;
  if (inferredType === "region") return `${label} is a regional dimension.`;
  if (inferredType === "date") return `${label} is a date or reporting-period field.`;
  return `${label} was detected during ingestion and may require review before downstream use.`;
}

export function generateDataDictionary(args: {
  schema: DetectedSchema[];
  rows: string[][];
  semantic?: SemanticSchemaSummary | null;
}): DataDictionary {
  const { schema, rows, semantic } = args;
  const semanticByIndex = new Map((semantic?.profiles ?? []).map((profile) => [profile.colIdx, profile]));

  const fields: DataDictionaryField[] = schema.map((column) => {
    const profile = semanticByIndex.get(column.colIdx);
    const sampleValues = rows
      .slice(0, 5)
      .map((row) => row[column.colIdx])
      .filter(Boolean);
    const emptyCount = rows.filter((row) => !row[column.colIdx] || !String(row[column.colIdx]).trim()).length;
    const governanceFlags: string[] = [];
    if (profile?.semanticType === "pii") governanceFlags.push("pii");
    if (profile?.semanticType === "identifier") governanceFlags.push("identifier");
    if (profile?.reviewRequired || column.confidence < 75) governanceFlags.push("review_required");

    return {
      name: column.column,
      index: column.colIdx,
      inferredType: column.inferredType,
      semanticType: profile?.semanticType,
      businessRole: profile?.businessRole,
      description: describeField(column.column, column.inferredType, profile?.semanticType, profile?.businessRole),
      confidence: Math.min(0.95, Math.round(((profile?.confidence ?? column.confidence) / 100) * 100) / 100),
      nullable: emptyCount > 0,
      sampleValues,
      governanceFlags,
    };
  });

  const averageConfidence = fields.length > 0
    ? Math.round((fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length) * 100) / 100
    : 0;

  return {
    generatedAt: new Date().toISOString(),
    fieldCount: fields.length,
    fields,
    summary: {
      metricCount: fields.filter((field) => field.inferredType === "value").length,
      dimensionCount: fields.filter((field) => ["segment", "region", "region_code", "date"].includes(field.inferredType)).length,
      identifierCount: fields.filter((field) => field.semanticType === "identifier" || field.businessRole === "entity_key").length,
      piiCount: fields.filter((field) => field.semanticType === "pii" || field.governanceFlags.includes("pii")).length,
      reviewRequiredCount: fields.filter((field) => field.governanceFlags.includes("review_required")).length,
      averageConfidence,
    },
  };
}
