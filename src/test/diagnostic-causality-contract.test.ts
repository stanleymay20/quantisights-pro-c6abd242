import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const engine = read("supabase/functions/diagnostic-engine/index.ts");
const card = read("src/components/diagnostics/DiagnosticCard.tsx");
const page = read("src/pages/Diagnostics.tsx");
const changepoint = read("supabase/functions/_shared/changepoint.ts");

describe("diagnostic epistemic / causality contract", () => {
  it("never prompts the model to perform root-cause analysis as fact", () => {
    expect(engine).not.toContain("performing root cause analysis");
    expect(engine).toContain("It does NOT establish causality");
    expect(engine).toContain("Never claim that a factor caused a metric movement");
  });

  it("forces diagnostic outputs to declare causality not established", () => {
    expect(engine).toContain('causal_status: "not_established" as const');
    expect(engine).toContain("Driver hypothesis (causality not established)");
    expect(engine).toContain("Associated evidence (not causal)");
  });

  it("uses deterministic structural-break evidence without upgrading it to causal proof", () => {
    expect(engine).toContain("detectChangepoints(values, dates)");
    expect(engine).toContain('return stat?.structural_breaks?.length ? "temporal_break" : "descriptive"');
    expect(changepoint).toContain("CUSUM-style structural-break detector");
    expect(changepoint).toContain("It is NOT proof");
  });

  it("classifies trends against the KPI's desired direction", () => {
    expect(engine).toContain("inferExpectedOutcomeDirection(metricType)");
    expect(engine).toContain('expectedDirection === "decrease"');
    expect(engine).toContain("slopeNormalizedPct < -5");
    expect(engine).toContain('trendDirection: movingInDesiredDirection ? "improving" : "declining"');
    expect(engine).toContain("trend_direction: computedTrend");
  });

  it("does not allow the LLM to override direction-aware computed trend labels", () => {
    expect(engine).toContain("COPY the computed trend_direction");
    expect(engine).toContain("Computed direction-aware trend is authoritative");
    expect(engine).not.toContain("trend_direction: interpreted.trend_direction || matchingStat?.trend_direction");
  });

  it("removes causal labels from the executive diagnostic UI", () => {
    expect(page).not.toContain("Root cause analysis & causal pattern detection");
    expect(page).toContain("Statistical patterns, structural breaks & driver hypotheses");
    expect(card).not.toContain(">Root Cause Analysis<");
    expect(card).not.toContain(">Causal Factors<");
    expect(card).toContain("Driver Hypothesis");
    expect(card).toContain("Associated Statistical Evidence");
    expect(card).toContain("Causality not established");
  });

  it("surfaces desired KPI direction next to the diagnostic trend", () => {
    expect(page).toContain('expected_direction?: "increase" | "decrease" | "stable"');
    expect(card).toContain("Desired: {desiredDirection}");
    expect(card).toContain("Desired direction: {desiredDirection}");
    expect(card).toContain("{d.trend_direction} · {formattedChange}");
  });

  it("normalizes compatibility prefixes instead of duplicating them", () => {
    expect(engine).toContain("replace(/^driver hypothesis");
    expect(engine).toContain("replace(/^associated evidence");
  });

  it("states that changepoints are temporal evidence, not causes", () => {
    expect(card).toContain("it does not identify the cause of the change");
    expect(engine).toContain("A changepoint is temporal structural-break evidence only, never causal evidence");
  });
});
