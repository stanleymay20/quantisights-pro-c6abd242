import { describe, it, expect } from "vitest";
import { generateRecommendation } from "@/lib/decision-recommendation";
import { scoreDecisionQuality, buildConfidenceBasis, buildTraceability } from "@/lib/evidence-contract";
import { computeCostOfDelay } from "@/lib/cost-of-delay";

describe("Decision Intelligence Integrity Tests", () => {
  describe("Recommendation Engine — Evidence Contract", () => {
    it("every recommendation must include assumptions", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "high", confidence: 60, message: "Revenue declined 15% in Q4",
      });
      expect(rec.assumptions).toBeDefined();
      expect(rec.assumptions.length).toBeGreaterThan(0);
    });

    it("every recommendation must include riskIfWrong", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "critical", confidence: 80, message: "Churn spiked to 18%",
      });
      expect(rec.riskIfWrong).toBeDefined();
      expect(rec.riskIfWrong.length).toBeGreaterThan(10);
    });

    it("every recommendation must include confidenceBasis", () => {
      const rec = generateRecommendation({
        signalType: "advisory", severity: "medium", confidence: 55, message: "Cost trend rising",
      });
      expect(rec.confidenceBasis).toBeDefined();
      expect(rec.confidenceBasis.label).toBeTruthy();
    });

    it("every recommendation must include qualityScore", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "high", confidence: 70, message: "Margin compression detected across segments",
      });
      expect(rec.qualityScore).toBeDefined();
      expect(rec.qualityScore.overall).toBeGreaterThanOrEqual(0);
      expect(rec.qualityScore.overall).toBeLessThanOrEqual(100);
      expect(["A", "B", "C", "D", "F"]).toContain(rec.qualityScore.grade);
    });

    it("low-evidence recommendations must be flagged as non-decision-grade", () => {
      const rec = generateRecommendation({
        signalType: "proactive", severity: "low", confidence: 20,
      });
      expect(rec.qualityScore.grade).not.toBe("A");
      expect(rec.isDecisionGrade).toBe(false);
    });
  });

  describe("Output Classification — Every Section Labeled", () => {
    it("every recommendation must have classified sections", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "high", confidence: 65, message: "Revenue dropped 12% month over month",
      });
      expect(rec.sections).toBeDefined();
      expect(rec.sections.length).toBeGreaterThanOrEqual(3);
      rec.sections.forEach(section => {
        expect(["OBSERVED_FACT", "STATISTICAL_INFERENCE", "HEURISTIC_ESTIMATE", "AI_RECOMMENDATION"]).toContain(section.classification);
        expect(section.label).toBeTruthy();
        expect(section.content).toBeTruthy();
      });
    });

    it("sections must separate fact from inference from recommendation", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "critical", confidence: 80, message: "Critical churn spike detected at 18%",
      });
      const classifications = rec.sections.map(s => s.classification);
      expect(classifications).toContain("AI_RECOMMENDATION");
      expect(classifications.some(c => c === "OBSERVED_FACT" || c === "HEURISTIC_ESTIMATE")).toBe(true);
    });
  });

  describe("Traceability — Always Present and Explicit", () => {
    it("unverified recommendations must say so rather than invent a dataset", () => {
      const rec = generateRecommendation({
        signalType: "advisory", severity: "medium", confidence: 55, message: "Cost trend rising steadily over 6 months",
      });
      expect(rec.traceability).toBeDefined();
      expect(rec.traceability.sourceDataset).toBe("Unverified source");
      expect(rec.traceability.isVerifiedSource).toBe(false);
      expect(rec.traceability.generatedAt).toBeTruthy();
      expect(rec.traceability.modelOrHeuristic).toBeTruthy();
      expect(rec.traceability.metricTransformationPath).toBeTruthy();
      expect(rec.isDecisionGrade).toBe(false);
    });

    it("a recommendation with dataset, source entity and rows is verified", () => {
      const rec = generateRecommendation({
        signalType: "signal",
        severity: "high",
        confidence: 75,
        message: "Revenue declined 12% across the observed period",
        sampleSize: 40,
        datasetId: "dataset-1",
        sourceEntityId: "insight-1",
      });
      expect(rec.traceability.sourceDatasetId).toBe("dataset-1");
      expect(rec.traceability.sourceEntityId).toBe("insight-1");
      expect(rec.traceability.isVerifiedSource).toBe(true);
    });
  });

  describe("Fail-Closed Decision Gate", () => {
    it("below-threshold recommendations must suppress strategic advice", () => {
      const rec = generateRecommendation({
        signalType: "proactive", severity: "low", confidence: 15,
      });
      expect(rec.isDecisionGrade).toBe(false);
      expect(rec.decisionGateMessage).toBeTruthy();
      expect(rec.recommendedAction).toContain("Not decision-grade");
    });

    it("decision gate message must explain what is missing", () => {
      const rec = generateRecommendation({
        signalType: "proactive", severity: "low", confidence: 10,
      });
      expect(rec.decisionGateMessage).toContain("Insufficient evidence or provenance");
      expect(rec.qualityScore.hardGateFailures).toContain("unverified source traceability");
    });
  });

  describe("Cost of Delay — No Fabricated Currency", () => {
    it("must show derived currency when revenue is provided (exposure model)", () => {
      const result = computeCostOfDelay({
        severity: "high", confidence: 70, revenue: 1000000,
      });
      expect(result.estimatedDelayCost).toContain("€");
      expect(result.estimatedDelayCost).toContain("/week");
    });

    it("must show currency ONLY with validated predictedNetImpact", () => {
      const result = computeCostOfDelay({
        severity: "high", confidence: 70, predictedNetImpact: 50000,
      });
      expect(result.estimatedDelayCost).toContain("€");
      expect(result.estimatedDelayCost).toContain("/week");
    });
  });

  describe("Decision Quality Scoring", () => {
    it("full verified evidence block scores high", () => {
      const score = scoreDecisionQuality({
        observation: "Revenue declined 15% over 3 months across all segments",
        evidence: ["Q1: €2.1M → Q3: €1.78M", "All 4 segments affected", "Accelerating trend"],
        reasoning: "Sustained multi-segment decline is a measured pattern that warrants driver investigation",
        confidenceBasis: buildConfidenceBasis({ sampleSize: 45, calibrationApplied: true }),
        traceability: buildTraceability({
          datasetId: "dataset-1",
          sourceEntityId: "insight-1",
          dataRowsUsed: 45,
          metricTypes: ["revenue"],
          modelUsed: "Calibrated statistical model",
        }),
        assumptions: ["Trend will continue without intervention", "Causality is not established"],
        limitations: [],
        recommendation: "Investigate candidate drivers via diagnostic engine and monitor KPI weekly",
        expectedImpact: "Prevent further 5-10% decline (€89K-€178K quarterly)",
        riskIfWrong: "If seasonal, intervention cost is wasted but limited to investigation resources",
      });
      expect(score.grade).toBe("A");
      expect(score.isDecisionGrade).toBe(true);
      expect(score.hardGateFailures).toEqual([]);
    });

    it("empty evidence block scores F", () => {
      const score = scoreDecisionQuality({});
      expect(score.grade).toBe("F");
      expect(score.isDecisionGrade).toBe(false);
      expect(score.downgradeReason).toBeTruthy();
    });
  });

  describe("Confidence Basis — Never Unjustified", () => {
    it("heuristic confidence must be labeled", () => {
      const basis = buildConfidenceBasis({ sampleSize: 5, isHeuristic: true });
      expect(basis.label).toContain("Heuristic");
      expect(basis.isHeuristic).toBe(true);
      expect(basis.signalStrength).toBe("weak");
    });

    it("calibrated confidence must be labeled", () => {
      const basis = buildConfidenceBasis({ sampleSize: 50, calibrationApplied: true, totalExpectedDimensions: 5, presentDimensions: 4 });
      expect(basis.label).toContain("Calibrated");
      expect(basis.calibrationApplied).toBe(true);
      expect(basis.signalStrength).toBe("strong");
    });

    it("heuristic with low sample size must flag weak signal", () => {
      const basis = buildConfidenceBasis({ sampleSize: 3 });
      expect(basis.isHeuristic).toBe(true);
      expect(basis.signalStrength).toBe("weak");
    });
  });

  describe("Simulation Integrity", () => {
    it("recommendation with no sample size produces heuristic basis", () => {
      const rec = generateRecommendation({
        signalType: "signal", severity: "high", confidence: 70, message: "Test signal for simulation",
        sampleSize: 0,
      });
      expect(rec.confidenceBasis.isHeuristic).toBe(true);
      expect(rec.confidenceBasis.label).toContain("Heuristic");
      expect(rec.isDecisionGrade).toBe(false);
    });
  });
});
