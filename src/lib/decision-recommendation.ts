/**
 * Contextual AI recommendation generator — EVIDENCE-BACKED + FAIL-CLOSED.
 *
 * Every recommendation MUST carry:
 * - Output classification (OBSERVED_FACT / STATISTICAL_INFERENCE / HEURISTIC_ESTIMATE / AI_RECOMMENDATION)
 * - Evidence basis (traceability)
 * - Confidence basis (justification)
 * - Assumptions + Risks if wrong
 * - Traceability record
 *
 * FAIL-CLOSED: If decision quality is below threshold, recommendedAction is
 * replaced with an explicit "insufficient evidence" message.
 */

import {
  type EvidenceBlock,
  type ConfidenceBasis,
  type TraceabilityRecord,
  buildConfidenceBasis,
  buildTraceability,
  scoreDecisionQuality,
  type DecisionQualityScore,
} from "./evidence-contract";

import type { OutputClassification } from "@/components/dashboard/OutputClassificationBadge";

export interface RecommendationInput {
  signalType: "signal" | "advisory" | "pending_outcome" | "proactive";
  metricType?: string | null;
  trendDirection?: "up" | "down" | "stable" | null;
  severity: string;
  confidence: number | null;
  diagnosticFindings?: string | null;
  causalFactors?: string | null;
  affectedSegment?: string | null;
  message?: string | null;
  priorAdvisoryAction?: string | null;
  category?: string | null;
  sampleSize?: number;
  calibrationApplied?: boolean;
  /** Stable source dataset id for traceability. */
  datasetId?: string | null;
  /** Stable source insight/advisory/decision id for traceability. */
  sourceEntityId?: string | null;
  /** Human-readable dataset name */
  datasetName?: string;
  /** Row count used */
  dataRowsUsed?: number;
  /** Organizational identity context for mission-aware recommendations */
  orgIdentity?: {
    riskAppetite?: string;
    decisionSpeedPreference?: string;
    governanceModel?: string;
    stakeholderOrientation?: string;
    marketStage?: string;
    strategicPriorities?: string[];
  } | null;
}

export interface ClassifiedSection {
  classification: OutputClassification;
  label: string;
  content: string;
}

export interface ExecutionReadiness {
  level: "high" | "moderate" | "low";
  label: string;
  reason: string;
}

export interface StructuredRecommendation {
  /** Classified sections — no mixed unlabeled prose */
  sections: ClassifiedSection[];
  whatHappened: string;
  whyItMatters: string;
  recommendedAction: string;
  suggestedOwner: string;
  suggestedDeadlineDays: number;
  successMetrics: string[];
  assumptions: string[];
  riskIfWrong: string;
  evidenceBasis: string[];
  confidenceBasis: ConfidenceBasis;
  qualityScore: DecisionQualityScore;
  isDecisionGrade: boolean;
  /** Traceability record for "Why am I seeing this?" */
  traceability: TraceabilityRecord;
  /** If not decision-grade, the original action is suppressed and this contains the gate message */
  decisionGateMessage: string | null;
  /** Execution readiness assessment */
  executionReadiness: ExecutionReadiness;
}

