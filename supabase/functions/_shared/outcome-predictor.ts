/**
 * Outcome Predictor — Predictive scoring using historical decision-outcome pairs.
 *
 * This is NOT an LLM call. It uses statistical analysis of similar past decisions
 * to predict success probability. Success is taken from the direction-aware
 * decision_outcomes evaluator, never inferred from the raw sign of outcome_delta.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PredictionResult {
  predicted_success_probability: number;
  similar_decisions_count: number;
  similar_decisions_avg_outcome: number | null;
  similar_decisions_success_rate: number | null;
  confidence_factors: Array<{
    factor: string;
    direction: "positive" | "negative" | "neutral";
    weight: number;
    explanation: string;
  }>;
  model_version: number;
}

type OutcomeSuccess = 0 | 1;

type HistoricalDecision = {
  id: string;
  recommended_action: string;
  decision_type: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
  outcome_delta: number | null;
  prediction_accuracy_score: number | null;
  calibration_error: number | null;
  execution_status: string | null;
  outcome_success: OutcomeSuccess;
};

function successFromOutcomeStatus(status: unknown): OutcomeSuccess | null {
  switch (String(status ?? "").toLowerCase()) {
    case "success":
    case "partial_success":
      return 1;
    case "negative_outcome":
    case "no_effect":
      return 0;
    default:
      return null;
  }
}

function confidenceRate(value: number): number {
  return value > 1 ? value / 100 : value;
}

/**
 * Predict outcome success probability using historical decision-outcome data.
 *
 * Methodology:
 * 1. Find completed decisions with direction-aware evaluated outcomes
 * 2. Compute base rates from normalized success/failure labels
 * 3. Adjust for confidence level, decision type, and calibration history
 * 4. Incorporate semantic similarity and calibration-model corrections
 *
 * This is a frequentist + Bayesian hybrid approach — NOT an LLM call.
 */
