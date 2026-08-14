import { describe, expect, it } from "vitest";
import {
  buildConfidenceBasis,
  scoreDecisionQuality,
} from "@/lib/evidence-contract";
import { generateRecommendation } from "@/lib/decision-recommendation";

const polishedButDataFree = {
  observation: "Revenue appears to be declining across several important commercial segments.",
  evidence: ["Confidence: 78% (high confidence)"],
  reasoning: "The narrative is detailed enough to sound persuasive even though no observed rows support it.",
  confidenceBasis: buildConfidenceBasis({ sampleSize: 0, calibrationApplied: false }),
  assumptions: ["The apparent trend continues"],
  limitations: ["No measured data supplied"],
  recommendation: "Investigate the metric immediately, assign an owner, and monitor the KPI against a baseline every week.",
  expectedImpact: "Potentially prevent a 10% decline and preserve material business value.",
  riskIfWrong: "Resources may be allocated to a problem that has not actually been established.",
};

describe("decision-quality hard evidence gate", () => {
  it("never promotes zero-data polished prose to decision-grade intelligence", () => {
    const score = scoreDecisionQuality(polishedButDataFree);

    expect(score.overall).toBeGreaterThanOrEqual(45);
    expect(score.isDecisionGrade).toBe(false);
    expect(["D", "F"]).toContain(score.grade);
    expect(score.hardGateFailures).toContain("no observed data points");
    expect(score.hardGateFailures).toContain("no measurable data coverage");
    expect(score.hardGateFailures).toContain("no substantive evidence");
  });

  it("reports zero coverage when zero observations are available", () => {
    const basis = buildConfidenceBasis({ sampleSize: 0 });
    expect(basis.dataCoverage).toBe(0);
    expect(basis.label).toContain("0 observed data points");
  });

  it("suppresses generated strategic advice when sample size is zero", () => {
    const recommendation = generateRecommendation({
      signalType: "proactive",
      metricType: "churn",
      trendDirection: "up",
      severity: "critical",
      confidence: 85,
      message: "Churn appears elevated and should be investigated immediately",
      sampleSize: 0,
    });

    expect(recommendation.isDecisionGrade).toBe(false);
    expect(recommendation.qualityScore.hardGateFailures).toContain("no observed data points");
    expect(recommendation.recommendedAction).toContain("Not decision-grade");
  });

  it("still allows a genuinely evidenced block to pass", () => {
    const score = scoreDecisionQuality({
      observation: "Revenue declined 15% over 45 observed daily measurements across all segments.",
      evidence: ["45 daily measurements", "Revenue: €2.1M to €1.78M", "All four segments declined"],
      reasoning: "The measured multi-segment decline is persistent across the observed period.",
      confidenceBasis: buildConfidenceBasis({ sampleSize: 45, calibrationApplied: true }),
      assumptions: ["Historical measurement definitions remained consistent"],
      limitations: ["No causal attribution established"],
      recommendation: "Investigate candidate drivers and monitor revenue weekly against the measured baseline.",
      expectedImpact: "Prevent further 5-10% revenue deterioration.",
      riskIfWrong: "Investigation time may be spent on a trend that later reverses.",
    });

    expect(score.hardGateFailures).toEqual([]);
    expect(score.isDecisionGrade).toBe(true);
  });
});
