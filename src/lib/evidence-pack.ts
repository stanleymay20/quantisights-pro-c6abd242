import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";
import { trustFromDecision } from "@/components/trust/trust-adapter";
import { getExecutiveApprovalChecklist } from "@/components/decisions/executive-decision-review-utils";
import {
  formatEuro,
  formatPercent,
  getEstimatedExecutionTimeline,
  getEvidenceSignalCount,
  getExecutiveRiskLevel,
  getReviewRisks,
} from "@/components/decisions/executive-review-flow";
import {
  EVIDENCE_PACK_SCHEMA_VERSION,
  type BuildEvidencePackOptions,
  type EvidencePack,
  type EvidencePackAuditEntry,
  type EvidencePackDecisionInput,
  type EvidencePackGovernanceItem,
  type EvidencePackPdfBlock,
  type EvidencePackPdfReadyModel,
  type EvidencePackSection,
  type EvidencePackSections,
  type EvidencePackTimelineStep,
} from "@/lib/evidence-pack-types";

/**
 * EP-1 — Enterprise Decision Evidence Pack builder.
 *
 * Pure, deterministic, presentation/export layer. Reads only the decision
 * record (and, if supplied, its audit log entries) that already exist in
 * Quantivis. Never fetches data itself, never calls a model, and never
 * fabricates a value that isn't already present on the source record.
 */

function section(input: {
  status: EvidencePackSection["status"];
  title: string;
  summary: string;
  source: string;
  generated_from: string[];
  data?: Record<string, unknown>;
}): EvidencePackSection {
  return { ...input, data: input.data ?? {} };
}

const UNKNOWN_ACTION = "an unspecified action";

function metadataOf(decision: EvidencePackDecisionInput): ExplanationMetadata | null {
  return (decision.explanation_metadata ?? null) as ExplanationMetadata | null;
}

function confidenceOf(decision: EvidencePackDecisionInput): number | null {
  return decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence ?? null;
}

function buildDecisionSummary(decision: EvidencePackDecisionInput): EvidencePackSection {
  const action = decision.recommended_action || UNKNOWN_ACTION;
  return section({
    status: "complete",
    title: "Decision Summary",
    summary: `Decision ${decision.id}: ${action}. Current status: ${decision.decision_status || "pending"}.`,
    source: "decision_ledger",
    generated_from: ["id", "recommended_action", "decision_status", "decision_type", "created_at"],
    data: {
      decision_id: decision.id,
      recommended_action: decision.recommended_action ?? null,
      decision_type: decision.decision_type ?? null,
      decision_status: decision.decision_status ?? "pending",
      execution_status: decision.execution_status ?? null,
      decision_origin: decision.decision_origin ?? null,
      created_at: decision.created_at ?? null,
    },
  });
}

function buildBusinessContext(decision: EvidencePackDecisionInput): EvidencePackSection {
  const context = decision.source_insight_summary || decision.notes || null;
  if (!context) {
    return section({
      status: "unavailable",
      title: "Business Context",
      summary: "No business context narrative is recorded for this decision.",
      source: "decision_ledger",
      generated_from: [],
    });
  }
  return section({
    status: "complete",
    title: "Business Context",
    summary: context,
    source: decision.source_insight_summary ? "decision_ledger.source_insight_summary" : "decision_ledger.notes",
    generated_from: [decision.source_insight_summary ? "source_insight_summary" : "notes"],
    data: { context },
  });
}

function buildDecisionRecommendation(decision: EvidencePackDecisionInput): EvidencePackSection {
  const metadata = metadataOf(decision);
  const justification = metadata?.reasoning?.why_this_recommendation ?? null;
  const generatedFrom = ["recommended_action"];
  if (decision.chosen_action) generatedFrom.push("chosen_action");
  if (justification) generatedFrom.push("explanation_metadata.reasoning.why_this_recommendation");
  return section({
    status: decision.recommended_action ? "complete" : "unavailable",
    title: "Decision Recommendation",
    summary: decision.recommended_action
      ? `Recommended action: ${decision.recommended_action}.`
      : "No recommended action is recorded on this decision.",
    source: "decision_ledger",
    generated_from: generatedFrom,
    data: {
      recommended_action: decision.recommended_action ?? null,
      chosen_action: decision.chosen_action ?? null,
      recommendation_logic_type: decision.recommendation_logic_type ?? null,
      justification,
    },
  });
}

