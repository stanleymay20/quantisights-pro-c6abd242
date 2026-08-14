import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/auto-create-decisions/index.ts"), "utf8");

describe("auto-created decision impact integrity", () => {
  it("does not manufacture monetary impact from insight severity or category", () => {
    expect(source).not.toContain("estimateInsightImpact(i)");
    expect(source).not.toContain("function estimateInsightImpact");
    expect(source).not.toContain("severityBase = severity === \"critical\" ? 50000 : 25000");
    expect(source).not.toContain("variance * 1000");
  });

  it("keeps insight-only financial impact unquantified until an evidence-backed monetary model exists", () => {
    const normalizeInsightStart = source.indexOf("function normalizeInsight");
    const buildDecisionStart = source.indexOf("function buildDecisionRow", normalizeInsightStart);
    const normalizeInsight = source.slice(normalizeInsightStart, buildDecisionStart);

    expect(normalizeInsight).toContain("expected_impact: null");
    expect(source).toContain("No evidence-backed monetary impact model was available for this insight");
  });
});
