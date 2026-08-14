/**
 * Platform Integrity Acceptance Tests
 *
 * These tests enforce the mandatory engineering standards for decision-grade intelligence.
 * The system MUST fail validation if any of these conditions are violated.
 */

import { describe, it, expect } from "vitest";
import { generateRecommendation } from "@/lib/decision-recommendation";
import { scoreDecisionQuality, buildConfidenceBasis, buildTraceability } from "@/lib/evidence-contract";
import { computeCostOfDelay } from "@/lib/cost-of-delay";

describe("PHASE 2 — Evidence Contract Enforcement", () => {
  it("every recommendation MUST include all evidence block elements", () => {
    const rec = generateRecommendation({
      signalType: "signal",
      severity: "high",
      confidence: 70,
      message: "Revenue declined 15% across all segments in Q4",
      sampleSize: 30,
      datasetId: "ds-revenue",
      sourceEntityId: "insight-revenue-q4",
    });

    expect(rec.whatHappened).toBeTruthy();
    expect(rec.whyItMatters).toBeTruthy();
    expect(rec.recommendedAction).toBeTruthy();
    expect(rec.suggestedOwner).toBeTruthy();
    expect(rec.suggestedDeadlineDays).toBeGreaterThan(0);
    expect(rec.successMetrics.length).toBeGreaterThan(0);
    expect(rec.assumptions.length).toBeGreaterThan(0);
    expect(rec.riskIfWrong.length).toBeGreaterThan(10);
    expect(rec.evidenceBasis.length).toBeGreaterThan(0);
    expect(rec.confidenceBasis).toBeDefined();
    expect(rec.traceability).toBeDefined();
    expect(rec.traceability.isVerifiedSource).toBe(true);
    expect(rec.qualityScore).toBeDefined();
    expect(rec.sections.length).toBeGreaterThanOrEqual(3);
  });

  it("recommendations with missing evidence MUST be downgraded", () => {
    const rec = generateRecommendation({
      signalType: "proactive",
      severity: "low",
      confidence: 15,
    });

    expect(rec.isDecisionGrade).toBe(false);
    expect(rec.decisionGateMessage).toBeTruthy();
    expect(rec.recommendedAction).toContain("Not decision-grade");
  });
});

describe("PHASE 3 — Confidence Hardening", () => {
  it("confidence with <12 samples MUST be labeled heuristic", () => {
    const basis = buildConfidenceBasis({ sampleSize: 5 });
    expect(basis.isHeuristic).toBe(true);
    expect(basis.label).toContain("Heuristic");
    expect(basis.signalStrength).toBe("weak");
  });

  it("confidence with calibration MUST be labeled calibrated", () => {
    const basis = buildConfidenceBasis({
      sampleSize: 50,
      calibrationApplied: true,
      totalExpectedDimensions: 5,
      presentDimensions: 4,
    });
    expect(basis.calibrationApplied).toBe(true);
    expect(basis.label).toContain("Calibrated");
  });

  it("confidence MUST include sample size, coverage, signal strength", () => {
    const basis = buildConfidenceBasis({ sampleSize: 20 });
    expect(basis.sampleSize).toBe(20);
    expect(typeof basis.dataCoverage).toBe("number");
    expect(["strong", "moderate", "weak"]).toContain(basis.signalStrength);
  });
});

describe("PHASE 4 — Cost of Delay Reform", () => {
  it("MUST show derived currency when revenue is provided (exposure model)", () => {
    const result = computeCostOfDelay({
      severity: "high",
      confidence: 70,
      revenue: 5_000_000,
    });
    expect(result.estimatedDelayCost).toContain("€");
    expect(result.estimatedDelayCost).toContain("/week");
  });

  it("MUST show currency ONLY with validated predictedNetImpact", () => {
    const result = computeCostOfDelay({
      severity: "high",
      confidence: 70,
      predictedNetImpact: 100_000,
    });
    expect(result.estimatedDelayCost).toContain("€");
    expect(result.estimatedDelayCost).toContain("/week");
  });

  it("MUST include label classification (low/medium/high/critical)", () => {
    const result = computeCostOfDelay({
      severity: "critical",
      confidence: 90,
    });
    expect(["low", "medium", "high", "critical"]).toContain(result.label);
  });

  it("MUST include action window in days", () => {
    const result = computeCostOfDelay({
      severity: "high",
      confidence: 60,
    });
    expect(result.recommendedActionWindowDays).toBeGreaterThan(0);
  });
});