function buildConfidence(decision: EvidencePackDecisionInput): EvidencePackSection {
  const confidence = confidenceOf(decision);
  if (confidence == null) {
    return section({
      status: "unavailable",
      title: "Confidence",
      summary: "No confidence score is recorded for this decision.",
      source: "decision_ledger",
      generated_from: [],
    });
  }
  const generatedFrom = [decision.capped_confidence != null ? "capped_confidence" : "confidence_at_decision"];
  if (decision.confidence_cap_reason) generatedFrom.push("confidence_cap_reason");
  return section({
    status: decision.confidence_cap_reason ? "partial" : "complete",
    title: "Confidence",
    summary: decision.confidence_cap_reason
      ? `Confidence is ${formatPercent(confidence)}, capped: ${decision.confidence_cap_reason}`
      : `Confidence is ${formatPercent(confidence)}.`,
    source: "decision_ledger",
    generated_from: generatedFrom,
    data: {
      confidence,
      raw_confidence: decision.raw_confidence ?? null,
      capped_confidence: decision.capped_confidence ?? null,
      confidence_cap_reason: decision.confidence_cap_reason ?? null,
    },
  });
}

function buildRiskAssessment(decision: EvidencePackDecisionInput): EvidencePackSection {
  const risk = getExecutiveRiskLevel(decision);
  const risks = getReviewRisks(decision);
  return section({
    status: "complete",
    title: "Risk Assessment",
    summary: `Risk level: ${risk}.`,
    source: "computed from decision_ledger confidence and predicted ROI fields",
    generated_from: ["capped_confidence", "confidence_at_decision", "raw_confidence", "predicted_roi_probability"],
    data: { risk_level: risk, risks },
  });
}

function buildBusinessImpact(decision: EvidencePackDecisionInput): EvidencePackSection {
  const hasImpact = decision.predicted_net_impact != null || decision.predicted_roi_probability != null;
  return section({
    status: hasImpact ? "complete" : "unavailable",
    title: "Business Impact",
    summary: hasImpact
      ? `Expected impact: ${formatEuro(decision.predicted_net_impact)}, ${formatPercent(decision.predicted_roi_probability)} probability of positive ROI.`
      : "No predicted business impact is recorded for this decision.",
    source: "decision_ledger",
    generated_from: hasImpact ? ["predicted_net_impact", "predicted_roi_probability"] : [],
    data: {
      predicted_net_impact: decision.predicted_net_impact ?? null,
      predicted_roi_probability: decision.predicted_roi_probability ?? null,
      outcome_delta: decision.outcome_delta ?? null,
    },
  });
}

function buildEvidenceSummary(decision: EvidencePackDecisionInput): EvidencePackSection {
  const trust = trustFromDecision(decision, decision.organization_id ?? null);
  const evidenceCount = getEvidenceSignalCount(decision);
  const status: EvidencePackSection["status"] =
    trust.evidenceStatus === "verified" ? "complete" : evidenceCount > 0 ? "partial" : "unavailable";
  return section({
    status,
    title: "Evidence Summary",
    summary:
      evidenceCount > 0
        ? `${evidenceCount} evidence signal${evidenceCount === 1 ? "" : "s"} linked. Evidence status: ${trust.evidenceStatus ?? "not available"}.`
        : "No structured evidence signals are linked to this decision.",
    source: "decision_ledger.explanation_metadata",
    generated_from: evidenceCount > 0 ? ["explanation_metadata"] : [],
    data: {
      evidence_signal_count: evidenceCount,
      evidence_status: trust.evidenceStatus ?? null,
      source_quality: trust.sourceQuality ?? null,
    },
  });
}

function buildVerifiedFacts(decision: EvidencePackDecisionInput): EvidencePackSection {
  const factRef = decision.linked_aicis_prediction_id ?? null;
  if (!factRef) {
    return section({
      status: "unavailable",
      title: "Verified Facts",
      summary: "No verified fact reference is recorded on this decision.",
      source: "decision_ledger",
      generated_from: [],
    });
  }
  return section({
    status: "partial",
    title: "Verified Facts",
    summary: `A linked AICIS prediction reference (${factRef}) is recorded, but its full verified-fact record is outside this decision snapshot.`,
    source: "decision_ledger.linked_aicis_prediction_id",
    generated_from: ["linked_aicis_prediction_id"],
    data: { linked_aicis_prediction_id: factRef },
  });
}

