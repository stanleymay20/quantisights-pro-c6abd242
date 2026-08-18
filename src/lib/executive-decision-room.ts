import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";
import type { ReviewableDecision } from "@/components/decisions/executive-review-flow";

export type DecisionRoomStageStatus = "recorded" | "pending" | "unavailable";

export interface DecisionRoomPipelineStage {
  key: string;
  label: string;
  status: DecisionRoomStageStatus;
  detail: string;
  source: string;
}

export interface DecisionRoomEvidenceItem {
  id: string;
  label: string;
  value: string;
  source: string;
  sourceType: string;
  location: string | null;
  excerpt: string | null;
}

export interface DecisionRoomCompletenessCheck {
  key: string;
  label: string;
  complete: boolean;
  source: string;
}

export interface DecisionRoomModel {
  recommendation: string | null;
  confidence: number | null;
  status: string | null;
  owner: string | null;
  expectedOutcome: string | null;
  actualOutcome: string | null;
  supportingEvidence: DecisionRoomEvidenceItem[];
  assumptions: string[];
  limitations: string[];
  alternatives: string[];
  deterministicRisks: string[];
  pipeline: DecisionRoomPipelineStage[];
  completeness: {
    complete: number;
    total: number;
    checks: DecisionRoomCompletenessCheck[];
    missing: string[];
  };
}

export interface DecisionRoomDecision extends ReviewableDecision {
  expected_metric?: string | null;
  evaluation_window_days?: number | null;
  suggested_owner?: string | null;
  predicted_net_impact?: number | null;
  predicted_roi_probability?: number | null;
  outcome_delta?: number | null;
  outcome_summary?: string | null;
}

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const confidenceOf = (decision: DecisionRoomDecision): number | null =>
  decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence ?? null;

const metaOf = (decision: DecisionRoomDecision): ExplanationMetadata =>
  ((decision.explanation_metadata ?? {}) as ExplanationMetadata);

const formatMoney = (value: number): string =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);

function evidenceFromMetadata(decision: DecisionRoomDecision): DecisionRoomEvidenceItem[] {
  const meta = metaOf(decision);
  const items: DecisionRoomEvidenceItem[] = [];

  if (meta.source_data) {
    const parts = [
      nonEmpty(meta.source_data.dataset_name) ? `Dataset: ${meta.source_data.dataset_name}` : null,
      nonEmpty(meta.source_data.time_range) ? `Period: ${meta.source_data.time_range}` : null,
      meta.source_data.rows_analyzed != null ? `${meta.source_data.rows_analyzed.toLocaleString()} rows` : null,
      meta.source_data.key_metrics?.length ? `Metrics: ${meta.source_data.key_metrics.join(", ")}` : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      items.push({
        id: "source-data",
        label: "Source data",
        value: parts.join(" · "),
        source: "decision_ledger.explanation_metadata.source_data",
        sourceType: "Structured dataset metadata",
        location: meta.source_data.dataset_id ?? null,
        excerpt: null,
      });
    }
  }

  if (meta.statistical_basis) {
    const parts = [
      nonEmpty(meta.statistical_basis.method) ? meta.statistical_basis.method : null,
      meta.statistical_basis.z_score != null ? `z=${meta.statistical_basis.z_score}` : null,
      meta.statistical_basis.data_points_used != null
        ? `${meta.statistical_basis.data_points_used} data points`
        : null,
      nonEmpty(meta.statistical_basis.note) ? meta.statistical_basis.note : null,
    ].filter(Boolean);
    if (parts.length > 0) {
      items.push({
        id: "statistical-basis",
        label: "Analytical evidence",
        value: parts.join(" · "),
        source: "decision_ledger.explanation_metadata.statistical_basis",
        sourceType: "Statistical analysis",
        location: null,
        excerpt: meta.statistical_basis.note ?? null,
      });
    }
  }

  if (meta.triggering_insight && (nonEmpty(meta.triggering_insight.description) || nonEmpty(meta.triggering_insight.metric_name))) {
    items.push({
      id: "triggering-insight",
      label: "Triggering signal",
      value:
        meta.triggering_insight.description ??
        [meta.triggering_insight.metric_name, meta.triggering_insight.change_value].filter(Boolean).join(": "),
      source: "decision_ledger.explanation_metadata.triggering_insight",
      sourceType: "Derived insight",
      location: meta.triggering_insight.metric_name ?? null,
      excerpt: meta.triggering_insight.description ?? null,
    });
  }

  if (nonEmpty(decision.source_insight_summary)) {
    items.push({
      id: "source-insight-summary",
      label: "Recorded source insight",
      value: decision.source_insight_summary,
      source: "decision_ledger.source_insight_summary",
      sourceType: "Recorded decision context",
      location: null,
      excerpt: decision.source_insight_summary,
    });
  }

  if (meta.dual_layer_enrichment?.client_evidence_summary) {
    items.push({
      id: "client-evidence",
      label: "Client evidence summary",
      value: meta.dual_layer_enrichment.client_evidence_summary,
      source: "decision_ledger.explanation_metadata.dual_layer_enrichment.client_evidence_summary",
      sourceType: "Stored enrichment summary",
      location: null,
      excerpt: meta.dual_layer_enrichment.client_evidence_summary,
    });
  }

  return items;
}