// Ordered longest-first to prevent partial matches (e.g. "cost_of_revenue" matching "cost" before "revenue")
const OWNER_MAP: [string, string][] = [
  ["cost_of_revenue", "VP Revenue / CRO"],
  ["supply chain", "VP Supply Chain / CPO"],
  ["mortality", "CMO / Chief Patient Safety Officer"],
  ["patient", "CMO / Chief Patient Safety Officer"],
  ["clinical", "CMO / VP Clinical Operations"],
  ["readmission", "CMO / VP Clinical Quality"],
  ["safety", "VP EHS / Chief Safety Officer"],
  ["compliance", "CCO / Chief Compliance Officer"],
  ["regulatory", "CCO / VP Regulatory Affairs"],
  ["audit", "VP Internal Audit / CCO"],
  ["fraud", "CRO / VP Fraud Prevention"],
  ["liquidity", "CFO / VP Treasury"],
  ["exposure", "CRO / VP Risk Management"],
  ["credit", "CRO / VP Credit Risk"],
  ["downtime", "VP Operations / Plant Manager"],
  ["outage", "VP Operations / Grid Manager"],
  ["defect", "VP Quality / Six Sigma Lead"],
  ["throughput", "VP Operations / Plant Manager"],
  ["yield", "VP Manufacturing / Process Engineering Lead"],
  ["emission", "VP Sustainability / Chief Sustainability Officer"],
  ["energy", "VP Energy Management / Facilities Director"],
  ["inventory", "VP Supply Chain / Inventory Manager"],
  ["logistics", "VP Supply Chain / Logistics Director"],
  ["procurement", "VP Procurement / CPO"],
  ["enrollment", "VP Enrollment Management / Registrar"],
  ["attrition", "VP Student Success / CHRO"],
  ["occupancy", "VP Revenue Management / Asset Manager"],
  ["vacancy", "VP Leasing / Asset Manager"],
  ["calibration", "Decision Governance Lead"],
  ["operational", "COO / VP Operations"],
  ["strategic", "CEO / Strategy Lead"],
  ["retention", "VP Customer Success"],
  ["financial", "CFO / VP Finance"],
  ["revenue", "VP Revenue / CRO"],
  ["growth", "VP Growth / CGO"],
  ["margin", "CFO / VP Finance"],
  ["churn", "VP Customer Success"],
  ["cost", "VP Finance / CFO"],
];

function inferOwner(category: string | null | undefined, metricType: string | null | undefined): string {
  const key = [category, metricType].filter(Boolean).join(" ").toLowerCase();
  for (const [k, v] of OWNER_MAP) {
    if (key.includes(k)) return v;
  }
  return "Decision Owner (assign)";
}

function inferDeadlineDays(severity: string, confidence: number | null, sampleSize?: number): number {
  const conf = confidence ?? 50;
  const dataBuffer = (sampleSize != null && sampleSize < 12) ? 3 : 0;
  if (severity === "critical") return (conf > 70 ? 3 : 5) + dataBuffer;
  if (severity === "high") return (conf > 70 ? 7 : 10) + dataBuffer;
  if (severity === "medium") return (conf > 70 ? 14 : 21) + dataBuffer;
  return (conf > 70 ? 21 : 30) + dataBuffer;
}