function buildSupportingSignals(decision: EvidencePackDecisionInput): EvidencePackSection {
  const metadata = metadataOf(decision);
  const metrics = metadata?.source_data?.key_metrics ?? [];
  const hasSignal = Boolean(metadata?.source_data || metadata?.triggering_insight);
  if (!hasSignal) {
    return section({
      status: "unavailable",
      title: "Supporting Signals",
      summary: "No supporting signal data is recorded for this decision.",
      source: "decision_ledger.explanation_metadata",
      generated_from: [],
    });
  }
  return section({
    status: "complete",
    title: "Supporting Signals",
    summary: metadata?.triggering_insight?.description
      ? metadata.triggering_insight.description
      : `Signals recorded across ${metrics.length || "an unspecified number of"} metric(s).`,
    source: "decision_ledger.explanation_metadata",
    generated_from: ["explanation_metadata.source_data", "explanation_metadata.triggering_insight"],
    data: {
      dataset_name: metadata?.source_data?.dataset_name ?? null,
      time_range: metadata?.source_data?.time_range ?? null,
      rows_analyzed: metadata?.source_data?.rows_analyzed ?? null,
      key_metrics: metrics,
      triggering_insight: metadata?.triggering_insight ?? null,
    },
  });
}

function hasUnresolvedContradiction(metadata: ExplanationMetadata | null): boolean {
  const raw = metadata as unknown as Record<string, unknown> | null;
  const flag =
    raw?.has_unresolved_contradiction ?? raw?.unresolved_contradiction ?? raw?.contradiction_unresolved ?? false;
  const list = raw?.contradictions;
  return Boolean(flag) || (Array.isArray(list) && list.length > 0);
}

function buildContradictions(decision: EvidencePackDecisionInput): EvidencePackSection {
  const metadata = metadataOf(decision);
  const raw = metadata as unknown as Record<string, unknown> | null;
  const list = Array.isArray(raw?.contradictions) ? (raw?.contradictions as unknown[]) : [];
  const unresolved = hasUnresolvedContradiction(metadata);
  return section({
    status: unresolved ? "partial" : list.length > 0 ? "complete" : "not_applicable",
    title: "Contradictions",
    summary: unresolved
      ? "An unresolved contradiction is recorded against this decision's evidence."
      : list.length > 0
        ? `${list.length} contradiction record(s) resolved.`
        : "No contradictions are recorded for this decision.",
    source: "decision_ledger.explanation_metadata",
    generated_from: list.length > 0 ? ["explanation_metadata.contradictions"] : [],
    data: { unresolved_contradiction: unresolved, contradiction_count: list.length },
  });
}

function buildAlternativesConsidered(): EvidencePackSection {
  // decision_ledger stores only the recommended (and, if changed, chosen) action —
  // no discrete alternative-action records exist to package here.
  return section({
    status: "not_applicable",
    title: "Alternatives Considered",
    summary:
      "Quantivis does not currently persist discrete alternative-action records for this decision; only the recommended action is retained.",
    source: "not_applicable",
    generated_from: [],
  });
}

function toGovernanceItems(decision: EvidencePackDecisionInput): EvidencePackGovernanceItem[] {
  return getExecutiveApprovalChecklist(decision).map((item) => ({
    key: item.key,
    label: item.label,
    passed: item.passed,
    detail: item.passed ? item.readyText : item.blockingReason,
  }));
}

function buildGovernanceChecklist(decision: EvidencePackDecisionInput): EvidencePackSection {
  const items = toGovernanceItems(decision);
  const allPassed = items.every((item) => item.passed);
  return section({
    status: allPassed ? "complete" : "partial",
    title: "Governance Checklist",
    summary: allPassed
      ? "All governance checklist items are satisfied."
      : `${items.filter((item) => !item.passed).length} governance checklist item(s) are not satisfied.`,
    source: "computed from decision_ledger evidence, confidence, and governance fields",
    generated_from: ["explanation_metadata", "capped_confidence", "confidence_at_decision"],
    data: { items: items as unknown as Record<string, unknown>[] },
  });
}

