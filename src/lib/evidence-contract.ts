/**
 * Evidence Contract — Enterprise Decision Intelligence Foundation.
 *
 * Every insight, advisory, or recommendation MUST carry an evidence block.
 * If a decision-critical prerequisite is missing, presentation quality cannot
 * compensate for it: the recommendation is automatically downgraded.
 *
 * This is the single source of truth for decision output integrity.
 */

export interface EvidenceBlock {
  /** What was observed in the data */
  observation: string;
  /** Specific data points, metric values, or signals supporting this */
  evidence: string[];
  /** The reasoning chain from evidence to conclusion */
  reasoning: string;
  /** What the confidence score is based on */
  confidenceBasis: ConfidenceBasis;
  /** Verified provenance for the observation and evidence */
  traceability: TraceabilityRecord;
  /** Assumptions made in reaching this conclusion */
  assumptions: string[];
  /** Known limitations of this analysis */
  limitations: string[];
  /** Specific recommended action */
  recommendation: string;
  /** Expected impact if action is taken */
  expectedImpact: string;
  /** What happens if the recommendation is wrong */
  riskIfWrong: string;
}

export interface ConfidenceBasis {
  /** Number of data points used */
  sampleSize: number;
  /** Percentage of expected data dimensions present */
  dataCoverage: number;
  /** Coefficient of variation (0-100) */
  variance: number | null;
  /** Whether adaptive calibration was applied */
  calibrationApplied: boolean;
  /** Signal strength: strong/moderate/weak */
  signalStrength: "strong" | "moderate" | "weak";
  /** Whether confidence is heuristic vs model-derived */
  isHeuristic: boolean;
  /** Human-readable label */
  label: string;
}

export interface DecisionQualityScore {
  /** 0-100 composite score. This measures quality only after hard prerequisites. */
  overall: number;
  dimensions: {
    evidenceStrength: number;        // 0-25
    confidenceReliability: number;   // 0-25
    economicGrounding: number;       // 0-25
    actionability: number;           // 0-15
    monitoringClarity: number;       // 0-10
  };
  grade: "A" | "B" | "C" | "D" | "F";
  /** A recommendation is decision-grade only if score AND hard gates pass. */
  isDecisionGrade: boolean;
  /** Non-negotiable evidence prerequisites that failed. */
  hardGateFailures: string[];
  /** Reason for downgrade if applicable */
  downgradeReason: string | null;
}

function substantiveEvidenceItems(items: string[] | undefined): string[] {
  return (items ?? []).filter(item => {
    const normalized = item.trim();
    if (!normalized) return false;
    // A confidence label describes certainty; it is not evidence for the claim.
    return !/^confidence\s*:/i.test(normalized);
  });
}

/**
 * Score a decision output for quality.
 *
 * HARD-GATE PRINCIPLE:
 * A long recommendation, quantified-looking expected impact, or polished prose
 * must never turn zero observed data or an unresolved source into decision-grade
 * intelligence. Hard evidence prerequisites are evaluated separately from the
 * weighted score.
 */
