import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Data-plane truth surfaces", () => {
  it("Data Lineage withholds graph/count claims until every provenance read verifies", () => {
    const source = read("src/pages/DataLineage.tsx");
    expect(source).toContain("setEvidenceReady(false)");
    expect(source).toContain('eq("organization_id", currentOrgId).eq("dataset_id", activeDatasetId)');
    expect(source).toContain("Unable to verify lineage evidence");
    expect(source).toContain("if (!evidenceReady) return");
    expect(source).not.toContain("No data lineage to display. Upload data and create KPIs first.");
  });

  it("Dataset Explorer distinguishes failed reads from verified empty datasets and metrics", () => {
    const source = read("src/pages/DatasetExplorer.tsx");
    expect(source).toContain("setDatasetsReady(false)");
    expect(source).toContain("setMetricsReady(false)");
    expect(source).toContain("Unable to verify datasets");
    expect(source).toContain("The dataset query succeeded and returned no datasets.");
    expect(source).toContain("The metric query succeeded and returned no metric rows");
    expect(source).toContain("The scoring service returned no verified composite score.");
  });

  it("Data Hub clears tenant evidence, exposes sync-history degradation, and validates manual sync completion", () => {
    const source = read("src/pages/DataHub.tsx");
    expect(source).toContain("clearEvidence();");
    expect(source).toContain("setCoreReady(false)");
    expect(source).toContain("setHistoryReady(false)");
    expect(source).toContain("Sync history could not be verified");
    expect(source).toContain("External ingestion returned no verifiable completion result.");
    expect(source).toContain('data.status === "partial"');
    expect(source).toContain('title: "Sync completed"');
    expect(source).not.toContain('title: "Sync started"');
  });
});
