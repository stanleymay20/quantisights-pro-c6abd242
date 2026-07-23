import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";
import type { ExecutiveDecisionRecord } from "@/components/decisions/executive-decision-review-utils";

/**
 * UX-2 — pure helpers for the executive review flow
 * (/executive-brief → /decisions/:id/review → /decisions/:id/outcome).
 *
 * No Supabase, no network: everything here derives plain-English review
 * content from an already-loaded decision_ledger row so it stays unit-testable.
 */

export interface ReviewableDecision extends ExecutiveDecisionRecord {
  organization_id?: string | null;
  decision_status?: string | null;
  execution_status?: string | null;
  chosen_action?: string | null;
  kpi_id?: string | null;
  decided_by?: string | null;
  decided_at?: string | null;
  execution_started_at?: string | null;
  execution_completed_at?: string | null;
  outcome_measured_at?: string | null;
  baseline_value?: number | null;
  actual_value?: number | null;
}

export type ReviewChecklistKey =
  | "evidence"
  | "confidence"
  | "risks"
  | "alternatives"
  | "responsibility";

export interface ReviewChecklistItem {
  key: ReviewChecklistKey;
  label: string;
  description: string;
}

/** The executive must actively confirm each item before Approve is enabled. */
export const EXECUTIVE_REVIEW_CHECKLIST: ReviewChecklistItem[] = [
  {
    key: "evidence",
    label: "Evidence reviewed",
    description: "I have read the supporting evidence for this recommendation.",
  },
  {
    key: "confidence",
    label: "Confidence reviewed",
    description: "I understand the confidence level and any confidence caps.",
  },
  {
    key: "risks",
    label: "Risks reviewed",
    description: "I have considered the risks and constraints of acting.",
  },
  {
    key: "alternatives",
    label: "Alternatives reviewed",
    description: "I have compared the recommended action against the alternatives.",
  },
  {
    key: "responsibility",
    label: "Governance responsibility accepted",
    description:
      "I accept that decision responsibility rests with my organization, not the platform.",
  },
];

export type ReviewChecklistState = Record<ReviewChecklistKey, boolean>;

export const emptyReviewChecklistState = (): ReviewChecklistState => ({
  evidence: false,
  confidence: false,
  risks: false,
  alternatives: false,
  responsibility: false,
});

export function isReviewChecklistComplete(state: ReviewChecklistState): boolean {
  return EXECUTIVE_REVIEW_CHECKLIST.every((item) => state[item.key]);
}

export type ExecutiveRiskLevel = "Low" | "Medium" | "High";

const confidenceOf = (decision: ReviewableDecision): number | null =>
  decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence ?? null;

/** Deterministic risk banding from decision-time signals (no model call). */
export function getExecutiveRiskLevel(decision: ReviewableDecision): ExecutiveRiskLevel {
  const confidence = confidenceOf(decision);
  const roi = decision.predicted_roi_probability;
  if (confidence == null || confidence < 50 || (roi != null && roi < 40)) return "High";
  if (confidence < 70 || (roi != null && roi < 60)) return "Medium";
  return "Low";
}

/** Count the distinct evidence signals attached to the decision's explanation. */
export function getEvidenceSignalCount(decision: ReviewableDecision): number {
  const metadata = (decision.explanation_metadata ?? null) as ExplanationMetadata | null;
  if (!metadata) return 0;
  const groups: unknown[] = [
    metadata.source_data,
    metadata.statistical_basis,
    metadata.triggering_insight,
    metadata.reasoning,
    metadata.expected_impact,
    metadata.dual_layer_enrichment,
  ];
  return groups.filter((group) => group != null && Object.keys(group as object).length > 0).length;
}

const TIMELINE_BY_TYPE: Record<string, string> = {
  strategic: "6–12 weeks",
  growth: "4–8 weeks",
  retention: "4–8 weeks",
  operational: "2–4 weeks",
  cost_optimization: "2–6 weeks",
  risk: "1–2 weeks",
};

/** Plain-English execution estimate derived from the decision type. */
export function getEstimatedExecutionTimeline(decision: ReviewableDecision): string {
  return TIMELINE_BY_TYPE[decision.decision_type ?? ""] ?? "2–6 weeks";
}

export const OUTCOME_REVIEW_WINDOW_DAYS = 30;

