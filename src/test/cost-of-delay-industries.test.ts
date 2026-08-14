import { describe, it, expect } from "vitest";
import { computeCostOfDelay, type CostOfDelayInput } from "../lib/cost-of-delay";
import { generateRecommendation, type RecommendationInput } from "../lib/decision-recommendation";

// Helper: base input for CoD
function codInput(overrides: Partial<CostOfDelayInput> = {}): CostOfDelayInput {
  return {
    severity: "high",
    confidence: 70,
    revenue: 10_000_000,
    ageDays: 5,
    ...overrides,
  };
}

// Helper: base input for recommendation playbook tests.
// These fixtures exercise domain-specific action generation, so they carry
// explicit verified provenance instead of bypassing the production hard gate.
function recInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    signalType: "signal",
    severity: "high",
    confidence: 70,
    sampleSize: 50,
    datasetId: "test-dataset-cross-industry",
    sourceEntityId: "test-insight-cross-industry",
    dataRowsUsed: 50,
    ...overrides,
  };
}

describe("Cost of Delay — Cross-Industry Scoring", () => {
  describe("Metric urgency multipliers", () => {
    it("safety metrics score higher than generic", () => {
      const safety = computeCostOfDelay(codInput({ affectedMetricType: "safety_incident_rate" }));
      const generic = computeCostOfDelay(codInput({ affectedMetricType: "misc_metric" }));
      expect(safety.score).toBeGreaterThan(generic.score);
    });

    it("patient/mortality metrics have highest urgency", () => {
      const mortality = computeCostOfDelay(codInput({ affectedMetricType: "mortality_rate" }));
      const revenue = computeCostOfDelay(codInput({ affectedMetricType: "revenue" }));
      expect(mortality.score).toBeGreaterThan(revenue.score);
    });

    it("compliance metrics score higher than growth", () => {
      const compliance = computeCostOfDelay(codInput({ affectedMetricType: "compliance_breach" }));
      const growth = computeCostOfDelay(codInput({ affectedMetricType: "growth" }));
      expect(compliance.score).toBeGreaterThan(growth.score);
    });

    it("fraud urgency exceeds revenue urgency", () => {
      const fraud = computeCostOfDelay(codInput({ affectedMetricType: "fraud_detection" }));
      const rev = computeCostOfDelay(codInput({ affectedMetricType: "revenue" }));
      expect(fraud.score).toBeGreaterThan(rev.score);
    });

    it("outage urgency matches regulatory", () => {
      const outage = computeCostOfDelay(codInput({ affectedMetricType: "outage" }));
      const reg = computeCostOfDelay(codInput({ affectedMetricType: "regulatory" }));
      expect(outage.score).toBe(reg.score);
    });

    it("downtime has higher urgency than inventory", () => {
      const downtime = computeCostOfDelay(codInput({ affectedMetricType: "downtime" }));
      const inventory = computeCostOfDelay(codInput({ affectedMetricType: "inventory" }));
      expect(downtime.score).toBeGreaterThan(inventory.score);
    });
  });

  describe("Revenue exposure tiers", () => {
    const base = { severity: "high" as const, confidence: 80, revenue: 1_000_000, ageDays: 0 };

    it("Tier 1 (safety) uses ~10% base rate", () => {
      const r = computeCostOfDelay(codInput({ ...base, affectedMetricType: "safety" }));
      expect(r.estimatedDelayCost).toContain("/week");
      expect(r.estimatedDelayCost).toContain("exposure");
    });

    it("Tier 2 (churn) uses ~8% base rate", () => {
      const r = computeCostOfDelay(codInput({ ...base, affectedMetricType: "churn" }));
      expect(r.estimatedDelayCost).toContain("/week");
    });

    it("Tier 3 (revenue) uses ~7% base rate", () => {
      const r = computeCostOfDelay(codInput({ ...base, affectedMetricType: "revenue" }));
      expect(r.estimatedDelayCost).toContain("/week");
    });

    it("Tier 4 (generic) uses ~5% base rate", () => {
      const r = computeCostOfDelay(codInput({ ...base, affectedMetricType: "misc" }));
      expect(r.estimatedDelayCost).toContain("/week");
    });
  });

  describe("Currency safety", () => {
    it("without revenue or impact, no € shown", () => {
      const r = computeCostOfDelay(codInput({ revenue: undefined, predictedNetImpact: undefined }));
      expect(r.estimatedDelayCost).not.toContain("€");
    });

    it("with predicted net impact, € shown", () => {
      const r = computeCostOfDelay(codInput({ revenue: undefined, predictedNetImpact: 500_000 }));
      expect(r.estimatedDelayCost).toContain("€");
    });
  });

  describe("Cross-industry action windows", () => {
    it("critical safety creates a short action window", () => {
      const r = computeCostOfDelay(codInput({ severity: "critical", affectedMetricType: "safety", confidence: 90 }));
      expect(r.recommendedActionWindowDays).toBeLessThanOrEqual(3);
    });

    it("lower severity permits a longer window", () => {
      const critical = computeCostOfDelay(codInput({ severity: "critical", affectedMetricType: "revenue", confidence: 80 }));
      const low = computeCostOfDelay(codInput({ severity: "low", affectedMetricType: "revenue", confidence: 80 }));
      expect(low.recommendedActionWindowDays).toBeGreaterThan(critical.recommendedActionWindowDays);
    });
  });
});