describe("PHASE 5 — Command Center / Executive Verdict Integrity", () => {
  it("every decision card MUST have classified sections", () => {
    const rec = generateRecommendation({
      signalType: "signal",
      severity: "critical",
      confidence: 80,
      message: "Critical churn spike to 18% — immediate retention risk",
      sampleSize: 25,
      datasetId: "ds-churn",
      sourceEntityId: "insight-churn",
    });

    rec.sections.forEach((section) => {
      expect([
        "OBSERVED_FACT",
        "STATISTICAL_INFERENCE",
        "HEURISTIC_ESTIMATE",
        "AI_RECOMMENDATION",
      ]).toContain(section.classification);
      expect(section.label).toBeTruthy();
      expect(section.content).toBeTruthy();
    });

    const classifications = rec.sections.map((s) => s.classification);
    expect(classifications).toContain("AI_RECOMMENDATION");
  });

  it("executive verdict MUST include owner, deadline, success metrics", () => {
    const rec = generateRecommendation({
      signalType: "advisory",
      severity: "high",
      confidence: 65,
      message: "Cost overrun detected in operations division",
      category: "cost",
    });
    expect(rec.suggestedOwner).toBeTruthy();
    expect(rec.suggestedOwner).not.toBe("");
    expect(rec.suggestedDeadlineDays).toBeGreaterThan(0);
    expect(rec.successMetrics.length).toBeGreaterThan(0);
  });
});

describe("PHASE 7 — Visualization Honesty (Code-Level)", () => {
  it("Cost of Delay MUST NOT produce fabricated currency without revenue OR predictedNetImpact", () => {
    for (const sev of ["critical", "high", "medium", "low"] as const) {
      const result = computeCostOfDelay({
        severity: sev,
        confidence: 80,
      });
      expect(result.estimatedDelayCost).not.toContain("€");
    }
  });

  it("Cost of Delay MUST show derived currency when revenue is provided", () => {
    const result = computeCostOfDelay({
      severity: "high",
      confidence: 80,
      revenue: 10_000_000,
    });
    expect(result.estimatedDelayCost).toContain("€");
  });
});

describe("PHASE 8 — Traceability System", () => {
  it("buildTraceability MUST produce a verified record only with dataset, source entity and rows", () => {
    const trace = buildTraceability({
      datasetId: "ds-123",
      sourceEntityId: "insight-456",
      dataRowsUsed: 500,
      metricTypes: ["revenue", "cost"],
      modelUsed: "Statistical inference",
      limitations: ["Limited to 6 months of data"],
    });

    expect(trace.sourceDataset).toBe("ds-123");
    expect(trace.sourceDatasetId).toBe("ds-123");
    expect(trace.sourceEntityId).toBe("insight-456");
    expect(trace.isVerifiedSource).toBe(true);
    expect(trace.dataRowsUsed).toBe(500);
    expect(trace.metricTransformationPath).toContain("revenue");
    expect(trace.modelOrHeuristic).toBe("Statistical inference");
    expect(trace.generatedAt).toBeTruthy();
    expect(trace.limitations.length).toBeGreaterThan(0);
  });

  it("missing provenance is explicit and cannot pass the decision gate", () => {
    const rec = generateRecommendation({
      signalType: "signal",
      severity: "medium",
      confidence: 55,
      message: "Metric shift detected across the observed window",
      sampleSize: 30,
    });
    expect(rec.traceability).toBeDefined();
    expect(rec.traceability.sourceDataset).toBe("Unverified source");
    expect(rec.traceability.isVerifiedSource).toBe(false);
    expect(rec.isDecisionGrade).toBe(false);
    expect(rec.qualityScore.hardGateFailures).toContain("unverified source traceability");
  });
});

