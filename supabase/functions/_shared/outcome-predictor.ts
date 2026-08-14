/**
 * Outcome Predictor — Predictive scoring using historical decision-outcome pairs.
 *
 * This is NOT an LLM call. It uses statistical analysis of similar past decisions
 * to predict success probability. Success is evaluated against each outcome's
 * expected direction; a negative delta can be a success for churn, cost, risk,
 * mortality, downtime, emissions, etc.
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

type ExpectedDirection = "increase" | "decrease" | "stable";

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
};

function isSuccessfulOutcome(
  decision: HistoricalDecision,
  expectedDirection: ExpectedDirection | undefined,
): boolean | null {
  if (!expectedDirection) return null;
  const delta = Number(decision.outcome_delta);
  if (!Number.isFinite(delta)) return null;

  if (expectedDirection === "increase") return delta > 0;
  if (expectedDirection === "decrease") return delta < 0;
  return Math.abs(delta) <= 1;
}

/**
 * Predict outcome success probability using historical decision-outcome data.
 *
 * Methodology:
 * 1. Find decisions with measured outcomes in the same org
 * 2. Resolve the expected direction for each outcome
 * 3. Compute direction-aware success base rates
 * 4. Adjust for confidence level, decision type, and semantic similarity
 * 5. Incorporate calibration model corrections if available
 *
 * Rows without a known expected direction are excluded from success-rate
 * learning rather than being silently treated as "positive delta = success".
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

  const { data: historicalDecisions } = await svc
    .from("decision_ledger")
    .select(
      "id, recommended_action, decision_type, capped_confidence, predicted_net_impact, " +
      "outcome_delta, prediction_accuracy_score, calibration_error, execution_status"
    )
    .eq("organization_id", orgId)
    .eq("execution_status", "completed")
    .not("outcome_delta", "is", null);

  const completed = (historicalDecisions || []) as HistoricalDecision[];

  const directionByDecision = new Map<string, ExpectedDirection>();
  if (completed.length > 0) {
    const { data: outcomeDefinitions } = await svc
      .from("decision_outcomes")
      .select("decision_id, expected_direction")
      .eq("organization_id", orgId)
      .in("decision_id", completed.map(d => d.id))
      .limit(2000);

    for (const row of outcomeDefinitions || []) {
      if (
        !directionByDecision.has(row.decision_id) &&
        ["increase", "decrease", "stable"].includes(row.expected_direction)
      ) {
        directionByDecision.set(row.decision_id, row.expected_direction as ExpectedDirection);
      }
    }
  }

  const evaluable = completed
    .map(d => ({ decision: d, success: isSuccessfulOutcome(d, directionByDecision.get(d.id)) }))
    .filter((item): item is { decision: HistoricalDecision; success: boolean } => item.success !== null);

  if (evaluable.length < 3) {
    return {
      predicted_success_probability: 50,
      similar_decisions_count: 0,
      similar_decisions_avg_outcome: null,
      similar_decisions_success_rate: null,
      confidence_factors: [
        {
          factor: "insufficient_history",
          direction: "neutral",
          weight: 0,
          explanation: `Only ${evaluable.length} direction-aware completed decisions with outcomes. Need ≥3 for statistical prediction.`,
        },
      ],
      model_version: 2,
    };
  }

  const successCount = evaluable.filter(item => item.success).length;
  const baseRate = successCount / evaluable.length;

  factors.push({
    factor: "base_rate",
    direction: baseRate >= 0.6 ? "positive" : baseRate <= 0.4 ? "negative" : "neutral",
    weight: 0.3,
    explanation: `Org base rate: ${Math.round(baseRate * 100)}% successful outcomes across ${evaluable.length} direction-aware decisions`,
  });

  let confAdjustment = 0;
  if (decision.capped_confidence != null) {
    const similarConf = evaluable.filter(
      ({ decision: d }) =>
        d.capped_confidence != null &&
        Math.abs(Number(d.capped_confidence) - decision.capped_confidence!) < 15
    );

    if (similarConf.length >= 2) {
      const actualSuccessRate = similarConf.filter(item => item.success).length / similarConf.length;
      const statedConfRate = decision.capped_confidence / 100;
      confAdjustment = actualSuccessRate - statedConfRate;

      factors.push({
        factor: "confidence_calibration",
        direction: confAdjustment > 0.05 ? "positive" : confAdjustment < -0.05 ? "negative" : "neutral",
        weight: 0.25,
        explanation: `At ${decision.capped_confidence}% confidence, direction-aware historical success is ${Math.round(actualSuccessRate * 100)}% (${confAdjustment > 0 ? "better" : "worse"} than stated confidence)`,
      });
    }
  }

  const sameType = evaluable.filter(
    ({ decision: d }) => d.decision_type === decision.decision_type
  );
  let typeAdjustment = 0;
  if (sameType.length >= 2) {
    const typeSuccessRate = sameType.filter(item => item.success).length / sameType.length;
    typeAdjustment = typeSuccessRate - baseRate;

    factors.push({
      factor: "decision_type",
      direction: typeAdjustment > 0.05 ? "positive" : typeAdjustment < -0.05 ? "negative" : "neutral",
      weight: 0.2,
      explanation: `"${decision.decision_type}" decisions: ${Math.round(typeSuccessRate * 100)}% direction-aware success rate (${sameType.length} decisions)`,
    });
  }

  let similarAdjustment = 0;
  let similarAvgOutcome: number | null = null;
  let similarSuccessRate: number | null = null;
  let similarCount = 0;

  if (similarDecisionIds.length > 0) {
    const similar = evaluable.filter(({ decision: d }) => similarDecisionIds.includes(d.id));
    similarCount = similar.length;

    if (similar.length >= 1) {
      similarAvgOutcome = similar.reduce(
        (sum, item) => sum + Number(item.decision.outcome_delta),
        0,
      ) / similar.length;
      similarSuccessRate = similar.filter(item => item.success).length / similar.length;
      similarAdjustment = similarSuccessRate - baseRate;

      factors.push({
        factor: "similar_decisions",
        direction: similarAdjustment > 0.05 ? "positive" : similarAdjustment < -0.05 ? "negative" : "neutral",
        weight: 0.25,
        explanation: `${similar.length} semantically similar past decisions: ${Math.round(similarSuccessRate * 100)}% direction-aware success rate, avg signed outcome delta ${similarAvgOutcome > 0 ? "+" : ""}${similarAvgOutcome.toFixed(1)}%`,
      });
    }
  }

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
      const confBand = Math.floor(decision.capped_confidence / 10) * 10;
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

  let predicted = baseRate;
  if (confAdjustment !== 0) predicted += confAdjustment * 0.25;
  if (typeAdjustment !== 0) predicted += typeAdjustment * 0.2;
  if (similarAdjustment !== 0) predicted += similarAdjustment * 0.25;
  if (calAdjustment !== 0) predicted += calAdjustment * 0.15;

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
