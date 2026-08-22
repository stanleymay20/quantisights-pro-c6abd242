import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Hardened data-import pipeline truth contract", () => {
  const source = read("src/pages/DataUploadHardened.tsx");

  it("tracks clean-stage count from raw rows that produced metrics, not fan-out metric rows", () => {
    expect(source).toContain("let transformedRows = 0;");
    expect(source).toContain("if (produced) transformedRows += 1;");
    expect(source).toContain('update({ transformed_count: transformedRows, stage: "transform_complete" })');
    expect(source).not.toContain("transformed_count: inserted");
  });

  it("fails closed on the exact persisted metric count", () => {
    expect(source).toContain('.eq("organization_id", currentOrgId)');
    expect(source).toContain('.eq("dataset_id", dataset.id)');
    expect(source).toContain("verifiedCount !== inserted");
    expect(source).toContain("Metric verification mismatch:");
  });

  it("checks every analytical and decision-stage Edge result instead of only aggregate rejection", () => {
    expect(source).toContain('runEdgeStage("aggregates"');
    expect(source).toContain('runEdgeStage("insights"');
    expect(source).toContain('runEdgeStage("data profile"');
    expect(source).toContain('runEdgeStage("prescriptive advisory"');
    expect(source).toContain('runEdgeStage("automatic decisions"');
    expect(source).toContain("if (result.error)");
  });

  it("persists downstream degradation as partial_success rather than a false completed run", () => {
    expect(source).toContain('finalFailures.length > 0 ? "partial_success" : "completed"');
    expect(source).toContain('finalFailures.length > 0 ? "intelligence_partial" : "complete"');
    expect(source).toContain("degraded_stages: finalFailures.map");
    expect(source).toContain("core_data_durable: true");
  });

  it("does not manufacture synthetic dates", () => {
    expect(source).toContain("One real date column is required");
    expect(source).toContain("Quantivis will not fabricate synthetic dates.");
    expect(source).not.toContain("syntheticYear");
    expect(source).not.toContain("syntheticMonth");
    expect(source).not.toContain("syntheticDay");
  });

  it("never renders a full-intelligence success message when degraded stages exist", () => {
    expect(source).toContain("Data imported · intelligence partially completed");
    expect(source).toContain("The data layer is available, but no full-intelligence claim is being made.");
    expect(source).toContain("Stages requiring attention");
  });
});