function buildApprovalInformation(decision: EvidencePackDecisionInput): EvidencePackSection {
  const status = decision.decision_status ?? "pending";
  const isFinal = status === "approved" || status === "rejected";
  return section({
    status: isFinal ? "complete" : "partial",
    title: "Approval Information",
    summary: isFinal
      ? `This decision was ${status}${decision.decided_at ? ` on ${decision.decided_at}` : ""}.`
      : "This decision has not yet been approved or rejected.",
    source: "decision_ledger",
    generated_from: ["decision_status", "decided_by", "decided_at"],
    data: {
      decision_status: status,
      decided_by: decision.decided_by ?? null,
      decided_at: decision.decided_at ?? null,
      notes: decision.notes ?? null,
    },
  });
}

function buildAuditTrail(auditEntries: EvidencePackAuditEntry[]): EvidencePackSection {
  if (auditEntries.length === 0) {
    return section({
      status: "unavailable",
      title: "Audit Trail",
      summary: "No audit log entries were supplied for this decision.",
      source: "audit_log",
      generated_from: [],
    });
  }
  const sorted = [...auditEntries].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  return section({
    status: "complete",
    title: "Audit Trail",
    summary: `${sorted.length} audit log entr${sorted.length === 1 ? "y" : "ies"} recorded for this decision.`,
    source: "audit_log",
    generated_from: ["audit_log.action_type", "audit_log.actor_id", "audit_log.created_at"],
    data: { entries: sorted as unknown as Record<string, unknown>[] },
  });
}

/** decision_ledger carries no AG-3 execution linkage — always reported honestly as not linked. */
function buildRuntimeMetadata(decision: EvidencePackDecisionInput): EvidencePackSection {
  const raw = decision as unknown as Record<string, unknown>;
  const executionId = typeof raw.runtime_execution_id === "string" ? raw.runtime_execution_id : null;
  if (!executionId) {
    return section({
      status: "not_applicable",
      title: "Runtime Metadata",
      summary: "This decision is not linked to a runtime execution record.",
      source: "not_applicable",
      generated_from: [],
    });
  }
  return section({
    status: "partial",
    title: "Runtime Metadata",
    summary: `Linked runtime execution: ${executionId}.`,
    source: "decision_ledger.runtime_execution_id",
    generated_from: ["runtime_execution_id"],
    data: { runtime_execution_id: executionId },
  });
}

/** decision_ledger carries no AG-2 gateway linkage — always reported honestly as not linked. */
function buildGatewayMetadata(decision: EvidencePackDecisionInput): EvidencePackSection {
  const raw = decision as unknown as Record<string, unknown>;
  const gatewayDecisionId = typeof raw.gateway_decision_id === "string" ? raw.gateway_decision_id : null;
  if (!gatewayDecisionId) {
    return section({
      status: "not_applicable",
      title: "Gateway Metadata",
      summary: "This decision is not linked to an Agent Gateway decision record.",
      source: "not_applicable",
      generated_from: [],
    });
  }
  return section({
    status: "partial",
    title: "Gateway Metadata",
    summary: `Linked Agent Gateway decision: ${gatewayDecisionId}.`,
    source: "decision_ledger.gateway_decision_id",
    generated_from: ["gateway_decision_id"],
    data: { gateway_decision_id: gatewayDecisionId },
  });
}

const TIMELINE_STEP_DEFS: Array<{ key: string; label: string }> = [
  { key: "signal_received", label: "Signal Received" },
  { key: "evidence_verified", label: "Evidence Verified" },
  { key: "fact_promoted", label: "Fact Promoted" },
  { key: "decision_candidate", label: "Decision Candidate" },
  { key: "agent_gateway", label: "Agent Gateway" },
  { key: "runtime_gateway", label: "Runtime Gateway" },
  { key: "executive_review", label: "Executive Review" },
  { key: "approved", label: "Approved" },
  { key: "outcome_prediction", label: "Outcome Prediction" },
];