export function scoreDecisionQuality(evidence: Partial<EvidenceBlock>): DecisionQualityScore {
  let evidenceStrength = 0;
  let confidenceReliability = 0;
  let economicGrounding = 0;
  let actionability = 0;
  let monitoringClarity = 0;

  const substantiveEvidence = substantiveEvidenceItems(evidence.evidence);
  const hardGateFailures: string[] = [];

  if (!evidence.observation?.trim()) hardGateFailures.push("no observed finding");
  if (substantiveEvidence.length === 0) hardGateFailures.push("no substantive evidence");
  if (!evidence.confidenceBasis) {
    hardGateFailures.push("no confidence basis");
  } else {
    if (!Number.isFinite(evidence.confidenceBasis.sampleSize) || evidence.confidenceBasis.sampleSize <= 0) {
      hardGateFailures.push("no observed data points");
    }
    if (!Number.isFinite(evidence.confidenceBasis.dataCoverage) || evidence.confidenceBasis.dataCoverage <= 0) {
      hardGateFailures.push("no measurable data coverage");
    }
  }

  if (!evidence.traceability?.isVerifiedSource) {
    hardGateFailures.push("unverified source traceability");
  } else {
    if (!evidence.traceability.sourceDatasetId) hardGateFailures.push("no source dataset id");
    if (!evidence.traceability.sourceEntityId) hardGateFailures.push("no source entity id");
    if (!Number.isFinite(evidence.traceability.dataRowsUsed) || evidence.traceability.dataRowsUsed <= 0) {
      hardGateFailures.push("no traceable source rows");
    }
  }

  // Evidence Strength (0-25)
  if (evidence.observation && evidence.observation.length > 20) evidenceStrength += 5;
  if (substantiveEvidence.length > 0) {
    evidenceStrength += Math.min(10, substantiveEvidence.length * 3);
  }
  if (evidence.reasoning && evidence.reasoning.length > 30) evidenceStrength += 5;
  if (evidence.assumptions && evidence.assumptions.length > 0) evidenceStrength += 5;

  // Confidence Reliability (0-25)
  if (evidence.confidenceBasis) {
    const cb = evidence.confidenceBasis;
    if (cb.sampleSize >= 30) confidenceReliability += 8;
    else if (cb.sampleSize >= 12) confidenceReliability += 5;
    else if (cb.sampleSize >= 1) confidenceReliability += 2;

    if (cb.dataCoverage >= 80) confidenceReliability += 5;
    else if (cb.dataCoverage >= 50) confidenceReliability += 3;

    if (cb.calibrationApplied) confidenceReliability += 5;
    if (!cb.isHeuristic) confidenceReliability += 4;
    if (cb.variance != null && cb.variance < 30) confidenceReliability += 3;
  }

  // Economic Grounding (0-25)
  if (evidence.expectedImpact) {
    if (/\d/.test(evidence.expectedImpact)) economicGrounding += 15;
    else economicGrounding += 5;
  }
  if (evidence.riskIfWrong && evidence.riskIfWrong.length > 10) economicGrounding += 10;

  // Actionability (0-15)
  if (evidence.recommendation && evidence.recommendation.length > 20) actionability += 10;
  if (evidence.limitations && evidence.limitations.length > 0) actionability += 5;

  // Monitoring Clarity (0-10)
  const evidenceRecord = evidence as Record<string, unknown>;
  if (evidenceRecord.successMetrics && Array.isArray(evidenceRecord.successMetrics) && evidenceRecord.successMetrics.length > 0) {
    monitoringClarity += 10;
  } else if (evidence.recommendation && /metric|KPI|measure|monitor|track|baseline|target|threshold|delta|rate|score/i.test(evidence.recommendation)) {
    monitoringClarity += 7;
  } else if (evidence.recommendation) {
    monitoringClarity += 3;
  }

  const overall = evidenceStrength + confidenceReliability + economicGrounding + actionability + monitoringClarity;

  const scoreGrade: DecisionQualityScore["grade"] =
    overall >= 80 ? "A" :
    overall >= 65 ? "B" :
    overall >= 45 ? "C" :
    overall >= 25 ? "D" : "F";

  // A hard evidence failure caps the visible grade below decision-grade. This
  // prevents an A/B/C badge from contradicting the fail-closed gate.
  const grade: DecisionQualityScore["grade"] = hardGateFailures.length > 0
    ? (overall >= 25 ? "D" : "F")
    : scoreGrade;

  const isDecisionGrade = overall >= 45 && hardGateFailures.length === 0;

  let downgradeReason: string | null = null;
  if (!isDecisionGrade) {
    const missing: string[] = [];
    if (!evidence.observation) missing.push("observation");
    if (substantiveEvidence.length === 0) missing.push("evidence");
    if (!evidence.confidenceBasis) missing.push("confidence basis");
    if (!evidence.traceability?.isVerifiedSource) missing.push("verified source traceability");
    if (!evidence.expectedImpact) missing.push("expected impact");
    if (!evidence.riskIfWrong) missing.push("risk assessment");

    const gateText = hardGateFailures.length > 0
      ? ` Hard gate failures: ${hardGateFailures.join(", ")}.`
      : "";
    const missingText = missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : "";
    downgradeReason = `Insufficient decision quality (${overall}/100, Grade ${grade}).${gateText}${missingText}`;
  }

  return {
    overall,
    dimensions: {
      evidenceStrength,
      confidenceReliability,
      economicGrounding,
      actionability,
      monitoringClarity,
    },
    grade,
    isDecisionGrade,
    hardGateFailures,
    downgradeReason,
  };
}