describe("PHASE 9 — Decision Quality Score", () => {
  it("full verified evidence block MUST score grade A or B", () => {
    const score = scoreDecisionQuality({
      observation: "Revenue declined 15% over 3 months across all 4 segments",
      evidence: [
        "Q1: €2.1M → Q3: €1.78M",
        "All 4 segments affected equally",
        "Accelerating decline rate",
      ],
      reasoning:
        "Sustained multi-segment decline is a measured pattern that warrants investigation of competing drivers",
      confidenceBasis: buildConfidenceBasis({
        sampleSize: 45,
        calibrationApplied: true,
      }),
      traceability: buildTraceability({
        datasetId: "ds-revenue",
        sourceEntityId: "insight-revenue",
        dataRowsUsed: 45,
        metricTypes: ["revenue"],
        modelUsed: "Calibrated statistical model",
      }),
      assumptions: ["Trend continues without intervention", "Causality is not established"],
      limitations: [],
      recommendation:
        "Run diagnostic engine to investigate candidate drivers and monitor revenue KPI weekly",
      expectedImpact:
        "Prevent further 5-10% decline (~€89K-€178K quarterly impact)",
      riskIfWrong:
        "If seasonal, investigation cost is limited to team effort allocation",
    });
    expect(["A", "B"]).toContain(score.grade);
    expect(score.isDecisionGrade).toBe(true);
  });

  it("empty evidence block MUST score grade F", () => {
    const score = scoreDecisionQuality({});
    expect(score.grade).toBe("F");
    expect(score.isDecisionGrade).toBe(false);
    expect(score.downgradeReason).toBeTruthy();
  });

  it("partial evidence MUST produce intermediate grade", () => {
    const score = scoreDecisionQuality({
      observation: "Something changed",
      recommendation: "Investigate the issue thoroughly",
    });
    expect(score.overall).toBeGreaterThan(0);
    expect(score.overall).toBeLessThan(80);
    expect(score.isDecisionGrade).toBe(false);
  });
});

describe("PHASE 10 — Fail-Closed Acceptance Tests", () => {
  it("FAIL: financial impact shown without ANY financial basis", () => {
    const result = computeCostOfDelay({
      severity: "critical",
      confidence: 90,
    });
    expect(result.estimatedDelayCost).not.toMatch(/[€$£¥]/);
  });

  it("FAIL: confidence shown without confidence basis", () => {
    const rec = generateRecommendation({
      signalType: "signal",
      severity: "high",
      confidence: 75,
      message: "Test signal",
    });
    expect(rec.confidenceBasis).toBeDefined();
    expect(rec.confidenceBasis.label).toBeTruthy();
    expect(typeof rec.confidenceBasis.sampleSize).toBe("number");
    expect(typeof rec.confidenceBasis.isHeuristic).toBe("boolean");
  });

  it("FAIL: recommendation generated without evidence", () => {
    const rec = generateRecommendation({
      signalType: "proactive",
      severity: "low",
      confidence: 10,
    });
    expect(rec.qualityScore.overall).toBeLessThan(80);
    expect(rec.isDecisionGrade).toBe(false);
  });

  it("FAIL: observed rows without source provenance cannot become an executive verdict", () => {
    const rec = generateRecommendation({
      signalType: "advisory",
      severity: "critical",
      confidence: 85,
      message: "Major risk event detected across the observed window",
      sampleSize: 50,
    });
    expect(rec.traceability).toBeDefined();
    expect(rec.traceability.isVerifiedSource).toBe(false);
    expect(rec.traceability.sourceDataset).toBe("Unverified source");
    expect(rec.isDecisionGrade).toBe(false);
    expect(rec.qualityScore.hardGateFailures).toContain("unverified source traceability");
  });

  it("FAIL: generic advisory text must not pass quality gate", () => {
    const rec = generateRecommendation({
      signalType: "proactive",
      severity: "low",
      confidence: 20,
    });
    expect(rec.qualityScore.grade).not.toBe("A");
    expect(rec.isDecisionGrade).toBe(false);
  });
});
