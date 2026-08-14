import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const evaluator = read("supabase/functions/aicis-evaluate-outcomes/index.ts");
const widget = read("src/components/decisions/OutcomeFeedbackWidget.tsx");
const boundsMigration = read("supabase/migrations/20260814182000_harden_aicis_probability_bounds.sql");

// These tests intentionally assert both application semantics and the database
// constraint layer so future UI/edge-function regressions cannot corrupt calibration.
describe("AICIS outcome calibration semantics", () => {
  it("never uses business impact as the binary Brier target", () => {
    expect(evaluator).toContain("const riskEventActual = businessSuccess ? 0 : 1;");
    expect(evaluator).toContain("Math.pow(predicted - riskEventActual, 2)");
    expect(evaluator).not.toContain("Math.pow(predicted - actual, 2)");
    expect(evaluator).not.toContain('if (typeof body.actual_value === "number") actual = body.actual_value');
  });

  it("maps a positive business outcome to no adverse risk event", () => {
    expect(evaluator).toContain('body.actual_outcome === "positive"');
    expect(evaluator).toContain("const riskEventActual = businessSuccess ? 0 : 1;");
  });

  it("does not manufacture prediction accuracy from a yes/no verdict", () => {
    expect(widget).not.toContain("prediction_accuracy_score");
    expect(widget).not.toContain("outcome_delta");
    expect(widget).toContain("actual_value: actualValue");
    expect(evaluator).not.toContain("prediction_accuracy_score:");
  });

  it("requires a known expected direction for automatically inferred success", () => {
    expect(evaluator).toContain("directionByDecision");
    expect(evaluator).toContain("successFromMeasurement");
    expect(evaluator).toContain("outcome_skipped_no_directional_signal");
  });

  it("normalizes percentage probabilities before Brier scoring", () => {
    expect(evaluator).toContain("raw > 1 && raw <= 100 ? raw / 100 : raw");
    expect(evaluator).toContain("normalized >= 0 && normalized <= 1");
  });

  it("enforces the probability domain at the database boundary", () => {
    expect(boundsMigration).toContain("aicis_outcomes_actual_value_binary_check");
    expect(boundsMigration).toContain("actual_value IN (0, 1)");
    expect(boundsMigration).toContain("predicted_value BETWEEN 0 AND 1");
    expect(boundsMigration).toContain("brier_score BETWEEN 0 AND 1");
    expect(boundsMigration).toContain("error_margin BETWEEN 0 AND 1");
  });
});
