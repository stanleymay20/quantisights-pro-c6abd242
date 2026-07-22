/**
 * Decision Intelligence Maturity Model (Ch 15)
 * 
 * 5-level maturity assessment for organizational decision capabilities.
 * Measures across 6 dimensions aligned to the SUDAL framework.
 * 
 * Levels:
 * 1 - Ad Hoc: Gut-feel decisions, no systematic tracking
 * 2 - Emerging: Basic data usage, some tracking
 * 3 - Defined: Structured processes, consistent measurement
 * 4 - Managed: Predictive capabilities, closed-loop learning
 * 5 - Optimized: Autonomous optimization, continuous calibration
 */

// ─── Types ───

export interface MaturityDimension {
  id: string;
  name: string;
  description: string;
  level: number;        // 1-5
  score: number;        // 0-100
  indicators: MaturityIndicator[];
  recommendations: string[];
}

export interface MaturityIndicator {
  name: string;
  met: boolean;
  evidence: string;
  weight: number; // Relative importance
}

export interface MaturityAssessment {
  overallLevel: number;
  overallScore: number;
  dimensions: MaturityDimension[];
  readinessGrade: "A" | "B" | "C" | "D" | "F";
  scalingReadiness: number;  // 0-100
  nextActions: string[];
  assessedAt: string;
}

// ─── Input Metrics (from system telemetry) ───

export interface SystemMetrics {
  totalDecisions: number;
  decisionsWithOutcomes: number;
  avgConfidenceAccuracy: number;    // 0-1
  calibrationModelsCount: number;
  datasetsCount: number;
  dataQualityAvgScore: number;      // 0-100
  executionPlansCount: number;
  executionCompletionRate: number;  // 0-1
  automatedDecisionsCount: number;
  biasDetectionsCount: number;
  fairnessChecksCount: number;
  auditLogEntries: number;
  activeUsers: number;
  avgDecisionLatencyHours: number;
  rlsPoliciesCount: number;
  retentionPoliciesCount: number;
  abExperimentsCount: number;
  causalModelsCount: number;
  interventionsResolvedRate: number; // 0-1
  embeddingsCount: number;
}

// ─── Dimension Assessors ───

function assessDataFoundation(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Datasets ingested", met: m.datasetsCount >= 1, evidence: `${m.datasetsCount} datasets`, weight: 1 },
    { name: "Data quality monitoring", met: m.dataQualityAvgScore > 70, evidence: `Avg score: ${m.dataQualityAvgScore}`, weight: 1.5 },
    { name: "Multiple data sources", met: m.datasetsCount >= 3, evidence: `${m.datasetsCount} sources`, weight: 1 },
    { name: "Retention policies defined", met: m.retentionPoliciesCount > 0, evidence: `${m.retentionPoliciesCount} policies`, weight: 0.8 },
    { name: "Data lineage tracked", met: m.datasetsCount >= 2, evidence: "Lineage tracking active", weight: 1.2 },
  ];
  return buildDimension("data_foundation", "Data Foundation", "Quality and breadth of data infrastructure", indicators);
}

function assessAnalyticalCapability(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Statistical anomaly detection", met: m.totalDecisions > 0, evidence: "EWMA engine active", weight: 1 },
    { name: "A/B experimentation", met: m.abExperimentsCount > 0, evidence: `${m.abExperimentsCount} experiments`, weight: 1.2 },
    { name: "Causal inference models", met: m.causalModelsCount > 0, evidence: `${m.causalModelsCount} models`, weight: 1.5 },
    { name: "Forecasting capability", met: m.totalDecisions >= 5, evidence: "Forecasting enabled", weight: 1 },
    { name: "Embedding-based retrieval", met: m.embeddingsCount > 0, evidence: `${m.embeddingsCount} embeddings`, weight: 1.3 },
  ];
  return buildDimension("analytical", "Analytical Capability", "Depth and sophistication of analytical tools", indicators);
}

function assessDecisionGovernance(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Decision ledger active", met: m.totalDecisions > 0, evidence: `${m.totalDecisions} decisions tracked`, weight: 1.5 },
    { name: "Audit trail completeness", met: m.auditLogEntries > 10, evidence: `${m.auditLogEntries} audit entries`, weight: 1.2 },
    { name: "RLS security enforced", met: m.rlsPoliciesCount > 20, evidence: `${m.rlsPoliciesCount} RLS policies`, weight: 1 },
    { name: "Bias detection active", met: m.biasDetectionsCount > 0, evidence: `${m.biasDetectionsCount} detections`, weight: 1.3 },
    { name: "Fairness monitoring", met: m.fairnessChecksCount > 0, evidence: `${m.fairnessChecksCount} checks`, weight: 1.3 },
  ];
  return buildDimension("governance", "Decision Governance", "Controls, accountability, and compliance infrastructure", indicators);
}

function assessExecutionEffectiveness(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Execution plans created", met: m.executionPlansCount > 0, evidence: `${m.executionPlansCount} plans`, weight: 1 },
    { name: "Completion rate > 50%", met: m.executionCompletionRate > 0.5, evidence: `${(m.executionCompletionRate * 100).toFixed(0)}% completion`, weight: 1.5 },
    { name: "Intervention resolution", met: m.interventionsResolvedRate > 0.7, evidence: `${(m.interventionsResolvedRate * 100).toFixed(0)}% resolved`, weight: 1.2 },
    { name: "Decision latency < 48h", met: m.avgDecisionLatencyHours < 48, evidence: `${m.avgDecisionLatencyHours.toFixed(0)}h avg`, weight: 1 },
    { name: "Multi-user collaboration", met: m.activeUsers >= 2, evidence: `${m.activeUsers} active users`, weight: 0.8 },
  ];
  return buildDimension("execution", "Execution Effectiveness", "Ability to translate decisions into measurable outcomes", indicators);
}

