import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const review = read("src/components/decisions/ExecutiveReviewFlow.tsx");
const outcome = read("src/components/decisions/OutcomePredictionPanel.tsx");

describe("primary executive review impact integrity", () => {
  it("uses the shared evidence-safe option comparison instead of a second canned alternative model", () => {
    expect(review).toContain("DecisionOptionComparison");
    expect(review).toContain("buildDecisionOptions");
    expect(review).toContain("traceabilityFromExecutiveDecision");
    expect(review).not.toContain("function AlternativeOption");
    expect(review).not.toContain("Alternative A — smaller pilot");
    expect(review).not.toContain("Alternative B — escalate to governance");
  });

  it("preserves impact provenance when the recommended option is built", () => {
    expect(review).toContain("classifyExecutiveDecisionImpact");
    expect(review).toContain("impactClassification");
    expect(review).toContain("predictedImpactStatus: impactClassification.status");
    expect(review).toContain("predictedImpactLabel: impactClassification.label");
    expect(review).not.toContain("formatEuro(decision.predicted_net_impact)");
    expect(review).toContain("impactClassification.label");
  });

  it("does not turn a heuristic financial estimate into an outcome success target", () => {
    expect(outcome).toContain("classifyExecutiveDecisionImpact");
    expect(outcome).toContain("impactClassification.status === \"modeled\"");
    expect(outcome).not.toContain("formatEuro(decision.predicted_net_impact)");
    expect(outcome).not.toContain("decision.predicted_net_impact != null");
    expect(outcome).toContain("Only linked simulation output is treated as a financial target");
  });
});
