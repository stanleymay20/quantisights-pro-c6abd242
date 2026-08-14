import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  inferExpectedOutcomeDirection,
  outcomeSucceededForDirection,
} from "@/lib/outcome-direction";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outcome direction contract", () => {
  it.each([
    "churn_rate",
    "cost per unit",
    "supplier risk",
    "mortality rate",
    "system downtime",
    "carbon emissions",
    "fraud losses",
    "response_time",
  ])("recognizes lower-is-better KPI %s", (metric) => {
    expect(inferExpectedOutcomeDirection(metric)).toBe("decrease");
  });

  it.each([
    "revenue",
    "retention_rate",
    "conversion rate",
    "gross profit",
    "customer satisfaction",
    "throughput",
  ])("keeps higher-is-better/default KPI %s as increase", (metric) => {
    expect(inferExpectedOutcomeDirection(metric)).toBe("increase");
  });

  it("evaluates signed outcome deltas relative to desired direction", () => {
    expect(outcomeSucceededForDirection(12, "increase")).toBe(true);
    expect(outcomeSucceededForDirection(-12, "increase")).toBe(false);
    expect(outcomeSucceededForDirection(-12, "decrease")).toBe(true);
    expect(outcomeSucceededForDirection(12, "decrease")).toBe(false);
    expect(outcomeSucceededForDirection(0.5, "stable")).toBe(true);
    expect(outcomeSucceededForDirection(4, "stable")).toBe(false);
  });

  it("removes hard-coded increase defaults from all scheduling entry points", () => {
    const lifecycle = read("src/lib/lifecycle/execution.ts");
    const hook = read("src/hooks/useDecisionPerformance.ts");
    const edge = read("supabase/functions/evaluate-outcomes/index.ts");

    expect(lifecycle).toContain("inferExpectedOutcomeDirection(resolvedMetric)");
    expect(lifecycle).not.toContain('expected_direction: "increase"');
    expect(hook).toContain("inferExpectedOutcomeDirection(params.expectedMetric)");
    expect(hook).not.toContain('params.expectedDirection || "increase"');
    expect(edge).toContain("normalizeExpectedOutcomeDirection(body.expected_direction, body.expected_metric)");
    expect(edge).not.toContain('body.expected_direction || "increase"');
  });

  it("makes the approval RPC infer direction and repairs lower-is-better history", () => {
    const migration = read("supabase/migrations/20260814155500_repair_outcome_direction_contract.sql");
    expect(migration).toContain("public.infer_expected_direction(v_resolved_metric)");
    expect(migration).toContain("SET expected_direction = 'decrease'");
  });

  it("does not use positive outcome delta as a universal historical success test", () => {
    const predictor = read("supabase/functions/_shared/outcome-predictor.ts");
    const similar = read("supabase/functions/similar-decisions/index.ts");

    expect(predictor).not.toContain("Number(d.outcome_delta) >= 0");
    expect(similar).not.toContain("delta != null && delta > 0");
    expect(predictor).toContain("expectedDirection === \"decrease\"");
    expect(similar).toContain("direction === \"decrease\"");
  });

  it("compares forecast accuracy against signed expected change", () => {
    const edge = read("supabase/functions/evaluate-outcomes/index.ts");
    expect(edge).toContain("signedExpectedChange");
    expect(edge).toContain("observedChange - expectedSignedChange");
  });
});
