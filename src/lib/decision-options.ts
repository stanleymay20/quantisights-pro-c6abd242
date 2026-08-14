import type { TraceabilityRecord } from "@/lib/evidence-contract";

export type DecisionOptionKind = "recommended" | "accelerate" | "staged" | "hold";
export type OptionModelStatus = "modeled" | "derived" | "unmodeled";

export interface DecisionOptionModel {
  id: DecisionOptionKind;
  title: string;
  action: string;
  rationale: string;
  impact: {
    status: OptionModelStatus;
    value: number | null;
    label: string;
  };
  confidence: {
    status: OptionModelStatus;
    value: number | null;
    label: string;
  };
  assumptions: string[];
  risks: string[];
  evidenceStatus: "verified" | "partial" | "unverified";
  evidenceLabel: string;
  isRecommended: boolean;
}

export interface DecisionOptionInput {
  recommendedAction: string;
  predictedNetImpact?: number | null;
  predictedImpactStatus?: OptionModelStatus;
  predictedImpactLabel?: string | null;
  confidence?: number | null;
  assumptions?: string[];
  riskIfWrong?: string | null;
  traceability?: TraceabilityRecord | null;
  /** Human-readable delay exposure already produced by the guarded CoD model. */
  costOfDelayLabel?: string | null;
}

export interface ExecutiveDecisionTraceabilityInput {
  id: string;
  explanationMetadata?: unknown;
}

export interface ExecutiveDecisionImpactInput {
  predictedNetImpact?: number | null;
  decisionSimulationId?: string | null;
  explanationMetadata?: unknown;
}

export interface ExecutiveImpactClassification {
  status: OptionModelStatus;
  value: number | null;
  label: string;
  basis: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Adapt the existing decision_ledger explanation metadata into the same strict
 * provenance contract used by the evidence gate. This adapter never promotes a
 * decision to verified by itself: dataset id, original source id and observed
 * rows must all already exist in persisted metadata.
 */
export function traceabilityFromExecutiveDecision(input: ExecutiveDecisionTraceabilityInput): TraceabilityRecord {
  const metadata = asRecord(input.explanationMetadata);
  const sourceData = asRecord(metadata.source_data);
  const source = asRecord(metadata.source);
  const datasetId = stringOrNull(sourceData.dataset_id);
  const sourceEntityId = stringOrNull(source.id);
  const rows = numberOrZero(sourceData.rows_analyzed);
  const datasetName = stringOrNull(sourceData.dataset_name);
  const keyMetrics = stringArray(sourceData.key_metrics);
  const limitations = stringArray(metadata.limitations);
  const evidenceClassification = stringOrNull(metadata.evidence_classification);
  const generatedAt = stringOrNull(source.created_at) ?? "";
  const isVerifiedSource = Boolean(datasetId && sourceEntityId && rows > 0);

  const missing: string[] = [];
  if (!datasetId) missing.push("Source dataset could not be resolved");
  if (!sourceEntityId) missing.push("Original source entity could not be resolved");
  if (rows <= 0) missing.push("No observed rows are traceable to this decision");

  return {
    sourceDataset: datasetName ?? datasetId ?? "Unverified source",
    sourceDatasetId: datasetId,
    sourceEntityId,
    isVerifiedSource,
    dataRowsUsed: rows,
    metricTransformationPath: keyMetrics.length > 0
      ? `source data → ${keyMetrics.join(", ")} → executive decision`
      : "source data → executive decision",
    modelOrHeuristic: evidenceClassification ?? "Persisted decision evidence",
    generatedAt,
    limitations: [...new Set([...limitations, ...missing])],
  };
}

/**
 * Classify a persisted financial-impact number without upgrading a heuristic
 * estimate into a model result. A linked decision simulation is the explicit
 * signal that the number is modeled. Legacy rule/severity estimates remain
 * visible only as derived/heuristic values.
 */
export function classifyExecutiveDecisionImpact(input: ExecutiveDecisionImpactInput): ExecutiveImpactClassification {
  const value = typeof input.predictedNetImpact === "number" && Number.isFinite(input.predictedNetImpact)
    ? input.predictedNetImpact
    : null;
  const metadata = asRecord(input.explanationMetadata);
  const expectedImpact = asRecord(metadata.expected_impact);
  const basis = stringOrNull(expectedImpact.basis);

  if (value === null) {
    return {
      status: "unmodeled",
      value: null,
      label: "Not quantified — no evidence-backed monetary impact model",
      basis,
    };
  }

  if (input.decisionSimulationId) {
    return {
      status: "modeled",
      value,
      label: "Modeled by linked decision simulation",
      basis,
    };
  }

  const normalizedBasis = basis?.toLowerCase() ?? "";
  const explicitlyHeuristic = /(severity|rule|heuristic|estimate|assumption)/.test(normalizedBasis);

  return {
    status: "derived",
    value,
    label: explicitlyHeuristic
      ? `Heuristic/derived estimate${basis ? ` — ${basis}` : ""}`
      : "Derived estimate — no linked decision simulation",
    basis,
  };
}

function evidenceStatus(traceability: TraceabilityRecord | null | undefined): Pick<DecisionOptionModel, "evidenceStatus" | "evidenceLabel"> {
  if (traceability?.isVerifiedSource) {
    return {
      evidenceStatus: "verified",
      evidenceLabel: `Verified source · ${traceability.dataRowsUsed} rows`,
    };
  }
  if (traceability?.sourceDatasetId || traceability?.sourceEntityId || traceability?.dataRowsUsed) {
    return {
      evidenceStatus: "partial",
      evidenceLabel: "Partial provenance — not decision-grade on its own",
    };
  }
  return {
    evidenceStatus: "unverified",
    evidenceLabel: "No verified source model for this option",
  };
}

function modeledImpact(
  value: number | null | undefined,
  status: OptionModelStatus = "modeled",
  label?: string | null,
): DecisionOptionModel["impact"] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      status,
      value,
      label: label ?? (status === "modeled" ? "Modeled expected impact" : "Derived impact estimate"),
    };
  }
  return {
    status: "unmodeled",
    value: null,
    label: label ?? "Unmodeled — no independent impact estimate",
  };
}

