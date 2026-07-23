import { describe, it, expect } from "vitest";
import { buildCopilotBrief } from "@/lib/semantic/data-copilot";
import { computeTrustScore } from "@/lib/semantic/trust-score";

describe("Trust Score", () => {
  it("returns A+ for clean inputs", () => {
    const t = computeTrustScore({
      diagnostics: {
        healthScore: 98, schemaConfidence: 0.98,
        piiRisk: { level: "none", columns: [] },
      } as never,
      drift: null,
      anomalies: { anomalies: [], affectedColumns: [], summary: "" },
      hasLineage: true,
    });
    expect(t.grade).toBe("A+");
    expect(t.score).toBeGreaterThanOrEqual(95);
  });

  it("degrades grade for breaking drift", () => {
    const t = computeTrustScore({
      diagnostics: {
        healthScore: 90, schemaConfidence: 0.9,
        piiRisk: { level: "none", columns: [] },
      } as never,
      drift: { backwardCompatible: false, totalChanges: 3 } as never,
      anomalies: { anomalies: [], affectedColumns: [], summary: "" },
      hasLineage: true,
    });
    expect(t.components.drift).toBeLessThan(60);
    expect(t.rationale.join(" ")).toMatch(/breaking/i);
  });

  it("penalizes high PII risk", () => {
    const t = computeTrustScore({
      diagnostics: {
        healthScore: 90, schemaConfidence: 0.9,
        piiRisk: { level: "high", columns: ["email"] },
      } as never,
      drift: null,
      anomalies: { anomalies: [], affectedColumns: [], summary: "" },
      hasLineage: true,
    });
    expect(t.components.pii).toBeLessThan(80);
  });
});

describe("Data Copilot brief", () => {
  it("synthesizes ontology, entities, routing, anomalies, trust for a manufacturing dataset", () => {
    const headers = [
      "date", "plant", "product", "revenue", "gross_margin",
      "inventory_turnover", "downtime", "defect_rate", "supplier_id",
    ];
    const sampleRows = Array.from({ length: 30 }, (_, i) => ({
      date: `2024-01-${(i % 28) + 1}`,
      plant: "P1",
      product: "SKU-A",
      revenue: 1000 + i * 10,
      gross_margin: 0.3 + (i % 5) / 100,
      inventory_turnover: 5 + (i % 3),
      downtime: 2 + (i % 4),
      defect_rate: 0.01,
      supplier_id: `SUP-${i % 4}`,
    }));

    const brief = buildCopilotBrief({
      headers,
      sampleRows,
      diagnostics: {
        healthScore: 88, schemaConfidence: 0.9,
        piiRisk: { level: "none", columns: [] },
      } as never,
      drift: null,
      hasLineage: true,
    });

    expect(brief.detectedIndustry?.industry).toBe("manufacturing");
    expect(brief.ontology.matches.length).toBeGreaterThanOrEqual(5);
    expect(brief.entities.some((e) => e.entity === "Supplier")).toBe(true);
    expect(brief.routing.recommendedDashboards.map((d) => d.role)).toContain("COO");
    expect(brief.recommendedAnalyses.length).toBeGreaterThan(0);
    expect(["A+", "A", "B"]).toContain(brief.trust.grade);
    expect(brief.headline).toMatch(/Manufacturing/);
  });

  it("handles empty sample rows gracefully", () => {
    const brief = buildCopilotBrief({
      headers: ["revenue", "churn_rate"],
      sampleRows: [],
      diagnostics: null,
      drift: null,
      hasLineage: false,
    });
    expect(brief.ontology.matches.length).toBe(2);
    expect(brief.anomalies.anomalies).toEqual([]);
  });

  it("falls back when no canonical KPIs match", () => {
    const brief = buildCopilotBrief({
      headers: ["foo", "bar", "baz"],
      sampleRows: [],
      diagnostics: null,
      drift: null,
      hasLineage: false,
    });
    expect(brief.detectedIndustry).toBeNull();
    expect(brief.routing.recommendedDashboards).toEqual([]);
  });
});