export function generateRecommendation(input: RecommendationInput): StructuredRecommendation {
  const cat = input.category?.toLowerCase() ?? "";
  const met = input.metricType?.toLowerCase() ?? "";
  const msg = input.message ?? "";
  const conf = input.confidence ?? 50;
  const trend = input.trendDirection ?? "stable";
  const segment = input.affectedSegment ?? "primary segment";
  const confLabel = conf >= 70 ? "high confidence" : conf >= 40 ? "moderate confidence" : "low confidence";
  const sampleSize = input.sampleSize ?? 0;
  const deadlineDays = inferDeadlineDays(input.severity, conf, sampleSize);

  const confidenceBasis = buildConfidenceBasis({
    sampleSize,
    calibrationApplied: input.calibrationApplied ?? false,
    isHeuristic: sampleSize < 12,
  });

  // --- Evidence basis ---
  const evidenceBasis: string[] = [];
  if (msg.length > 20) evidenceBasis.push(`Signal: "${msg.slice(0, 120)}"`);
  if (input.diagnosticFindings) evidenceBasis.push(`Driver hypothesis: ${input.diagnosticFindings}`);
  if (input.causalFactors) evidenceBasis.push(`Associated factors: ${input.causalFactors}`);
  if (input.priorAdvisoryAction) evidenceBasis.push(`Prior advisory: ${input.priorAdvisoryAction}`);
  if (conf > 0) evidenceBasis.push(`Confidence: ${conf}% (${confLabel})`);

  // --- Classified sections ---
  const sections: ClassifiedSection[] = [];

  let whatHappened: string;
  let whatHappenedClassification: OutputClassification;
  if (input.signalType === "advisory" && input.priorAdvisoryAction) {
    whatHappened = input.priorAdvisoryAction;
    whatHappenedClassification = "AI_RECOMMENDATION";
  } else if (msg.length > 20) {
    whatHappened = msg.slice(0, 200);
    whatHappenedClassification = "OBSERVED_FACT";
  } else {
    const metricLabel = met || cat || "monitored metric";
    const trendVerb = trend === "up" ? "increasing" : trend === "down" ? "declining" : "shifting";
    whatHappened = `${input.severity === "critical" ? "Critical" : "Notable"} ${trendVerb} signal detected in ${metricLabel} affecting ${segment}.`;
    whatHappenedClassification = "HEURISTIC_ESTIMATE";
  }
  sections.push({
    classification: whatHappenedClassification,
    label: "What happened",
    content: whatHappened,
  });

  const whyParts: string[] = [];
  whyParts.push(`Detected at ${confLabel} (${conf}%)`);
  if (sampleSize > 0) whyParts.push(`based on ${sampleSize} data points`);
  if (input.severity === "critical") {
    whyParts.push("classified as critical severity — immediate attention required");
  } else if (input.severity === "high") {
    whyParts.push("classified as high severity — material business impact likely");
  }
  if (input.diagnosticFindings) whyParts.push(`driver hypothesis: ${input.diagnosticFindings}`);
  if (input.causalFactors) whyParts.push(`associated factors: ${input.causalFactors}`);
  if (trend === "down") whyParts.push("downward trajectory may compound exposure over time where lower values are not the intended direction");
  if (msg.length > 20 && !input.diagnosticFindings) {
    const numMatch = msg.match(/(\d+\.?\d*)\s*%/);
    if (numMatch) whyParts.push(`signal magnitude: ${numMatch[0]}`);
  }
  const whyItMatters = whyParts.join(". ") + ".";
  sections.push({
    classification: sampleSize >= 12 ? "STATISTICAL_INFERENCE" : "HEURISTIC_ESTIMATE",
    label: "Why it matters",
    content: whyItMatters,
  });

  const assumptions: string[] = [];
  if (sampleSize < 30) {
    assumptions.push(`Limited sample size (${sampleSize} points) — trends may not be statistically significant`);
  }
  assumptions.push("Observed associations and timing do not by themselves establish causality");
  if (!input.diagnosticFindings) {
    assumptions.push("Candidate drivers have not been diagnostically investigated");
  }
  if (trend !== "stable") {
    assumptions.push(`Assumes the observed ${trend === "down" ? "downward" : "upward"} movement persists without intervention`);
  }
  if (input.signalType === "proactive") {
    assumptions.push("Proactive signal — threshold-based detection, not anomaly-confirmed");
  }

  const riskMetricRef = met || cat || "the monitored metric";
  let riskIfWrong: string;
  if (input.severity === "critical") {
    riskIfWrong = `If this ${riskMetricRef} signal is a false positive, acting on it may divert resources from other priorities. The evidence should be investigated before irreversible action.`;
  } else if (conf < 40) {
    riskIfWrong = `Low confidence (${conf}%) on ${riskMetricRef} means this signal has a high probability of being noise. Recommend investigation before committing resources.`;
  } else {
    riskIfWrong = `If the underlying ${riskMetricRef} trend reverses naturally or the driver hypothesis is wrong, the recommended action may be unnecessary. Monitor the success metrics and adjust.`;
  }

  let recommendedAction: string;
  if (input.signalType === "pending_outcome") {
    recommendedAction = `Record the actual outcome of this decision to close the feedback loop and improve calibration accuracy. Decision has been pending — outcome data is overdue.`;
  } else {
    const actionParts: string[] = [];
    if (msg.length > 20) {
      actionParts.push(`Investigate the specific signal: "${msg.slice(0, 80)}${msg.length > 80 ? "..." : ""}".`);
    } else {
      actionParts.push(`Investigate ${met || cat || "this signal"} via the diagnostic engine to identify and test candidate drivers.`);
    }
    actionParts.push(`Quantify impact using the ${conf}% confidence signal (${confLabel}) and preserve the evidence chain.`);

    const actionKey = [cat, met].join(" ");
    if (actionKey.includes("mortality") || actionKey.includes("patient") || actionKey.includes("clinical")) {
      actionParts.push(`Initiate clinical safety review. Assess patient impact, escalate through safety committee, and implement corrective protocol for ${segment}.`);
    } else if (actionKey.includes("safety")) {
      actionParts.push(`Trigger EHS incident review. Conduct a formal root-cause investigation before attributing cause, implement containment measures, and update safety protocols for ${segment}.`);
    } else if (actionKey.includes("compliance") || actionKey.includes("regulatory")) {
      actionParts.push(`Initiate compliance gap assessment. Document findings, engage regulatory affairs, and implement remediation plan within action window.`);
    } else if (actionKey.includes("fraud")) {
      actionParts.push(`Escalate to fraud investigation team. Freeze affected transactions, run pattern analysis, and implement enhanced monitoring for ${segment}.`);
    } else if (actionKey.includes("outage") || actionKey.includes("downtime")) {
      actionParts.push(`Execute incident response protocol. Perform a formal root-cause investigation before attribution, implement corrective maintenance, and update failover procedures.`);
    } else if (actionKey.includes("defect") || actionKey.includes("yield")) {
      actionParts.push(`Run Pareto analysis on defect categories. Implement corrective actions on top contributors and verify via control charts.`);
    } else if (actionKey.includes("liquidity") || actionKey.includes("credit") || actionKey.includes("exposure")) {
      actionParts.push(`Review risk exposure limits. Stress-test current positions, adjust hedging strategy, and escalate to risk committee if thresholds breached.`);
    } else if (actionKey.includes("supply chain") || actionKey.includes("inventory") || actionKey.includes("logistics")) {
      actionParts.push(`Assess supply chain disruption scope. Activate contingency suppliers, rebalance inventory buffers, and update demand forecast.`);
    } else if (actionKey.includes("emission") || actionKey.includes("energy")) {
      actionParts.push(`Audit energy consumption patterns. Identify top emission sources, evaluate reduction scenarios, and update sustainability roadmap.`);
    } else if (actionKey.includes("enrollment") || actionKey.includes("attrition")) {
      actionParts.push(`Analyze attrition drivers by cohort. Activate retention interventions, review engagement scores, and adjust resource allocation.`);
    } else if (actionKey.includes("occupancy") || actionKey.includes("vacancy")) {
      actionParts.push(`Review pricing strategy and market positioning. Analyze competitor rates, adjust incentives, and target high-conversion channels.`);
    } else if (actionKey.includes("churn") || actionKey.includes("retention")) {
      actionParts.push(`Run cohort analysis on ${segment} to identify at-risk accounts and activate retention playbook.`);
    } else if (actionKey.includes("revenue")) {
      actionParts.push(`Diagnose variance by segment/channel and simulate recovery scenarios.`);
    } else if (actionKey.includes("cost")) {
      actionParts.push(`Audit top cost drivers and evaluate optimization scenarios.`);
    } else if (actionKey.includes("growth")) {
      actionParts.push(`Analyze by acquisition channel and reallocate to highest-ROI vectors.`);
    } else if (actionKey.includes("calibration")) {
      actionParts.push(`Complete pending calibration assessments and close outstanding decision outcomes.`);
    } else {
      actionParts.push(`Approve corrective action only after the evidence threshold is satisfied, then set a measurement checkpoint.`);
    }

    if (input.orgIdentity) {
      const oi = input.orgIdentity;
      if (oi.decisionSpeedPreference === "rapid" || oi.decisionSpeedPreference === "agile") {
        actionParts.push(`Organization operates in ${oi.decisionSpeedPreference} decision mode — prioritize speed of investigation and reversible execution.`);
      }
      if (oi.governanceModel === "consensus") {
        actionParts.push(`Governance model requires consensus — secure stakeholder alignment before execution.`);
      }
      if (oi.stakeholderOrientation === "community" || oi.stakeholderOrientation === "stakeholder") {
        actionParts.push(`Evaluate impact on broader stakeholder groups per organizational orientation.`);
      }
      if (oi.strategicPriorities && oi.strategicPriorities.length > 0) {
        const relevantPriorities = oi.strategicPriorities.slice(0, 2).join(", ");
        actionParts.push(`Align execution with strategic priorities: ${relevantPriorities}.`);
      }
    }

    actionParts.push(`Target resolution within ${deadlineDays}d. Track via success metrics.`);
    recommendedAction = actionParts.join(" ");
  }
  sections.push({
    classification: "AI_RECOMMENDATION",
    label: "Recommended action",
    content: recommendedAction,
  });

  const successMetrics = inferSuccessMetrics(cat, met);

  // --- Traceability — built BEFORE scoring so provenance is a hard gate. ---
  const metricTypes = [met, cat].filter(Boolean);
  const traceability = buildTraceability({
    datasetId: input.datasetId,
    sourceEntityId: input.sourceEntityId,
    datasetName: input.datasetName,
    dataRowsUsed: input.dataRowsUsed ?? sampleSize,
    metricTypes: metricTypes.length > 0 ? metricTypes : ["unknown"],
    modelUsed: sampleSize >= 12
      ? (input.calibrationApplied ? "Calibrated statistical model" : "Statistical inference")
      : "Heuristic rule-based engine",
    limitations: sampleSize < 12 ? ["Insufficient data for statistical significance"] : [],
  });

  const evidenceBlock: Partial<EvidenceBlock> = {
    observation: whatHappened,
    evidence: evidenceBasis,
    reasoning: whyItMatters,
    confidenceBasis,
    traceability,
    assumptions,
    limitations: [
      ...(sampleSize < 12 ? ["Limited data — statistical significance not established"] : []),
      ...traceability.limitations,
    ],
    recommendation: recommendedAction,
    expectedImpact: input.severity === "critical" ? "Immediate risk mitigation" : "Trend correction within action window",
    riskIfWrong,
  };

  const qualityScore = scoreDecisionQuality(evidenceBlock);
  const isDecisionGrade = qualityScore.isDecisionGrade;

  let decisionGateMessage: string | null = null;
  if (!isDecisionGrade) {
    decisionGateMessage = `Insufficient evidence or provenance for decision-grade recommendation (${qualityScore.overall}/100, Grade ${qualityScore.grade}). ${qualityScore.downgradeReason ?? ""}`;
    recommendedAction = "⚠ Not decision-grade — evidence/provenance requirements are not satisfied. " + (qualityScore.downgradeReason ?? "");
    sections[sections.length - 1] = {
      classification: "AI_RECOMMENDATION",
      label: "Recommendation suppressed",
      content: recommendedAction,
    };
  }

  const executionReadiness = assessExecutionReadiness(conf, sampleSize, isDecisionGrade, input.calibrationApplied ?? false);

  return {
    sections,
    whatHappened,
    whyItMatters,
    recommendedAction,
    suggestedOwner: inferOwner(input.category, input.metricType),
    suggestedDeadlineDays: deadlineDays,
    successMetrics,
    assumptions,
    riskIfWrong,
    evidenceBasis,
    confidenceBasis,
    qualityScore,
    isDecisionGrade,
    traceability,
    decisionGateMessage,
    executionReadiness,
  };
}

