import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("trust-critical iteration 1 — tenant isolation", () => {
  it("requires explicit organization membership before user-triggered embedding", () => {
    const source = read("supabase/functions/embed-decisions/index.ts");

    expect(source).toContain('const isServiceRole = authHeader === `Bearer ${serviceKey}`;');
    expect(source).toContain('svc.rpc("is_org_member"');
    expect(source).toContain('return new Response(JSON.stringify({ error: "Forbidden" })');
    expect(source).not.toContain("authHeader?.includes(serviceKey)");
  });
});

describe("trust-critical iteration 1 — calibration semantics", () => {
  it("does not fabricate forecast accuracy or outcome delta from qualitative feedback", () => {
    const widget = read("src/components/decisions/OutcomeFeedbackWidget.tsx");

    expect(widget).toContain("actual_impact:");
    expect(widget).not.toMatch(/prediction_accuracy_score\s*:/);
    expect(widget).not.toMatch(/outcome_delta\s*:/);
  });

  it("uses only binary targets for AICIS probability calibration", () => {
    const evaluator = read("supabase/functions/aicis-evaluate-outcomes/index.ts");

    expect(evaluator).toContain("binaryOutcomeFromStatus");
    expect(evaluator).toContain("normalizeProbability");
    expect(evaluator).toContain('body.actual_outcome === "positive" ? 1 : 0');
    expect(evaluator).not.toContain("body.actual_value");
    expect(evaluator).not.toContain("d.actual_value > 0 ? 1 : 0");
    expect(evaluator).not.toContain("d.outcome_delta > 0 ? 1 : 0");
  });

  it("enforces probability bounds in the database", () => {
    const migration = read("supabase/migrations/20260814181000_harden_aicis_calibration_bounds.sql");

    expect(migration).toContain("aicis_outcomes_actual_value_probability_check");
    expect(migration).toContain("aicis_outcomes_predicted_value_probability_check");
    expect(migration).toContain("aicis_outcomes_brier_score_check");
    expect(migration).toContain("aicis_outcomes_error_margin_check");
    expect(migration).toContain("actual_value BETWEEN 0 AND 1");
    expect(migration).toContain("predicted_value BETWEEN 0 AND 1");
  });
});

describe("trust-critical iteration 1 — direction-aware learning", () => {
  it("predicts success from evaluated outcome status, not the sign of a metric delta", () => {
    const predictor = read("supabase/functions/_shared/outcome-predictor.ts");

    expect(predictor).toContain('from("decision_outcomes")');
    expect(predictor).toContain("outcome_success");
    expect(predictor).toContain('case "partial_success"');
    expect(predictor).toContain('case "negative_outcome"');
    expect(predictor).not.toContain("Number(d.outcome_delta) >= 0");
  });

  it("uses canonical evaluated outcomes for precedent performance", () => {
    const retrieval = read("supabase/functions/similar-decisions/index.ts");

    expect(retrieval).toContain('from("decision_outcomes")');
    expect(retrieval).toContain("canonicalOutcomeFromStatus");
    expect(retrieval).not.toContain("delta != null && delta > 0");
  });
});