function modeledConfidence(value: number | null | undefined): DecisionOptionModel["confidence"] {
  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      status: "modeled",
      value: Math.max(0, Math.min(100, value)),
      label: "Inherited from the recommended decision model",
    };
  }
  return {
    status: "unmodeled",
    value: null,
    label: "Unmodeled — no independent confidence estimate",
  };
}

/**
 * Build an executive A/B/hold comparison without inventing model outputs.
 *
 * Only the recommended option may inherit the decision's measured/model-derived
 * impact and confidence. Alternative actions remain explicitly unmodeled until
 * an independent simulation or evidence-backed model exists for that option.
 */
export function buildDecisionOptions(input: DecisionOptionInput): DecisionOptionModel[] {
  const source = evidenceStatus(input.traceability);
  const baseAssumptions = input.assumptions?.length
    ? input.assumptions
    : ["The current evidence remains valid through the execution window"];
  const baseRisk = input.riskIfWrong?.trim()
    ? [input.riskIfWrong.trim()]
    : ["The recommended action may not produce the expected outcome"];

  const recommended: DecisionOptionModel = {
    id: "recommended",
    title: "Recommended action",
    action: input.recommendedAction,
    rationale: "Uses the currently supported decision model and evidence chain.",
    impact: modeledImpact(input.predictedNetImpact, input.predictedImpactStatus, input.predictedImpactLabel),
    confidence: modeledConfidence(input.confidence),
    assumptions: baseAssumptions,
    risks: baseRisk,
    evidenceStatus: source.evidenceStatus,
    evidenceLabel: source.evidenceLabel,
    isRecommended: true,
  };

  const accelerate: DecisionOptionModel = {
    id: "accelerate",
    title: "Accelerate execution",
    action: `Execute the recommended direction faster: ${input.recommendedAction}`,
    rationale: "Prioritizes speed, but no independent model has quantified the incremental benefit or execution risk of acceleration.",
    impact: { status: "unmodeled", value: null, label: "Unmodeled — acceleration has not been simulated" },
    confidence: { status: "unmodeled", value: null, label: "Unmodeled — do not reuse recommendation confidence" },
    assumptions: [
      "Execution capacity can absorb an accelerated timetable",
      "Faster execution does not introduce material operational or governance risk",
    ],
    risks: [
      "Higher execution risk from reduced validation and coordination time",
      "No independent evidence proves acceleration improves the expected outcome",
    ],
    evidenceStatus: "unverified",
    evidenceLabel: "Requires independent simulation or execution evidence",
    isRecommended: false,
  };

  const staged: DecisionOptionModel = {
    id: "staged",
    title: "Stage the rollout",
    action: `Pilot or phase the recommended direction before full deployment: ${input.recommendedAction}`,
    rationale: "Reduces irreversible exposure and creates an opportunity to measure response before scaling.",
    impact: { status: "unmodeled", value: null, label: "Unmodeled — staged impact has not been simulated" },
    confidence: { status: "unmodeled", value: null, label: "Unmodeled — pilot evidence required" },
    assumptions: [
      "A representative pilot population or business unit can be isolated",
      "Pilot measurements can be compared with a credible baseline or control",
    ],
    risks: [
      "A pilot may understate or overstate effects at full scale",
      "Staging delays realization of any true benefit",
    ],
    evidenceStatus: "partial",
    evidenceLabel: "Evidence can be created through a measured pilot",
    isRecommended: false,
  };

  const delayLabel = input.costOfDelayLabel?.trim();
  const hold: DecisionOptionModel = {
    id: "hold",
    title: "Hold / no action",
    action: "Do not execute a new intervention yet; continue monitoring and collect additional evidence.",
    rationale: "Preserves optionality when evidence is insufficient, but exposes the organization to the measured or qualitative cost of delay.",
    impact: delayLabel
      ? { status: "derived", value: null, label: `Delay exposure: ${delayLabel}` }
      : { status: "unmodeled", value: null, label: "Unmodeled — no validated cost-of-delay basis" },
    confidence: { status: "unmodeled", value: null, label: "Not applicable — this is a monitoring posture, not a forecast" },
    assumptions: [
      "The organization can tolerate additional observation time",
      "The monitored condition will not cross an unacceptable risk threshold before review",
    ],
    risks: [
      delayLabel
        ? `Known/derived delay exposure remains active: ${delayLabel}`
        : "Delay exposure is not financially modeled and could be material",
      "Waiting may allow a true negative trend or risk condition to compound",
    ],
    evidenceStatus: delayLabel ? "partial" : "unverified",
    evidenceLabel: delayLabel ? "Uses guarded cost-of-delay output only" : "No validated impact model for inaction",
    isRecommended: false,
  };

  return [recommended, accelerate, staged, hold];
}
