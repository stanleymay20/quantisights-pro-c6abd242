import type { DetectedSchema, DatasetDiagnostics } from "./data-upload-utils";
import type { IngestionIntelligenceResult } from "./ingestion-intelligence";

export type RemediationSeverity = "critical" | "warning" | "info";
export type RemediationAction = "auto_fix" | "review" | "ignore";

export interface RemediationIssue {
  id: string;
  severity: RemediationSeverity;
  title: string;
  column?: string;
  problem: string;
  impact: string;
  suggestedFix: string;
  actions: RemediationAction[];
}

export interface ReadinessBreakdown {
  total: number;
  components: Array<{
    label: string;
    score: number;
    max: number;
    reason: string;
  }>;
  penalties: Array<{
    label: string;
    value: number;
    reason: string;
  }>;
}

export interface ReviewQueueItem {
  column: string;
  confidence: number;
  reason: string;
  badges: string[];
  suggestedTarget?: string;
}

export interface ImportRemediationPlan {
  recommendation: "proceed" | "review" | "manual_review";
  recommendationLabel: string;
  recommendationReason: string;
  readiness: ReadinessBreakdown;
  issues: RemediationIssue[];
  reviewQueue: ReviewQueueItem[];
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function confidenceFromSchema(schema: DetectedSchema[]): number {
  return Math.round(avg(schema.map((column) => column.confidence)));
}

function semanticBadges(column: string, intelligence: IngestionIntelligenceResult): string[] {
  const field = intelligence.dictionary.fields.find((entry) => entry.name === column);
  const badges = new Set<string>();
  if (field?.semanticType === "pii" || field?.governanceFlags.includes("pii")) badges.add("PII");
  if (field?.semanticType === "identifier" || field?.businessRole === "entity_key") badges.add("Identifier");
  if (field?.inferredType === "value") badges.add("Metric");
  if (field?.inferredType === "date") badges.add("Date");
  if (field?.businessRole?.includes("kpi")) badges.add("KPI");
  return Array.from(badges);
}

export function buildImportRemediationPlan(args: {
  schema: DetectedSchema[];
  diagnostics?: DatasetDiagnostics | null;
  intelligence: IngestionIntelligenceResult;
}): ImportRemediationPlan {
  const { schema, diagnostics, intelligence } = args;
  const schemaConfidence = confidenceFromSchema(schema);
  const reviewFields = intelligence.dictionary.fields.filter(
    (field) => field.governanceFlags.includes("review_required") || field.confidence < 0.75,
  );
  const piiCount = intelligence.dictionary.summary.piiCount;
  const warningCount = intelligence.repairReport.summary.warnings.length;
  const validationHealth = diagnostics?.healthScore ?? 80;
  const missingPenalty = Math.round((diagnostics?.missingValuesPct ?? 0) / 2);

  const components = [
    {
      label: "Schema Quality",
      score: Math.round((schemaConfidence / 100) * 25),
      max: 25,
      reason: `Average mapping confidence is ${schemaConfidence}%`,
    },
    {
      label: "Validation Health",
      score: Math.round((validationHealth / 100) * 25),
      max: 25,
      reason: `Dataset health score is ${validationHealth}%`,
    },
    {
      label: "Governance",
      score: clamp(20 - piiCount * 4 - reviewFields.length * 2, 0, 20),
      max: 20,
      reason: `${piiCount} PII field(s), ${reviewFields.length} review-required field(s)`,
    },
    {
      label: "Repair Stability",
      score: clamp(15 - warningCount * 3, 0, 15),
      max: 15,
      reason: `${warningCount} repair warning(s) reported`,
    },
    {
      label: "Completeness",
      score: clamp(15 - missingPenalty, 0, 15),
      max: 15,
      reason: `${diagnostics?.missingValuesPct ?? 0}% missing values`,
    },
  ];

  const penalties = [
    ...(piiCount > 0 ? [{ label: "PII Exposure", value: piiCount * 4, reason: `${piiCount} sensitive field(s) detected` }] : []),
    ...(reviewFields.length > 0 ? [{ label: "Manual Review", value: reviewFields.length * 2, reason: `${reviewFields.length} field(s) need review` }] : []),
    ...(warningCount > 0 ? [{ label: "Repair Warnings", value: warningCount * 3, reason: `${warningCount} repair warning(s)` }] : []),
  ];

  const total = clamp(components.reduce((sum, item) => sum + item.score, 0));
  const issues: RemediationIssue[] = [];

  if (reviewFields.length > 0) {
    reviewFields.slice(0, 8).forEach((field) => {
      issues.push({
        id: `review-${field.name}`,
        severity: field.confidence < 0.65 ? "critical" : "warning",
        title: "Column requires review",
        column: field.name,
        problem: `${field.name} has low semantic confidence or a governance review flag.`,
        impact: "Downstream executive dashboards may classify this field incorrectly.",
        suggestedFix: `Review ${field.name} and confirm its target mapping before import.`,
        actions: ["review", "ignore"],
      });
    });
  }

  if (piiCount > 0) {
    issues.push({
      id: "pii-detected",
      severity: "warning",
      title: "Sensitive fields detected",
      problem: `${piiCount} PII field(s) were detected in the dataset.`,
      impact: "Sensitive data may require access controls, masking, or approval before publication.",
      suggestedFix: "Confirm whether these fields should be imported, masked, or excluded.",
      actions: ["review", "ignore"],
    });
  }

  if (warningCount > 0) {
    intelligence.repairReport.summary.warnings.slice(0, 5).forEach((warning, index) => {
      issues.push({
        id: `repair-warning-${index}`,
        severity: "warning",
        title: "Repair warning",
        problem: warning,
        impact: "Some inferred repairs may need human confirmation before import.",
        suggestedFix: "Review the affected fields and accept the repair if the preview looks correct.",
        actions: ["auto_fix", "review", "ignore"],
      });
    });
  }

  if (!issues.some((issue) => issue.severity === "critical")) {
    issues.push({
      id: "no-blocking-issues",
      severity: "info",
      title: "No blocking issues detected",
      problem: "The dataset passed the current ingestion review checks.",
      impact: "No manual intervention is required before import.",
      suggestedFix: "Proceed with import when ready.",
      actions: ["ignore"],
    });
  }

  const reviewQueue: ReviewQueueItem[] = schema
    .filter((column) => column.confidence < 85 || reviewFields.some((field) => field.name === column.column))
    .slice(0, 20)
    .map((column) => ({
      column: column.column,
      confidence: column.confidence,
      reason: column.reason,
      badges: semanticBadges(column.column, intelligence),
      suggestedTarget: column.inferredType,
    }));

  const recommendation = total >= 85 && issues.every((issue) => issue.severity !== "critical")
    ? "proceed"
    : total >= 70
      ? "review"
      : "manual_review";

  const recommendationLabel = recommendation === "proceed"
    ? "Proceed with Import"
    : recommendation === "review"
      ? "Review Recommended"
      : "Manual Review Required";

  const recommendationReason = recommendation === "proceed"
    ? "Dataset quality is sufficient for executive analysis."
    : recommendation === "review"
      ? `${reviewQueue.length || issues.length} item(s) should be reviewed before import.`
      : "One or more critical ingestion conditions require manual review.";

  return {
    recommendation,
    recommendationLabel,
    recommendationReason,
    readiness: { total, components, penalties },
    issues,
    reviewQueue,
  };
}