function deterministicRisks(decision: DecisionRoomDecision): string[] {
  const meta = metaOf(decision);
  const risks: string[] = [];

  if (decision.confidence_cap_reason) risks.push(`Confidence cap: ${decision.confidence_cap_reason}`);
  for (const limitation of meta.limitations ?? []) risks.push(limitation);

  const clientConfidence = meta.dual_layer_enrichment?.client_confidence;
  const enrichedConfidence = meta.dual_layer_enrichment?.enriched_confidence;
  if (
    clientConfidence != null &&
    enrichedConfidence != null &&
    Math.abs(clientConfidence - enrichedConfidence) >= 15
  ) {
    risks.push(
      `Stored evidence layers disagree materially on confidence (${clientConfidence}% vs ${enrichedConfidence}%).`,
    );
  }

  return [...new Set(risks)];
}

function alternativesOf(decision: DecisionRoomDecision): string[] {
  const meta = metaOf(decision) as ExplanationMetadata & {
    alternatives?: unknown;
    alternatives_considered?: unknown;
  };
  const candidate = meta.alternatives_considered ?? meta.alternatives;
  if (!Array.isArray(candidate)) return [];
  return candidate.filter(nonEmpty);
}

function buildPipeline(decision: DecisionRoomDecision): DecisionRoomPipelineStage[] {
  const meta = metaOf(decision);
  const hasSource = Boolean(meta.source_data || nonEmpty(decision.source_insight_summary));
  const hasAnalysis = Boolean(meta.statistical_basis || meta.triggering_insight || meta.reasoning);
  const hasClaims = Boolean(meta.reasoning || (meta.assumptions?.length ?? 0) > 0 || (meta.limitations?.length ?? 0) > 0);
  const hasRecommendation = nonEmpty(decision.recommended_action);
  const hasDecision = Boolean(decision.decided_at || decision.decided_by || decision.decision_status === "approved" || decision.decision_status === "rejected");
  const hasExecution = Boolean(decision.execution_started_at || decision.execution_completed_at || (decision.execution_status && decision.execution_status !== "not_started"));
  const hasOutcome = Boolean(decision.outcome_measured_at || decision.actual_value != null || decision.outcome_delta != null);

  return [
    {
      key: "source",
      label: "Source evidence",
      status: hasSource ? "recorded" : "unavailable",
      detail: hasSource ? "Source context is attached to this decision." : "No source context is stored on this decision.",
      source: "decision_ledger.explanation_metadata.source_data / source_insight_summary",
    },
    {
      key: "analysis",
      label: "Extraction & analysis",
      status: hasAnalysis ? "recorded" : "unavailable",
      detail: hasAnalysis ? "Analytical or reasoning metadata is recorded." : "No analytical transformation is recorded.",
      source: "decision_ledger.explanation_metadata",
    },
    {
      key: "claims",
      label: "Claims & assumptions",
      status: hasClaims ? "recorded" : "unavailable",
      detail: hasClaims ? "Reasoning, assumptions or limitations are inspectable." : "No claims, assumptions or limitations are stored.",
      source: "decision_ledger.explanation_metadata.reasoning / assumptions / limitations",
    },
    {
      key: "recommendation",
      label: "Recommendation & options",
      status: hasRecommendation ? "recorded" : "unavailable",
      detail: hasRecommendation ? "A recommendation is recorded on the decision." : "No recommendation is recorded.",
      source: "decision_ledger.recommended_action",
    },
    {
      key: "review",
      label: "Human review & decision",
      status: hasDecision ? "recorded" : "pending",
      detail: hasDecision ? "Decision review activity is recorded." : "Awaiting a recorded human decision.",
      source: "decision_ledger.decision_status / decided_by / decided_at",
    },
    {
      key: "execution",
      label: "Execution",
      status: hasExecution ? "recorded" : hasDecision ? "pending" : "unavailable",
      detail: hasExecution ? "Execution activity is recorded." : hasDecision ? "Decision recorded; execution has not yet been recorded." : "Execution is not applicable until a decision is made.",
      source: "decision_ledger.execution_status / execution_started_at / execution_completed_at",
    },
    {
      key: "outcome",
      label: "Outcome & learning",
      status: hasOutcome ? "recorded" : hasExecution ? "pending" : "unavailable",
      detail: hasOutcome ? "Measured outcome data is recorded." : hasExecution ? "Execution exists; outcome measurement is still pending." : "No measured outcome is available yet.",
      source: "decision_ledger.outcome_measured_at / actual_value / outcome_delta",
    },
  ];
}

