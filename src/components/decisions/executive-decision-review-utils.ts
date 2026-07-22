import { trustFromDecision } from "@/components/trust/trust-adapter";
import type { TrustStatus } from "@/components/trust/types";

export interface ExecutiveDecisionRecord {
  id: string;
  decision_type?: string | null;
  recommended_action?: string | null;
  notes?: string | null;
  source_insight_summary?: string | null;
  recommendation_logic_type?: string | null;
  decision_origin?: string | null;
  capped_confidence?: number | null;
  confidence_at_decision?: number | null;
  raw_confidence?: number | null;
  confidence_cap_reason?: string | null;
  predicted_net_impact?: number | null;
  predicted_roi_probability?: number | null;
  outcome_delta?: number | null;
  explanation_metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ApprovalChecklistItem {
  key: "evidence" | "quality" | "contradiction" | "confidence" | "approval";
  label: string;
  passed: boolean;
  blockingReason: string;
  readyText: string;
}

const normalizedConfidence = (decision: ExecutiveDecisionRecord) =>
  decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence ?? null;

const hasUnresolvedContradiction = (decision: ExecutiveDecisionRecord) => {
  const metadata = decision.explanation_metadata as Record<string, unknown> | null;
  const contradictionFlag =
    metadata?.has_unresolved_contradiction ??
    metadata?.unresolved_contradiction ??
    metadata?.contradiction_unresolved ??
    false;

  const contradictionList = metadata?.contradictions;
  return Boolean(contradictionFlag) || (Array.isArray(contradictionList) && contradictionList.length > 0);
};

const isVerified = (status: TrustStatus | null | undefined) => status === "verified";
const isUsableGovernance = (status: TrustStatus | null | undefined) =>
  status === "verified" || status === "partial";

export function getExecutiveApprovalChecklist(decision: ExecutiveDecisionRecord): ApprovalChecklistItem[] {
  const trust = trustFromDecision(decision);
  const confidence = normalizedConfidence(decision);

  return [
    {
      key: "evidence",
      label: "Verified supporting evidence",
      passed: isVerified(trust.evidenceStatus),
      blockingReason: "missing evidence: verified evidence must be linked before approval.",
      readyText: "Supporting evidence is linked and verified.",
    },
    {
      key: "quality",
      label: "Decision-grade evidence quality",
      passed: trust.evidenceStatus === "verified" && trust.sourceQuality !== "LOW_QUALITY",
      blockingReason: "weak evidence quality: sources are not yet decision-grade.",
      readyText: "Evidence quality is decision-grade for executive review.",
    },
    {
      key: "contradiction",
      label: "Contradictions resolved",
      passed: !hasUnresolvedContradiction(decision),
      blockingReason: "unresolved contradiction: conflicting signals must be resolved before approval.",
      readyText: "No unresolved contradiction is recorded for this recommendation.",
    },
    {
      key: "confidence",
      label: "Sufficient confidence",
      passed: confidence != null && confidence >= 70,
      blockingReason: "insufficient confidence: AICIS confidence must be at least 70% before approval.",
      readyText: "Confidence is within the executive approval threshold.",
    },
    {
      key: "approval",
      label: "Required governance approval",
      passed: isUsableGovernance(trust.governanceStatus),
      blockingReason: "missing required approval: governance status must be available before approval.",
      readyText: "Required governance approval path is present.",
    },
  ];
}

export function isExecutiveApprovalAllowed(decision: ExecutiveDecisionRecord): boolean {
  return getExecutiveApprovalChecklist(decision).every((item) => item.passed);
}

export function getExecutiveApprovalBlockReason(decision: ExecutiveDecisionRecord): string | null {
  return getExecutiveApprovalChecklist(decision).find((item) => !item.passed)?.blockingReason ?? null;
}

export function getExecutiveDecisionConfidence(decision: ExecutiveDecisionRecord): number | null {
  return normalizedConfidence(decision);
}
