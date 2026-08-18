import { describe, expect, it } from "vitest";

import {
  AUTO_SELECTED_VISUAL_KINDS,
  NEVER_AUTO_SELECT_VISUALS,
  selectDecisionVisualization,
  type DecisionOutcomeEvidence,
} from "@/lib/decision-visualization";
import type { DecisionRoomDecision } from "@/lib/executive-decision-room";

const baseDecision: DecisionRoomDecision = {
  id: "decision-viz-1",
  organization_id: "org-1",
  decision_type: "operational",
  recommended_action: "Renegotiate supplier contract",
  chosen_action: null,
  decision_status: "pending",
  execution_status: "not_started",
  notes: null,
  source_insight_summary: "Supplier costs increased.",
  recommendation_logic_type: "rule_based",
  decision_origin: "ai_generated",
  raw_confidence: 79,
  capped_confidence: 72,
  confidence_at_decision: 72,
  confidence_cap_reason: null,
  predicted_net_impact: 42000,
  predicted_roi_probability: 68,
  created_at: "2026-08-18T08:00:00.000Z",
  decided_at: null,
  decided_by: null,
  kpi_id: null,
  explanation_metadata: {},
};

describe("Automatic Decision Visualization Engine", () => {
  it("uses simple text for one or two unrelated headline numeric values", () => {
    const selection = selectDecisionVisualization(baseDecision);

    expect(selection.kind).toBe("simple_text");
    expect(selection.data).toHaveLength(2);
    expect(selection.data.map((item) => item.source)).toEqual([
      "decision_ledger.predicted_net_impact",
      "decision_ledger.predicted_roi_probability",
    ]);
    expect(selection.reasons.join(" ")).toMatch(/one or two|2 decision-critical/i);
  });

  it("refuses to manufacture a chart when structured quantitative evidence is absent", () => {
    const selection = selectDecisionVisualization({
      ...baseDecision,
      predicted_net_impact: null,
      predicted_roi_probability: null,
    });

    expect(selection.kind).toBe("none");
    expect(selection.unavailableReason).toMatch(/insufficient recorded evidence/i);
    expect(selection.data).toEqual([]);
    expect(selection.reasons.join(" ")).toMatch(/will not parse numbers out of narrative/i);
  });

  it("selects expected-versus-observed only when both records refer to the same metric", () => {
    const outcome: DecisionOutcomeEvidence = {
      expected_metric: "gross_margin_pct",
      expected_change: 4,
      expected_direction: "increase",
      observed_metric: "gross_margin_pct",
      observed_value_before: 31,
      observed_value_after: 36,
      outcome_status: "measured",
    };

    const selection = selectDecisionVisualization(baseDecision, outcome);

    expect(selection.kind).toBe("actual_vs_expected");
    expect(selection.data.map((item) => item.value)).toEqual([4, 5]);
    expect(selection.provenance).toContain("decision_outcomes.expected_change");
  });

  it("does not compare expected and observed values when the metrics differ", () => {
    const outcome: DecisionOutcomeEvidence = {
      expected_metric: "gross_margin_pct",
      expected_change: 4,
      observed_metric: "revenue_eur",
      observed_value_before: 100,
      observed_value_after: 110,
    };

    const selection = selectDecisionVisualization(baseDecision, outcome);
    expect(selection.kind).toBe("simple_text");
    expect(selection.rejected.find((item) => item.kind === "actual_vs_expected")?.reason).toMatch(/different metrics|incomplete/i);
  });

  it("does not select line, scatter, waterfall, heatmap, or forecast without their required structures", () => {
    const selection = selectDecisionVisualization(baseDecision);
    const rejected = new Set(selection.rejected.map((item) => item.kind));

    for (const kind of ["line", "scatter", "waterfall", "heatmap", "forecast_band"] as const) {
      expect(rejected.has(kind)).toBe(true);
    }
  });

  it("never auto-selects pie, donut, or 3D", () => {
    expect(AUTO_SELECTED_VISUAL_KINDS).not.toContain("pie");
    expect(AUTO_SELECTED_VISUAL_KINDS).not.toContain("donut");
    expect(AUTO_SELECTED_VISUAL_KINDS).not.toContain("3d");
    expect(NEVER_AUTO_SELECT_VISUALS).toEqual(["pie", "donut", "3d"]);
  });
});
