/**
 * Evidence Contract — Enterprise Decision Intelligence Foundation.
 *
 * Every insight, advisory, or recommendation MUST carry an evidence block.
 * If any element is missing, the recommendation is automatically downgraded.
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
  /** 0-100 composite score */
  overall: number;
  dimensions: {
    evidenceStrength: number;        // 0-25
    confidenceReliability: number;   // 0-25
    economicGrounding: number;       // 0-25
    actionability: number;           // 0-15
    monitoringClarity: number;       // 0-10
  };
  grade: "A" | "B" | "C" | "D" | "F";
  /** If grade < C, recommendations should be downgraded */
  isDecisionGrade: boolean;
  /** Reason for downgrade if applicable */
  downgradeReason: string | null;
}

/**
 * Score a decision output for quality.
 * If the score is below threshold, the output should be labeled as
 * "preliminary" or blocked from presentation as intelligence.
 */
export function scoreDecisionQuality(evidence: Partial<EvidenceBlock>): DecisionQualityScore {
  let evidenceStrength = 0;
  let confidenceReliability = 0;
  let economicGrounding = 0;
  let actionability = 0;
  let monitoringClarity = 0;

  // Evidence Strength (0-25)
  if (evidence.observation && evidence.observation.length > 20) evidenceStrength += 5;
  if (evidence.evidence && evidence.evidence.length > 0) {
    evidenceStrength += Math.min(10, evidence.evidence.length * 3);
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
    if (/\d/.test(evidence.expectedImpact)) economicGrounding += 15; // has numbers
    else economicGrounding += 5; // qualitative only
  }
  if (evidence.riskIfWrong && evidence.riskIfWrong.length > 10) economicGrounding += 10;

  // Actionability (0-15)
  if (evidence.recommendation && evidence.recommendation.length > 20) actionability += 10;
  if (evidence.limitations && evidence.limitations.length > 0) actionability += 5;

  // Monitoring Clarity (0-10)
  // Structural check: successMetrics array presence (from StructuredRecommendation),
  // plus keyword fallback for standalone evidence blocks
  const evidenceRecord = evidence as Record<string, unknown>;
  if (evidenceRecord.successMetrics && Array.isArray(evidenceRecord.successMetrics) && evidenceRecord.successMetrics.length > 0) {
    monitoringClarity += 10;
  } else if (evidence.recommendation && /metric|KPI|measure|monitor|track|baseline|target|threshold|delta|rate|score/i.test(evidence.recommendation)) {
    monitoringClarity += 7;
  } else if (evidence.recommendation) {
    monitoringClarity += 3;
  }

  const overall = evidenceStrength + confidenceReliability + economicGrounding + actionability + monitoringClarity;

  const grade: DecisionQualityScore["grade"] =
    overall >= 80 ? "A" :
    overall >= 65 ? "B" :
    overall >= 45 ? "C" :
    overall >= 25 ? "D" : "F";

  const isDecisionGrade = overall >= 45; // C or above

  let downgradeReason: string | null = null;
  if (!isDecisionGrade) {
    const missing: string[] = [];
    if (!evidence.observation) missing.push("observation");
    if (!evidence.evidence || evidence.evidence.length === 0) missing.push("evidence");
    if (!evidence.confidenceBasis) missing.push("confidence basis");
    if (!evidence.expectedImpact) missing.push("expected impact");
    if (!evidence.riskIfWrong) missing.push("risk assessment");
    downgradeReason = `Insufficient decision quality (${overall}/100). Missing: ${missing.join(", ")}.`;
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
  // When explicit dimensions aren't provided, infer coverage from sample size
  // to avoid a silent 0% that penalizes the score
  let coverage: number;
  if (opts.totalExpectedDimensions && opts.presentDimensions) {
    coverage = Math.round((opts.presentDimensions / opts.totalExpectedDimensions) * 100);
  } else if (opts.sampleSize >= 30) {
    coverage = 80; // robust data implies reasonable coverage
  } else if (opts.sampleSize >= 12) {
    coverage = 50; // moderate
  } else {
    coverage = 20; // limited
  }

  const signalStrength: ConfidenceBasis["signalStrength"] =
    opts.sampleSize >= 30 && coverage >= 70 ? "strong" :
    opts.sampleSize >= 12 ? "moderate" : "weak";

  const isHeuristic = opts.isHeuristic ?? (opts.sampleSize < 12);

  let label: string;
  if (isHeuristic) {
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
  sourceDataset: string;
  dataRowsUsed: number;
  metricTransformationPath: string;
  modelOrHeuristic: string;
  generatedAt: string;
  limitations: string[];
}

export function buildTraceability(opts: {
  datasetId: string;
  /** Human-readable dataset name for executive-facing surfaces */
  datasetName?: string;
  dataRowsUsed: number;
  metricTypes: string[];
  modelUsed: string;
  limitations?: string[];
}): TraceabilityRecord {
  return {
    sourceDataset: opts.datasetName || opts.datasetId,
    dataRowsUsed: opts.dataRowsUsed,
    metricTransformationPath: `raw → ${opts.metricTypes.join(", ")} → statistical summary → AI analysis`,
    modelOrHeuristic: opts.modelUsed,
    generatedAt: new Date().toISOString(),
    limitations: opts.limitations ?? [],
  };
}