function buildTimelineSteps(
  decision: EvidencePackDecisionInput,
  runtimeSection: EvidencePackSection,
  gatewaySection: EvidencePackSection,
): EvidencePackTimelineStep[] {
  const metadata = metadataOf(decision);
  const trust = trustFromDecision(decision, decision.organization_id ?? null);
  const status = decision.decision_status ?? "pending";

  const steps: Record<string, EvidencePackTimelineStep> = {
    signal_received: {
      key: "signal_received",
      label: "Signal Received",
      status: metadata?.source_data ? "recorded" : "not_recorded",
      timestamp: metadata?.source_data ? decision.created_at ?? null : null,
      detail: metadata?.source_data
        ? "A source signal is recorded in this decision's explanation metadata."
        : "No source signal is recorded on this decision.",
      source: "decision_ledger.explanation_metadata.source_data",
    },
    evidence_verified: {
      key: "evidence_verified",
      label: "Evidence Verified",
      status: trust.evidenceStatus === "verified" ? "recorded" : "not_recorded",
      timestamp: trust.evidenceStatus === "verified" ? decision.created_at ?? null : null,
      detail:
        trust.evidenceStatus === "verified"
          ? "Evidence for this decision is marked verified."
          : "Evidence verification is not recorded for this decision.",
      source: "decision_ledger (trust adapter: evidenceStatus)",
    },
    fact_promoted: {
      key: "fact_promoted",
      label: "Fact Promoted",
      status: "not_recorded",
      timestamp: null,
      detail: "decision_ledger does not store a link to an enterprise_verified_fact record.",
      source: "not_linked",
    },
    decision_candidate: {
      key: "decision_candidate",
      label: "Decision Candidate",
      status: "recorded",
      timestamp: decision.created_at ?? null,
      detail: "This decision_ledger row is the decision candidate.",
      source: "decision_ledger.created_at",
    },
    agent_gateway: {
      key: "agent_gateway",
      label: "Agent Gateway",
      status: runtimeGatewaySectionStatus(gatewaySection),
      timestamp: null,
      detail: gatewaySection.summary,
      source: gatewaySection.source,
    },
    runtime_gateway: {
      key: "runtime_gateway",
      label: "Runtime Gateway",
      status: runtimeGatewaySectionStatus(runtimeSection),
      timestamp: null,
      detail: runtimeSection.summary,
      source: runtimeSection.source,
    },
    executive_review: {
      key: "executive_review",
      label: "Executive Review",
      status: status === "approved" || status === "rejected" ? "recorded" : "pending",
      timestamp: status === "approved" || status === "rejected" ? decision.decided_at ?? null : null,
      detail:
        status === "approved" || status === "rejected"
          ? `This decision was reviewed and ${status}.`
          : "This decision is awaiting executive review.",
      source: "decision_ledger.decision_status",
    },
    approved: {
      key: "approved",
      label: "Approved",
      status: status === "approved" ? "recorded" : status === "rejected" ? "not_recorded" : "pending",
      timestamp: status === "approved" ? decision.decided_at ?? null : null,
      detail:
        status === "approved"
          ? "This decision was approved."
          : status === "rejected"
            ? "This decision was rejected, not approved."
            : "This decision has not yet been approved.",
      source: "decision_ledger.decision_status",
    },
    outcome_prediction: {
      key: "outcome_prediction",
      label: "Outcome Prediction",
      status:
        decision.predicted_net_impact != null || decision.predicted_roi_probability != null
          ? "recorded"
          : "not_recorded",
      timestamp: decision.created_at ?? null,
      detail:
        decision.predicted_net_impact != null || decision.predicted_roi_probability != null
          ? decision.outcome_measured_at
            ? `An outcome prediction was made and the actual outcome was measured on ${decision.outcome_measured_at}.`
            : "An outcome prediction was made at decision time; measurement is pending."
          : "No outcome prediction is recorded for this decision.",
      source: "decision_ledger.predicted_net_impact / predicted_roi_probability",
    },
  };

  return TIMELINE_STEP_DEFS.map((def) => steps[def.key]);
}

function runtimeGatewaySectionStatus(sectionResult: EvidencePackSection): EvidencePackTimelineStep["status"] {
  return sectionResult.status === "not_applicable" ? "not_recorded" : "recorded";
}

function buildDecisionTimeline(steps: EvidencePackTimelineStep[]): EvidencePackSection {
  const recordedCount = steps.filter((step) => step.status === "recorded").length;
  return section({
    status: recordedCount === steps.length ? "complete" : recordedCount > 0 ? "partial" : "unavailable",
    title: "Decision Timeline",
    summary: `${recordedCount} of ${steps.length} lifecycle stages are recorded for this decision.`,
    source: "derived from decision_ledger and, where available, linked gateway/runtime references",
    generated_from: steps.filter((step) => step.status === "recorded").map((step) => step.key),
    data: { steps: steps as unknown as Record<string, unknown>[] },
  });
}