export async function predictOutcome(
  supabaseUrl: string,
  serviceKey: string,
  orgId: string,
  decision: {
    recommended_action: string;
    decision_type: string;
    capped_confidence: number | null;
    predicted_net_impact: number | null;
  },
  similarDecisionIds: string[] = []
): Promise<PredictionResult> {
  const svc = createClient(supabaseUrl, serviceKey);
  const factors: PredictionResult["confidence_factors"] = [];

  // 1a. Load completed decisions. outcome_delta remains useful as a magnitude,
  // but must never decide whether the outcome was good or bad.
  const { data: historicalDecisions, error: decisionsError } = await svc
    .from("decision_ledger")
    .select(
      "id, recommended_action, decision_type, capped_confidence, predicted_net_impact, " +
      "outcome_delta, prediction_accuracy_score, calibration_error, execution_status"
    )
    .eq("organization_id", orgId)
    .eq("execution_status", "completed")
    .limit(2000);

  if (decisionsError) throw new Error(`historical decisions query failed: ${decisionsError.message}`);

  // 1b. Load evaluator classifications. These already know whether the tracked
  // metric was meant to increase or decrease, so they are the canonical success labels.
  const { data: evaluatedOutcomes, error: outcomesError } = await svc
    .from("decision_outcomes")
    .select("decision_id, outcome_status, evaluation_date")
    .eq("organization_id", orgId)
    .in("outcome_status", ["success", "partial_success", "no_effect", "negative_outcome"])
    .not("evaluation_date", "is", null)
    .order("evaluation_date", { ascending: false })
    .limit(5000);

  if (outcomesError) throw new Error(`evaluated outcomes query failed: ${outcomesError.message}`);

  const successByDecision = new Map<string, OutcomeSuccess>();
  for (const outcome of evaluatedOutcomes ?? []) {
    const decisionId = outcome.decision_id as string;
    if (successByDecision.has(decisionId)) continue; // latest row wins due ordering
    const success = successFromOutcomeStatus(outcome.outcome_status);
    if (success != null) successByDecision.set(decisionId, success);
  }

  const completed: HistoricalDecision[] = (historicalDecisions ?? [])
    .map((row: any) => {
      const outcomeSuccess = successByDecision.get(row.id as string);
      if (outcomeSuccess == null) return null;
      return { ...row, outcome_success: outcomeSuccess } as HistoricalDecision;
    })
    .filter((row): row is HistoricalDecision => row !== null);

  if (completed.length < 3) {
    return {
      predicted_success_probability: 50, // uninformed prior
      similar_decisions_count: 0,
      similar_decisions_avg_outcome: null,
      similar_decisions_success_rate: null,
      confidence_factors: [
        {
          factor: "insufficient_history",
          direction: "neutral",
          weight: 0,
          explanation: `Only ${completed.length} completed decisions have direction-aware evaluated outcomes. Need ≥3 for statistical prediction.`,
        },
      ],
      model_version: 2,
    };
  }

  // 2. Base rate: percentage of historically evaluated decisions that succeeded.
  const successfulOutcomes = completed.filter(d => d.outcome_success === 1);
  const baseRate = successfulOutcomes.length / completed.length;

  factors.push({
    factor: "base_rate",
    direction: baseRate >= 0.6 ? "positive" : baseRate <= 0.4 ? "negative" : "neutral",
    weight: 0.3,
    explanation: `Org base rate: ${Math.round(baseRate * 100)}% successful outcomes across ${completed.length} direction-aware evaluations`,
  });

  // 3. Confidence calibration adjustment.
  let confAdjustment = 0;
  if (decision.capped_confidence != null) {
    const decisionConfidence = Number(decision.capped_confidence);
    const similarConf = completed.filter(d =>
      d.capped_confidence != null &&
      Math.abs(Number(d.capped_confidence) - decisionConfidence) < (decisionConfidence > 1 ? 15 : 0.15)
    );

    if (similarConf.length >= 2) {
      const actualSuccessRate = similarConf.filter(d => d.outcome_success === 1).length / similarConf.length;
      const statedConfRate = confidenceRate(decisionConfidence);
      confAdjustment = actualSuccessRate - statedConfRate;

      factors.push({
        factor: "confidence_calibration",
        direction: confAdjustment > 0.05 ? "positive" : confAdjustment < -0.05 ? "negative" : "neutral",
        weight: 0.25,
        explanation: `At ${Math.round(statedConfRate * 100)}% confidence, historical success rate is ${Math.round(actualSuccessRate * 100)}% (${confAdjustment > 0 ? "better" : "worse"} than stated confidence)`,
      });
    }
  }

  // 4. Decision type pattern matching.
  const sameType = completed.filter(d => d.decision_type === decision.decision_type);
  let typeAdjustment = 0;
  if (sameType.length >= 2) {
    const typeSuccessRate = sameType.filter(d => d.outcome_success === 1).length / sameType.length;
    typeAdjustment = typeSuccessRate - baseRate;

    factors.push({
      factor: "decision_type",
      direction: typeAdjustment > 0.05 ? "positive" : typeAdjustment < -0.05 ? "negative" : "neutral",
      weight: 0.2,
      explanation: `"${decision.decision_type}" decisions: ${Math.round(typeSuccessRate * 100)}% success rate (${sameType.length} decisions)`,
    });
  }

  // 5. Similar decisions (from vector search) outcome analysis.
  let similarAdjustment = 0;
  let similarAvgOutcome: number | null = null;
  let similarSuccessRate: number | null = null;
  let similarCount = 0;

  if (similarDecisionIds.length > 0) {
    const similar = completed.filter(d => similarDecisionIds.includes(d.id));
    similarCount = similar.length;

    if (similar.length >= 1) {
      const numericDeltas = similar
        .map(d => Number(d.outcome_delta))
        .filter(Number.isFinite);
      similarAvgOutcome = numericDeltas.length > 0
        ? numericDeltas.reduce((sum, value) => sum + value, 0) / numericDeltas.length
        : null;
      similarSuccessRate = similar.filter(d => d.outcome_success === 1).length / similar.length;
      similarAdjustment = similarSuccessRate - baseRate;

      const avgOutcomeText = similarAvgOutcome == null
        ? "raw outcome magnitude unavailable"
        : `avg raw outcome delta ${similarAvgOutcome > 0 ? "+" : ""}${similarAvgOutcome.toFixed(1)}%`;
      factors.push({
        factor: "similar_decisions",
        direction: similarAdjustment > 0.05 ? "positive" : similarAdjustment < -0.05 ? "negative" : "neutral",
        weight: 0.25,
        explanation: `${similar.length} semantically similar past decisions: ${Math.round(similarSuccessRate * 100)}% success rate, ${avgOutcomeText}`,
      });
    }
  }

  // 6. Fetch calibration model for final correction.
  const { data: calModels } = await svc
    .from("calibration_models")
    .select("band_corrections, overall_bias_direction")
    .eq("organization_id", orgId)
    .order("computed_at", { ascending: false })
    .limit(1);

  let calAdjustment = 0;
  if (calModels && calModels.length > 0 && decision.capped_confidence != null) {
    const cal = calModels[0] as any;
    const corrections = cal.band_corrections;
    if (corrections && typeof corrections === "object") {
      const normalizedConfidence = confidenceRate(Number(decision.capped_confidence)) * 100;
      const confBand = Math.floor(normalizedConfidence / 10) * 10;
      const bandKey = `${confBand}-${confBand + 10}`;
      const correction = corrections[bandKey];
      if (typeof correction === "number") {
        calAdjustment = correction / 100;
        factors.push({
          factor: "calibration_correction",
          direction: calAdjustment > 0.02 ? "positive" : calAdjustment < -0.02 ? "negative" : "neutral",
          weight: 0.15,
          explanation: `Bayesian calibration model correction: ${calAdjustment > 0 ? "+" : ""}${Math.round(calAdjustment * 100)}pp for ${bandKey}% confidence band`,
        });
      }
    }
  }

  // 7. Combine all factors into final prediction.
  let predicted = baseRate;
  if (confAdjustment !== 0) predicted += confAdjustment * 0.25;
  if (typeAdjustment !== 0) predicted += typeAdjustment * 0.2;
  if (similarAdjustment !== 0) predicted += similarAdjustment * 0.25;
  if (calAdjustment !== 0) predicted += calAdjustment * 0.15;

  // Clamp to [5%, 95%] — never be absolutely certain.
  predicted = Math.max(0.05, Math.min(0.95, predicted));

  return {
    predicted_success_probability: Math.round(predicted * 100),
    similar_decisions_count: similarCount,
    similar_decisions_avg_outcome: similarAvgOutcome,
    similar_decisions_success_rate: similarSuccessRate != null ? Math.round(similarSuccessRate * 100) : null,
    confidence_factors: factors,
    model_version: 2,
  };
}
