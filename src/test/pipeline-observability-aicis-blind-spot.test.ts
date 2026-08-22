import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Pipeline Observability truth contract", () => {
  const source = read("src/pages/PipelineObservability.tsx");

  it("reads pipeline runs and AICIS bridge state as first-class evidence", () => {
    expect(source).toContain('from("pipeline_runs")');
    expect(source).toContain('from("aicis_sync_surface_status")');
    expect(source).toContain("setPipelineRuns(pipelineRes.data || [])");
    expect(source).toContain("setAicisSurfaces(aicisRes.data || [])");
  });

  it("recognizes partial_success and never counts it as a verified success", () => {
    expect(source).toContain('run.status === "partial_success"');
    expect(source).toContain("const verifiedSuccesses = completedJobs.length + completedRuns.length;");
    expect(source).toContain("partialRuns.length > 0");
    expect(source).not.toContain("completedRuns.length + partialRuns.length");
  });

  it("withholds success and health claims when evidence is missing or unreadable", () => {
    expect(source).toContain("setEvidenceReady(false)");
    expect(source).toContain("successRate = evidenceReady && totalAttempts > 0");
    expect(source).toContain('healthStatus = !evidenceReady || totalAttempts === 0');
    expect(source).toContain('No 24-hour execution evidence');
    expect(source).not.toMatch(/:\s*100\s*;/);
  });

  it("folds failed pipeline runs and degraded AICIS surfaces into failure health", () => {
    expect(source).toContain("failedJobs.length + failedRuns.length + degradedAicisSurfaces.length");
    expect(source).toContain("degradedAicisSurfaces.length > 0 && (");
    expect(source).toContain('to="/admin/bridge-health"');
  });

  it("uses the actual source distribution count field", () => {
    expect(source).toContain('dataKey="count"');
    expect(source).not.toContain('dataKey="value" nameKey="name"');
  });
});
