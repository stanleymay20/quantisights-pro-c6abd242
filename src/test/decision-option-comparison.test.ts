import { describe, expect, it } from "vitest";
import { buildDecisionOptions } from "@/lib/decision-options";
import { buildTraceability } from "@/lib/evidence-contract";

const verifiedTrace = buildTraceability({
  datasetId: "dataset-1",
  sourceEntityId: "insight-1",
  dataRowsUsed: 50,
  metricTypes: ["revenue"],
  modelUsed: "Calibrated statistical model",
});

describe("decision option comparison integrity", () => {
  it("returns recommended, accelerate, staged and hold options", () => {
    const options = buildDecisionOptions({ recommendedAction: "Adjust pricing", traceability: verifiedTrace });
    expect(options.map(o => o.id)).toEqual(["recommended", "accelerate", "staged", "hold"]);
  });

  it("only the recommended option inherits modeled impact and confidence", () => {
    const options = buildDecisionOptions({
      recommendedAction: "Adjust pricing",
      predictedNetImpact: 125000,
      confidence: 76,
      traceability: verifiedTrace,
    });

    const recommended = options[0];
    expect(recommended.impact).toMatchObject({ status: "modeled", value: 125000 });
    expect(recommended.confidence).toMatchObject({ status: "modeled", value: 76 });

    for (const option of options.slice(1)) {
      expect(option.confidence.value).toBeNull();
      expect(option.confidence.status).toBe("unmodeled");
      expect(option.impact.value).toBeNull();
    }
  });

  it("never fabricates numeric impacts for unsimulated alternatives", () => {
    const options = buildDecisionOptions({
      recommendedAction: "Reduce supplier concentration",
      predictedNetImpact: 90000,
      confidence: 72,
      traceability: verifiedTrace,
      costOfDelayLabel: "€15,000/week exposure",
    });

    expect(options.find(o => o.id === "accelerate")?.impact.status).toBe("unmodeled");
    expect(options.find(o => o.id === "staged")?.impact.status).toBe("unmodeled");
    expect(options.find(o => o.id === "hold")?.impact).toMatchObject({ status: "derived", value: null });
  });

  it("labels alternatives as requiring independent evidence", () => {
    const options = buildDecisionOptions({ recommendedAction: "Adjust pricing", traceability: verifiedTrace });
    expect(options.find(o => o.id === "accelerate")?.evidenceStatus).toBe("unverified");
    expect(options.find(o => o.id === "staged")?.evidenceStatus).toBe("partial");
  });

  it("does not pretend the recommended option is verified when provenance is missing", () => {
    const options = buildDecisionOptions({
      recommendedAction: "Adjust pricing",
      predictedNetImpact: 125000,
      confidence: 76,
    });
    expect(options[0].evidenceStatus).toBe("unverified");
    expect(options[0].evidenceLabel).toContain("No verified source");
  });
});