function assessExecutionReadiness(confidence: number, sampleSize: number, isDecisionGrade: boolean, calibrationApplied: boolean): ExecutionReadiness {
  if (!isDecisionGrade) {
    return { level: "low", label: "Low", reason: "Insufficient evidence or provenance for confident execution" };
  }
  const factors: string[] = [];
  let score = 0;
  if (confidence >= 70) { score += 3; } else if (confidence >= 50) { score += 2; factors.push("moderate confidence"); } else { score += 1; factors.push("low confidence"); }
  if (sampleSize >= 30) { score += 3; } else if (sampleSize >= 12) { score += 2; factors.push("limited sample"); } else { score += 1; factors.push("insufficient sample size"); }
  if (calibrationApplied) { score += 2; } else { score += 1; factors.push("uncalibrated"); }

  if (score >= 7) return { level: "high", label: "High", reason: "Strong data foundation and calibrated confidence" };
  if (score >= 5) return { level: "moderate", label: "Moderate", reason: factors.length > 0 ? `Actionable, limited by: ${factors.join(", ")}` : "Actionable with standard data coverage" };
  return { level: "low", label: "Low", reason: `Requires: ${factors.join(", ")}` };
}

function inferSuccessMetrics(category: string, metricType: string): string[] {
  const key = [category, metricType].filter(Boolean).join(" ").toLowerCase();

  if (key.includes("mortality") || key.includes("patient")) {
    return ["Patient outcome improvement rate", "Adverse event reduction", "Readmission rate delta"];
  } else if (key.includes("clinical")) {
    return ["Clinical efficacy measure", "Treatment adherence rate", "Patient safety incident reduction"];
  } else if (key.includes("readmission")) {
    return ["30-day readmission rate", "Post-discharge follow-up compliance", "Patient satisfaction score"];
  } else if (key.includes("safety")) {
    return ["TRIR (Total Recordable Incident Rate)", "Lost time injury frequency", "Near-miss reporting rate"];
  } else if (key.includes("compliance") || key.includes("regulatory")) {
    return ["Compliance gap closure rate", "Audit finding remediation time", "Regulatory submission success rate"];
  } else if (key.includes("audit")) {
    return ["Audit finding count (trend)", "Remediation completion rate", "Control effectiveness score"];
  } else if (key.includes("fraud")) {
    return ["Fraud detection rate", "False positive reduction", "Mean time to detection (MTTD)"];
  } else if (key.includes("liquidity")) {
    return ["Liquidity coverage ratio", "Cash conversion cycle", "Days payable/receivable outstanding"];
  } else if (key.includes("exposure") || key.includes("credit")) {
    return ["Value-at-Risk (VaR) delta", "Expected loss reduction", "Risk-adjusted return improvement"];
  } else if (key.includes("downtime") || key.includes("outage")) {
    return ["MTTR (Mean Time To Repair)", "MTBF (Mean Time Between Failures)", "Availability % improvement"];
  } else if (key.includes("defect")) {
    return ["Defect rate (PPM) reduction", "First-pass yield improvement", "Cost of poor quality (COPQ) delta"];
  } else if (key.includes("yield") || key.includes("throughput")) {
    return ["Overall Equipment Effectiveness (OEE)", "Throughput rate improvement", "Cycle time reduction"];
  } else if (key.includes("supply chain") || key.includes("inventory") || key.includes("logistics")) {
    return ["Inventory turnover ratio", "Order fulfillment rate", "Supply chain cycle time"];
  } else if (key.includes("procurement")) {
    return ["Cost savings vs. baseline", "Supplier lead time reduction", "Purchase order cycle time"];
  } else if (key.includes("emission") || key.includes("energy")) {
    return ["Carbon intensity reduction (tCO2e/unit)", "Energy efficiency improvement", "Sustainability target progress"];
  } else if (key.includes("enrollment") || key.includes("attrition")) {
    return ["Retention/enrollment rate improvement", "Engagement score delta", "Time-to-completion improvement"];
  } else if (key.includes("occupancy") || key.includes("vacancy")) {
    return ["Occupancy rate improvement", "RevPAR / Revenue per unit", "Average lease-up velocity"];
  } else if (key.includes("churn") || key.includes("retention")) {
    return ["Monthly churn rate (% change)", "At-risk cohort size reduction", "NPS / CSAT delta"];
  } else if (key.includes("revenue")) {
    return ["MRR / ARR recovery trajectory", "Revenue variance vs. plan", "Pipeline conversion rate"];
  } else if (key.includes("cost")) {
    return ["Cost per unit reduction", "Burn rate change", "Gross margin improvement"];
  } else if (key.includes("margin")) {
    return ["Gross margin %", "Contribution margin delta", "EBITDA trajectory"];
  } else if (key.includes("growth")) {
    return ["Growth rate (MoM)", "New customer acquisition rate", "Expansion revenue %"];
  } else if (key.includes("calibration")) {
    return ["Calibration score improvement", "Brier score reduction", "Pending outcomes closed"];
  }

  const metricLabel = metricType?.replace(/_/g, " ") || category?.replace(/_/g, " ") || "primary metric";
  return [
    `${metricLabel} trend direction (period-over-period)`,
    `${metricLabel} variance from computed baseline`,
    `Volatility reduction (coefficient of variation)`,
  ];
}