describe("Decision Recommendation — Cross-Industry Owners", () => {
  const cases: [string, string][] = [
    ["mortality_rate", "CMO"],
    ["patient_safety", "CMO"],
    ["clinical_outcome", "CMO"],
    ["trir_safety", "Safety"],
    ["compliance_rate", "Compliance"],
    ["fraud_rate", "CRO"],
    ["liquidity_ratio", "CFO"],
    ["credit_exposure", "CRO"],
    ["downtime", "Operations"],
    ["defect_rate", "Quality"],
    ["yield_rate", "Manufacturing"],
    ["emission_intensity", "Sustainability"],
    ["inventory_turnover", "Supply Chain"],
    ["procurement_cycle", "Procurement"],
    ["enrollment_rate", "Enrollment"],
    ["vacancy_rate", "Leasing"],
    ["occupancy_rate", "Revenue Management"],
  ];

  it.each(cases)("metric=%s → owner contains %s", (metric, expected) => {
    const r = generateRecommendation(recInput({ metricType: metric }));
    expect(r.suggestedOwner).toContain(expected);
  });

  it("unknown metric → generic owner", () => {
    const r = generateRecommendation(recInput({ metricType: "xyz_unknown" }));
    expect(r.suggestedOwner).toBe("Decision Owner (assign)");
  });
});

describe("Decision Recommendation — Cross-Industry Success Metrics", () => {
  const cases: [string, string, string][] = [
    ["patient", "patient_outcome", "Patient outcome"],
    ["safety", "trir", "TRIR"],
    ["compliance", "regulatory_audit", "Compliance gap"],
    ["fraud", "fraud_detection", "Fraud detection"],
    ["manufacturing", "downtime", "MTTR"],
    ["manufacturing", "defect_rate", "Defect rate"],
    ["supply chain", "inventory_turnover", "Inventory turnover"],
    ["energy", "emission_intensity", "Carbon intensity"],
    ["education", "enrollment_rate", "Retention/enrollment"],
    ["hospitality", "occupancy_rate", "Occupancy rate"],
    ["saas", "churn_rate", "churn rate"],
    ["finance", "revenue", "MRR"],
  ];

  it.each(cases)("category=%s metric=%s → metrics contain '%s'", (cat, met, expected) => {
    const r = generateRecommendation(recInput({ category: cat, metricType: met }));
    const joined = r.successMetrics.join(" ");
    expect(joined.toLowerCase()).toContain(expected.toLowerCase());
  });
});

describe("Decision Recommendation — Cross-Industry Actions", () => {
  it("patient category triggers clinical safety review", () => {
    const r = generateRecommendation(recInput({ category: "patient", message: "Patient adverse event spike detected in ICU ward" }));
    expect(r.recommendedAction.toLowerCase()).toContain("clinical");
  });

  it("compliance triggers gap assessment", () => {
    const r = generateRecommendation(recInput({ category: "compliance", message: "Regulatory compliance gap identified in quarterly audit" }));
    expect(r.recommendedAction.toLowerCase()).toContain("compliance");
  });

  it("fraud triggers investigation", () => {
    const r = generateRecommendation(recInput({ category: "fraud", message: "Suspicious transaction pattern detected across accounts" }));
    expect(r.recommendedAction.toLowerCase()).toContain("fraud");
  });

  it("downtime triggers incident response", () => {
    const r = generateRecommendation(recInput({ metricType: "downtime", message: "Production line downtime exceeded threshold this week" }));
    expect(r.recommendedAction.toLowerCase()).toContain("root cause");
  });

  it("defect triggers Pareto analysis", () => {
    const r = generateRecommendation(recInput({ metricType: "defect", message: "Defect rate spiked 15% in batch production run" }));
    expect(r.recommendedAction.toLowerCase()).toContain("pareto");
  });

  it("inventory triggers supply chain assessment", () => {
    const r = generateRecommendation(recInput({ metricType: "inventory", message: "Inventory stockout risk increasing for critical components" }));
    expect(r.recommendedAction.toLowerCase()).toContain("supply chain");
  });
});
