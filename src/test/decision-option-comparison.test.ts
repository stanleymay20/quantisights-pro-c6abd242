import { describe, expect, it } from "vitest";
import { buildDecisionOptions, traceabilityFromExecutiveDecision } from "@/lib/decision-options";
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

  it("reuses persisted executive source metadata as verified provenance only when all hard fields exist", () => {
    const traceability = traceabilityFromExecutiveDecision({
      id: "decision-1",
      explanationMetadata: {
        source: { kind: "insight", id: "insight-9", created_at: "2026-08-14T10:00:00Z" },
        source_data: {
          dataset_name: "Revenue dataset",
          dataset_id: "dataset-9",
          rows_analyzed: 240,
          key_metrics: ["revenue", "conversion"],
        },
        evidence_classification: "OBSERVED_SIGNAL_TO_DECISION",
        limitations: ["Executive review required before execution"],
      },
    });

    expect(traceability).toMatchObject({
      sourceDataset: "Revenue dataset",
      sourceDatasetId: "dataset-9",
      sourceEntityId: "insight-9",
      dataRowsUsed: 240,
      isVerifiedSource: true,
      modelOrHeuristic: "OBSERVED_SIGNAL_TO_DECISION",
    });
  });

  it("keeps executive provenance unverified when source rows are absent", () => {
    const traceability = traceabilityFromExecutiveDecision({
      id: "decision-2",
      explanationMetadata: {
        source: { kind: "advisory", id: "advisory-2" },
        source_data: { dataset_id: "dataset-2", rows_analyzed: null },
      },
    });

    expect(traceability.isVerifiedSource).toBe(false);
    expect(traceability.dataRowsUsed).toBe(0);
    expect(traceability.limitations).toContain("No observed rows are traceable to this decision");
  });
});
