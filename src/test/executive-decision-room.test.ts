import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildDecisionRoomModel, type DecisionRoomDecision } from "@/lib/executive-decision-room";

const baseDecision: DecisionRoomDecision = {
  id: "decision-1",
  organization_id: "org-1",
  decision_type: "strategic",
  recommended_action: "Renegotiate the supplier agreement",
  chosen_action: null,
  decision_status: "pending",
  execution_status: "not_started",
  notes: null,
  source_insight_summary: "Supplier costs increased 14% over two quarters.",
  recommendation_logic_type: "rule_based",
  decision_origin: "ai_generated",
  capped_confidence: 72,
  confidence_at_decision: 72,
  raw_confidence: 79,
  confidence_cap_reason: "Only two quarters of history are available.",
  predicted_net_impact: 42000,
  predicted_roi_probability: 68,
  outcome_delta: null,
  created_at: "2026-08-18T08:00:00.000Z",
  decided_at: null,
  decided_by: null,
  kpi_id: null,
  explanation_metadata: {
    source_data: {
      dataset_name: "Supplier spend",
      dataset_id: "dataset-1",
      time_range: "Q1-Q2 2026",
      rows_analyzed: 1200,
      key_metrics: ["supplier_cost"],
    },
    statistical_basis: {
      method: "EWMA baseline deviation",
      z_score: 2.4,
      data_points_used: 180,
      note: "Supplier cost moved above its historical band.",
    },
    triggering_insight: {
      metric_name: "supplier_cost",
      description: "Supplier cost increased 14%.",
      change_value: "14%",
      change_direction: "increase",
    },
    reasoning: {
      what_happened: "Supplier cost increased.",
      why_it_matters: "Margins are exposed.",
      why_this_recommendation: "Renegotiation targets the concentrated spend.",
    },
    expected_impact: {
      range: "€30,000 – €55,000 annualized",
      basis: "Contract benchmark spread.",
    },
    assumptions: ["Benchmark pricing remains available."],
    limitations: ["Only two quarters of history are available."],
    confidence_explanation: {
      score: 72,
      meaning: "Moderate-to-high decision-time confidence.",
      capped: true,
      cap_reason: "Limited history.",
    },
  },
};

describe("Executive Decision Room model", () => {
  it("derives a complete executive brief only from stored decision values", () => {
    const model = buildDecisionRoomModel(baseDecision);

    expect(model.recommendation).toBe("Renegotiate the supplier agreement");
    expect(model.confidence).toBe(72);
    expect(model.expectedOutcome).toBe("€30,000 – €55,000 annualized");
    expect(model.actualOutcome).toBeNull();
    expect(model.supportingEvidence.some((item) => item.source.includes("source_data"))).toBe(true);
    expect(model.completeness.complete).toBe(model.completeness.total);
  });

  it("never fabricates missing alternatives, evidence excerpts, confidence, or outcomes", () => {
    const model = buildDecisionRoomModel({
      ...baseDecision,
      recommended_action: null,
      capped_confidence: null,
      confidence_at_decision: null,
      raw_confidence: null,
      predicted_net_impact: null,
      explanation_metadata: {},
      source_insight_summary: null,
    });

    expect(model.recommendation).toBeNull();
    expect(model.confidence).toBeNull();
    expect(model.expectedOutcome).toBeNull();
    expect(model.actualOutcome).toBeNull();
    expect(model.alternatives).toEqual([]);
    expect(model.supportingEvidence).toEqual([]);
    expect(model.completeness.complete).toBe(0);
    expect(model.completeness.missing).toContain("Source context identified");
  });

  it("marks review, execution, and outcome stages according to recorded lifecycle data", () => {
    const pending = buildDecisionRoomModel(baseDecision);
    expect(pending.pipeline.find((stage) => stage.key === "review")?.status).toBe("pending");
    expect(pending.pipeline.find((stage) => stage.key === "execution")?.status).toBe("unavailable");

    const executed = buildDecisionRoomModel({
      ...baseDecision,
      decision_status: "approved",
      decided_at: "2026-08-18T09:00:00.000Z",
      decided_by: "user-1",
      execution_status: "completed",
      execution_started_at: "2026-08-18T10:00:00.000Z",
      execution_completed_at: "2026-08-18T11:00:00.000Z",
      outcome_measured_at: "2026-09-18T11:00:00.000Z",
      actual_value: 17,
    });

    expect(executed.pipeline.find((stage) => stage.key === "review")?.status).toBe("recorded");
    expect(executed.pipeline.find((stage) => stage.key === "execution")?.status).toBe("recorded");
    expect(executed.pipeline.find((stage) => stage.key === "outcome")?.status).toBe("recorded");
  });

  it("surfaces only deterministic stored confidence disagreement as a risk", () => {
    const model = buildDecisionRoomModel({
      ...baseDecision,
      explanation_metadata: {
        ...(baseDecision.explanation_metadata ?? {}),
        dual_layer_enrichment: {
          client_confidence: 82,
          enriched_confidence: 60,
        },
      },
    });

    expect(model.deterministicRisks).toContain(
      "Stored evidence layers disagree materially on confidence (82% vs 60%).",
    );
  });
});

describe("Executive Decision Room route contract", () => {
  it("registers the protected canonical decision-room route in the centralized router", () => {
    const routeTable = readFileSync(resolve(process.cwd(), "src/routes/index.tsx"), "utf8");
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(routeTable).toContain('const ExecutiveDecisionRoom = lazy(() => import("@/pages/ExecutiveDecisionRoom"));');
    expect(routeTable).toContain('{ path: "/decisions/:id/room", element: <ExecutiveDecisionRoom />, layout: "full" }');
    expect(app).not.toContain('path="/decisions/:id/room"');
    expect(app).not.toContain('import("@/pages/ExecutiveDecisionRoom")');
  });
});