function assessLearningLoop(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Outcomes measured", met: m.decisionsWithOutcomes > 0, evidence: `${m.decisionsWithOutcomes} outcomes`, weight: 1.5 },
    { name: "Calibration models built", met: m.calibrationModelsCount > 0, evidence: `${m.calibrationModelsCount} models`, weight: 1.5 },
    { name: "Confidence accuracy > 70%", met: m.avgConfidenceAccuracy > 0.7, evidence: `${(m.avgConfidenceAccuracy * 100).toFixed(0)}% accuracy`, weight: 1.3 },
    { name: "Outcome-to-decision feedback", met: m.decisionsWithOutcomes >= 3, evidence: "Feedback loop active", weight: 1.2 },
    { name: "Decision replay capability", met: m.calibrationModelsCount > 0 && m.decisionsWithOutcomes > 0, evidence: "Replay engine ready", weight: 1 },
  ];
  return buildDimension("learning", "Learning Loop", "Capacity for institutional learning and self-improvement", indicators);
}

function assessAutomation(m: SystemMetrics): MaturityDimension {
  const indicators: MaturityIndicator[] = [
    { name: "Automated decisions exist", met: m.automatedDecisionsCount > 0, evidence: `${m.automatedDecisionsCount} automated`, weight: 1.5 },
    { name: "Decision rules engine", met: m.totalDecisions > 5, evidence: "Rules engine active", weight: 1.2 },
    { name: "Auto-intervention triggers", met: m.interventionsResolvedRate > 0, evidence: "Auto-triggers configured", weight: 1 },
    { name: "Scheduled orchestration", met: m.auditLogEntries > 50, evidence: "Cron jobs running", weight: 1 },
    { name: "Self-healing execution", met: m.interventionsResolvedRate > 0.8 && m.executionCompletionRate > 0.7, evidence: "Self-healing active", weight: 1.5 },
  ];
  return buildDimension("automation", "Automation & Scale", "Degree of autonomous operation and scaling readiness", indicators);
}

// ─── Core Assessment Engine ───

export function assessMaturity(metrics: SystemMetrics): MaturityAssessment {
  const dimensions = [
    assessDataFoundation(metrics),
    assessAnalyticalCapability(metrics),
    assessDecisionGovernance(metrics),
    assessExecutionEffectiveness(metrics),
    assessLearningLoop(metrics),
    assessAutomation(metrics),
  ];

  const overallScore = Math.round(
    dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length
  );
  const overallLevel = scoreToLevel(overallScore);

  const readinessGrade: MaturityAssessment["readinessGrade"] =
    overallScore >= 80 ? "A" : overallScore >= 65 ? "B" : overallScore >= 50 ? "C" : overallScore >= 35 ? "D" : "F";

  const scalingReadiness = Math.min(100, Math.round(
    (dimensions.find(d => d.id === "automation")?.score ?? 0) * 0.3 +
    (dimensions.find(d => d.id === "governance")?.score ?? 0) * 0.25 +
    (dimensions.find(d => d.id === "learning")?.score ?? 0) * 0.25 +
    (dimensions.find(d => d.id === "execution")?.score ?? 0) * 0.2
  ));

  const nextActions = generateNextActions(dimensions);

  return {
    overallLevel,
    overallScore,
    dimensions,
    readinessGrade,
    scalingReadiness,
    nextActions,
    assessedAt: new Date().toISOString(),
  };
}

// ─── Helpers ───

function buildDimension(
  id: string, name: string, description: string, indicators: MaturityIndicator[]
): MaturityDimension {
  const totalWeight = indicators.reduce((s, i) => s + i.weight, 0);
  const metWeight = indicators.filter(i => i.met).reduce((s, i) => s + i.weight, 0);
  const score = Math.round((metWeight / totalWeight) * 100);
  const level = scoreToLevel(score);

  const recommendations: string[] = [];
  indicators.filter(i => !i.met).forEach(i => {
    recommendations.push(`Improve: ${i.name}`);
  });

  return { id, name, description, level, score, indicators, recommendations };
}

function scoreToLevel(score: number): number {
  if (score >= 85) return 5;
  if (score >= 65) return 4;
  if (score >= 45) return 3;
  if (score >= 25) return 2;
  return 1;
}

function generateNextActions(dimensions: MaturityDimension[]): string[] {
  const weakest = [...dimensions].sort((a, b) => a.score - b.score);
  const actions: string[] = [];

  for (const dim of weakest.slice(0, 3)) {
    if (dim.recommendations.length > 0) {
      actions.push(`[${dim.name}] ${dim.recommendations[0]}`);
    }
  }

  if (actions.length === 0) {
    actions.push("All dimensions strong — focus on scaling and automation");
  }

  return actions;
}

/** Maturity level labels from Ch 15 */
export const MATURITY_LEVELS: Record<number, { label: string; description: string }> = {
  1: { label: "Ad Hoc", description: "Gut-feel decisions with no systematic tracking or measurement" },
  2: { label: "Emerging", description: "Basic data usage with some decision tracking in place" },
  3: { label: "Defined", description: "Structured processes with consistent measurement across teams" },
  4: { label: "Managed", description: "Predictive capabilities with closed-loop learning and calibration" },
  5: { label: "Optimized", description: "Autonomous optimization with continuous self-calibration" },
};