/**
 * Build a confidence basis from available data.
 */
export function buildConfidenceBasis(opts: {
  sampleSize: number;
  totalExpectedDimensions?: number;
  presentDimensions?: number;
  variance?: number | null;
  calibrationApplied?: boolean;
  isHeuristic?: boolean;
}): ConfidenceBasis {
  let coverage: number;
  if (opts.sampleSize <= 0) {
    coverage = 0;
  } else if (opts.totalExpectedDimensions && opts.presentDimensions) {
    coverage = Math.round((opts.presentDimensions / opts.totalExpectedDimensions) * 100);
  } else if (opts.sampleSize >= 30) {
    coverage = 80;
  } else if (opts.sampleSize >= 12) {
    coverage = 50;
  } else {
    coverage = 20;
  }

  const signalStrength: ConfidenceBasis["signalStrength"] =
    opts.sampleSize >= 30 && coverage >= 70 ? "strong" :
    opts.sampleSize >= 12 ? "moderate" : "weak";

  const isHeuristic = opts.isHeuristic ?? (opts.sampleSize < 12);

  let label: string;
  if (opts.sampleSize <= 0) {
    label = "Heuristic estimate (0 observed data points, 0% coverage)";
  } else if (isHeuristic) {
    label = `Heuristic estimate (${opts.sampleSize} data points, ${coverage}% coverage)`;
  } else if (opts.calibrationApplied) {
    label = `Calibrated model (${opts.sampleSize} points, ${coverage}% coverage)`;
  } else {
    label = `Statistical estimate (${opts.sampleSize} points, ${coverage}% coverage)`;
  }

  return {
    sampleSize: opts.sampleSize,
    dataCoverage: coverage,
    variance: opts.variance ?? null,
    calibrationApplied: opts.calibrationApplied ?? false,
    signalStrength,
    isHeuristic,
    label,
  };
}

/**
 * Generate a traceability record for "Why am I seeing this?"
 */
export interface TraceabilityRecord {
  /** Human-readable dataset name, or an explicit unverified label. */
  sourceDataset: string;
  /** Stable dataset identifier used for the evidence. */
  sourceDatasetId: string | null;
  /** Stable source insight/advisory/decision identifier. */
  sourceEntityId: string | null;
  /** True only when dataset, source entity, and observed rows are all present. */
  isVerifiedSource: boolean;
  dataRowsUsed: number;
  metricTransformationPath: string;
  modelOrHeuristic: string;
  generatedAt: string;
  limitations: string[];
}

export function buildTraceability(opts: {
  datasetId?: string | null;
  sourceEntityId?: string | null;
  /** Human-readable dataset name for executive-facing surfaces */
  datasetName?: string;
  dataRowsUsed: number;
  metricTypes: string[];
  modelUsed: string;
  limitations?: string[];
}): TraceabilityRecord {
  const datasetId = opts.datasetId?.trim() || null;
  const sourceEntityId = opts.sourceEntityId?.trim() || null;
  const rows = Number.isFinite(opts.dataRowsUsed) ? Math.max(0, opts.dataRowsUsed) : 0;
  const isVerifiedSource = Boolean(datasetId && sourceEntityId && rows > 0);
  const limitations = [...(opts.limitations ?? [])];

  if (!datasetId) limitations.push("Source dataset could not be resolved");
  if (!sourceEntityId) limitations.push("Source entity could not be resolved");
  if (rows <= 0) limitations.push("No observed rows are traceable to this recommendation");

  return {
    sourceDataset: opts.datasetName?.trim() || datasetId || "Unverified source",
    sourceDatasetId: datasetId,
    sourceEntityId,
    isVerifiedSource,
    dataRowsUsed: rows,
    metricTransformationPath: `raw → ${opts.metricTypes.join(", ")} → statistical summary → AI analysis`,
    modelOrHeuristic: opts.modelUsed,
    generatedAt: new Date().toISOString(),
    limitations: [...new Set(limitations)],
  };
}