function buildOutcomePrediction(decision: EvidencePackDecisionInput): EvidencePackSection {
  const hasPrediction = decision.predicted_net_impact != null || decision.predicted_roi_probability != null;
  const measured = decision.outcome_measured_at != null;
  return section({
    status: !hasPrediction ? "unavailable" : measured ? "complete" : "partial",
    title: "Outcome Prediction",
    summary: !hasPrediction
      ? "No outcome prediction is recorded for this decision."
      : measured
        ? `Outcome measured on ${decision.outcome_measured_at}. Measured delta: ${formatEuro(decision.outcome_delta)}.`
        : `Projected outcome: ${formatEuro(decision.predicted_net_impact)}, ${formatPercent(decision.predicted_roi_probability)} probability of positive ROI. Not yet measured.`,
    source: "decision_ledger",
    generated_from: hasPrediction
      ? ["predicted_net_impact", "predicted_roi_probability", "outcome_delta", "outcome_measured_at"]
      : [],
    data: {
      predicted_net_impact: decision.predicted_net_impact ?? null,
      predicted_roi_probability: decision.predicted_roi_probability ?? null,
      outcome_delta: decision.outcome_delta ?? null,
      outcome_measured_at: decision.outcome_measured_at ?? null,
      prediction_accuracy_score: decision.prediction_accuracy_score ?? null,
      calibration_error: decision.calibration_error ?? null,
      estimated_execution_timeline: getEstimatedExecutionTimeline(decision),
    },
  });
}

function buildDigitalSignaturePlaceholder(): EvidencePackSection {
  return section({
    status: "not_applicable",
    title: "Digital Signature",
    summary:
      "Digital signing is not yet implemented. This section is a placeholder for a future cryptographic signature over evidence_pack_hash.",
    source: "not_applicable",
    generated_from: [],
    data: { algorithm: null, signature: null, signed_by: null, signed_at: null },
  });
}

/**
 * Deterministic canonical-JSON FNV-1a hash, self-contained to keep this
 * presentation/export module fully decoupled from AG-3 persistence internals.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const sorted: Record<string, unknown> = {};
    for (const [key, entry] of entries) sorted[key] = canonicalize(entry);
    return sorted;
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  const input = JSON.stringify(canonicalize(value));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Build one deterministic Evidence Pack from a decision_ledger row (and,
 * optionally, its pre-fetched audit log entries). Given the same inputs and
 * the same injected clock, this always returns byte-identical content and
 * an identical evidence_pack_hash.
 */
export function buildEvidencePack(
  decision: EvidencePackDecisionInput,
  options: BuildEvidencePackOptions = {},
): EvidencePack {
  const now = options.now ?? (() => new Date().toISOString());
  const auditEntries = options.auditEntries ?? [];
  const isSimulation = options.isSimulation ?? decision.decision_origin === "demo";

  const runtime_metadata = buildRuntimeMetadata(decision);
  const gateway_metadata = buildGatewayMetadata(decision);
  const timelineSteps = buildTimelineSteps(decision, runtime_metadata, gateway_metadata);

  const sectionsWithoutHash: Omit<EvidencePackSections, "hashes" | "digital_signature"> = {
    decision_summary: buildDecisionSummary(decision),
    business_context: buildBusinessContext(decision),
    decision_recommendation: buildDecisionRecommendation(decision),
    confidence: buildConfidence(decision),
    risk_assessment: buildRiskAssessment(decision),
    business_impact: buildBusinessImpact(decision),
    evidence_summary: buildEvidenceSummary(decision),
    verified_facts: buildVerifiedFacts(decision),
    supporting_signals: buildSupportingSignals(decision),
    contradictions: buildContradictions(decision),
    alternatives_considered: buildAlternativesConsidered(),
    governance_checklist: buildGovernanceChecklist(decision),
    approval_information: buildApprovalInformation(decision),
    audit_trail: buildAuditTrail(auditEntries),
    runtime_metadata,
    gateway_metadata,
    decision_timeline: buildDecisionTimeline(timelineSteps),
    outcome_prediction: buildOutcomePrediction(decision),
  };

  const hashInput = {
    schema_version: EVIDENCE_PACK_SCHEMA_VERSION,
    decision_id: decision.id,
    organization_id: decision.organization_id ?? null,
    is_simulation: isSimulation,
    sections: sectionsWithoutHash,
  };
  const evidence_pack_hash = canonicalHash(hashInput);

  const hashes = section({
    status: "complete",
    title: "Hashes",
    summary: `Evidence pack hash: ${evidence_pack_hash}.`,
    source: "computed from all Evidence Pack sections (canonical JSON, FNV-1a)",
    generated_from: Object.keys(sectionsWithoutHash),
    data: { evidence_pack_hash, algorithm: "fnv1a-canonical-json" },
  });

  const sections: EvidencePackSections = {
    ...sectionsWithoutHash,
    hashes,
    digital_signature: buildDigitalSignaturePlaceholder(),
  };

  return {
    schema_version: EVIDENCE_PACK_SCHEMA_VERSION,
    decision_id: decision.id,
    organization_id: decision.organization_id ?? null,
    generated_at: now(),
    is_simulation: isSimulation,
    sections,
    evidence_pack_hash,
  };
}