function buildCompleteness(decision: DecisionRoomDecision) {
  const meta = metaOf(decision);
  const checks: DecisionRoomCompletenessCheck[] = [
    {
      key: "source",
      label: "Source context identified",
      complete: Boolean(meta.source_data || nonEmpty(decision.source_insight_summary)),
      source: "source_data / source_insight_summary",
    },
    {
      key: "analysis",
      label: "Analytical basis recorded",
      complete: Boolean(meta.statistical_basis || meta.triggering_insight),
      source: "explanation_metadata.statistical_basis / triggering_insight",
    },
    {
      key: "reasoning",
      label: "Decision reasoning recorded",
      complete: Boolean(meta.reasoning && Object.values(meta.reasoning).some(nonEmpty)),
      source: "explanation_metadata.reasoning",
    },
    {
      key: "assumptions",
      label: "Assumptions or limitations recorded",
      complete: Boolean((meta.assumptions?.length ?? 0) > 0 || (meta.limitations?.length ?? 0) > 0),
      source: "explanation_metadata.assumptions / limitations",
    },
    {
      key: "recommendation",
      label: "Recommendation recorded",
      complete: nonEmpty(decision.recommended_action),
      source: "decision_ledger.recommended_action",
    },
    {
      key: "confidence",
      label: "Decision-time confidence basis available",
      complete: confidenceOf(decision) != null || Boolean(meta.confidence_explanation),
      source: "decision_ledger.*confidence / explanation_metadata.confidence_explanation",
    },
  ];
  const complete = checks.filter((check) => check.complete).length;
  return {
    complete,
    total: checks.length,
    checks,
    missing: checks.filter((check) => !check.complete).map((check) => check.label),
  };
}

export function buildDecisionRoomModel(decision: DecisionRoomDecision): DecisionRoomModel {
  const meta = metaOf(decision);
  const expectedOutcome =
    meta.expected_impact?.range ??
    (decision.predicted_net_impact != null ? formatMoney(decision.predicted_net_impact) : null);
  const actualOutcome =
    decision.outcome_summary ??
    (decision.actual_value != null ? String(decision.actual_value) : decision.outcome_delta != null ? String(decision.outcome_delta) : null);

  return {
    recommendation: nonEmpty(decision.recommended_action) ? decision.recommended_action : null,
    confidence: confidenceOf(decision),
    status: decision.decision_status ?? null,
    owner: decision.suggested_owner ?? decision.decided_by ?? null,
    expectedOutcome,
    actualOutcome,
    supportingEvidence: evidenceFromMetadata(decision),
    assumptions: (meta.assumptions ?? []).filter(nonEmpty),
    limitations: (meta.limitations ?? []).filter(nonEmpty),
    alternatives: alternativesOf(decision),
    deterministicRisks: deterministicRisks(decision),
    pipeline: buildPipeline(decision),
    completeness: buildCompleteness(decision),
  };
}