export function getFollowUpReviewDate(decision: ReviewableDecision): Date {
  const base = decision.decided_at ?? decision.created_at ?? new Date().toISOString();
  const date = new Date(base);
  date.setDate(date.getDate() + OUTCOME_REVIEW_WINDOW_DAYS);
  return date;
}

/**
 * AICIS-style plain-English narrative for the Executive Brief hero.
 * Wording is asserted by UX tests — keep the opening sentence stable.
 */
export function getExecutiveNarrative(decision: ReviewableDecision): string {
  const confidence = confidenceOf(decision);
  const confidenceSentence =
    confidence != null
      ? ` Confidence is ${Math.round(confidence)}% and the risk level is ${getExecutiveRiskLevel(decision).toLowerCase()}.`
      : "";
  return (
    "I analyzed available signals, evidence, risks, and projected impact. " +
    `The strongest decision requiring review is: ${decision.recommended_action || "review the pending recommendation"}.` +
    confidenceSentence
  );
}

export const formatEuro = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(Number(value))) return "Not quantified";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
};

export const formatPercent = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(Number(value))) return "Not available";
  return `${Number(value).toFixed(0)}%`;
};

export const DEMO_DECISION_ID = "demo-decision";

export const isDemoDecisionId = (id: string | null | undefined): boolean =>
  id === DEMO_DECISION_ID;

/**
 * Clearly-labelled sample decision for pilots with no live decision data.
 * Never persisted: every action taken on it is a local simulation.
 */
export const DEMO_DECISION: ReviewableDecision = {
  id: DEMO_DECISION_ID,
  organization_id: null,
  decision_type: "cost_optimization",
  recommended_action:
    "Renegotiate the top three supplier contracts before Q4 to reduce logistics cost exposure",
  chosen_action: null,
  decision_status: "pending",
  execution_status: "not_started",
  notes: "Demo decision — sample data for the executive review walkthrough.",
  source_insight_summary:
    "Logistics cost per order has risen 14% over the last two quarters while supplier concentration increased. Three contracts account for 62% of the exposed spend.",
  recommendation_logic_type: "rule_based",
  decision_origin: "demo",
  capped_confidence: 78,
  confidence_at_decision: 78,
  raw_confidence: 84,
  confidence_cap_reason: "Sample-size cap applied: two quarters of cost history available.",
  predicted_net_impact: 42000,
  predicted_roi_probability: 71,
  outcome_delta: null,
  created_at: new Date().toISOString(),
  decided_at: null,
  decided_by: null,
  kpi_id: null,
  explanation_metadata: {
    source_data: {
      dataset_name: "Demo operations dataset",
      time_range: "Last 2 quarters",
      rows_analyzed: 5842,
      key_metrics: ["logistics_cost_per_order", "supplier_concentration"],
    },
    statistical_basis: {
      method: "EWMA baseline deviation",
      z_score: 2.4,
      data_points_used: 180,
      note: "Cost per order deviated 2.4σ above its expected baseline.",
    },
    reasoning: {
      what_happened: "Logistics cost per order rose 14% across two consecutive quarters.",
      why_it_matters: "At current volumes this compounds to a six-figure annual exposure.",
      why_this_recommendation:
        "Renegotiating the three highest-exposure contracts addresses 62% of the increase without operational disruption.",
    },
    expected_impact: {
      range: "€30,000 – €55,000 annualized",
      basis: "Contract benchmark spread applied to exposed spend.",
    },
    assumptions: ["Supplier benchmark rates remain available in Q4."],
    limitations: ["Only two quarters of history; seasonal effects partially controlled."],
  },
};

/** Risks shown in the review flow; falls back to generic constraints when metadata is sparse. */
export function getReviewRisks(decision: ReviewableDecision): string[] {
  const metadata = (decision.explanation_metadata ?? null) as ExplanationMetadata | null;
  const risks: string[] = [];
  if (decision.confidence_cap_reason) {
    risks.push(`Confidence is capped: ${decision.confidence_cap_reason}`);
  }
  for (const limitation of metadata?.limitations ?? []) {
    risks.push(limitation);
  }
  for (const assumption of metadata?.assumptions ?? []) {
    risks.push(`Assumption: ${assumption}`);
  }
  if (risks.length === 0) {
    risks.push(
      "Execution risk: the recommendation depends on the supporting evidence being current.",
      "Timing risk: delaying the decision may erode the projected impact.",
    );
  }
  return risks;
}