/** Deterministic JSON export. */
export function evidencePackToJSON(pack: EvidencePack): string {
  return JSON.stringify(pack, null, 2);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const HTML_SECTION_ORDER: Array<keyof EvidencePackSections> = [
  "decision_summary",
  "business_context",
  "decision_recommendation",
  "confidence",
  "risk_assessment",
  "business_impact",
  "evidence_summary",
  "verified_facts",
  "supporting_signals",
  "contradictions",
  "alternatives_considered",
  "governance_checklist",
  "approval_information",
  "audit_trail",
  "runtime_metadata",
  "gateway_metadata",
  "decision_timeline",
  "outcome_prediction",
  "hashes",
  "digital_signature",
];

/** Deterministic, self-contained printable HTML export (no external assets). */
export function evidencePackToHtml(pack: EvidencePack): string {
  const sectionsHtml = HTML_SECTION_ORDER.map((key) => {
    const s = pack.sections[key];
    return [
      `<section class="ep-section" data-status="${escapeHtml(s.status)}">`,
      `<h2>${escapeHtml(s.title)}</h2>`,
      `<p class="ep-status">Status: ${escapeHtml(s.status)}</p>`,
      `<p class="ep-summary">${escapeHtml(s.summary)}</p>`,
      `<p class="ep-source">Source: ${escapeHtml(s.source)}</p>`,
      `</section>`,
    ].join("");
  }).join("");

  return [
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    `<title>Evidence Pack — ${escapeHtml(pack.decision_id)}</title>`,
    "</head><body>",
    `<h1>Enterprise Decision Evidence Pack</h1>`,
    `<p class="ep-meta">Decision: ${escapeHtml(pack.decision_id)} · Generated: ${escapeHtml(pack.generated_at)} · Hash: ${escapeHtml(pack.evidence_pack_hash)}${pack.is_simulation ? " · SIMULATION" : ""}</p>`,
    sectionsHtml,
    "</body></html>",
  ].join("");
}

/** Structured, PDF-ready data model. No PDF is generated in EP-1. */
export function evidencePackToPdfModel(pack: EvidencePack): EvidencePackPdfReadyModel {
  const blocks: EvidencePackPdfBlock[] = [
    { type: "heading", level: 1, text: "Enterprise Decision Evidence Pack" },
    {
      type: "key_values",
      items: [
        { label: "Decision ID", value: pack.decision_id },
        { label: "Generated at", value: pack.generated_at },
        { label: "Evidence pack hash", value: pack.evidence_pack_hash },
        { label: "Simulation", value: pack.is_simulation ? "Yes — not persisted" : "No" },
      ],
    },
  ];

  for (const key of HTML_SECTION_ORDER) {
    const s = pack.sections[key];
    blocks.push({ type: "heading", level: 2, text: s.title });
    blocks.push({ type: "status_line", status: s.status, text: `Status: ${s.status}` });
    blocks.push({ type: "paragraph", text: s.summary });
    if (key === "decision_timeline") {
      const steps = (s.data.steps as unknown as EvidencePackTimelineStep[] | undefined) ?? [];
      blocks.push({ type: "timeline", steps });
    }
    if (key === "governance_checklist") {
      const items = (s.data.items as unknown as EvidencePackGovernanceItem[] | undefined) ?? [];
      blocks.push({ type: "list", items: items.map((item) => `${item.passed ? "✓" : "✗"} ${item.label}: ${item.detail}`) });
    }
  }

  return {
    schema_version: EVIDENCE_PACK_SCHEMA_VERSION,
    decision_id: pack.decision_id,
    evidence_pack_hash: pack.evidence_pack_hash,
    blocks,
  };
}
