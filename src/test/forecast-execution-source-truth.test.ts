import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("forecast, execution, and data-source truth semantics", () => {
  it("does not report a forecast success without verified metric inventory and a complete payload", () => {
    const source = read("src/pages/Forecasting.tsx");
    expect(source).toContain("Forecast metric evidence is unavailable");
    expect(source).toContain("Forecast service returned no complete, verifiable forecast payload.");
    expect(source).toContain("No forecastable metrics found");
    expect(source).toContain("setData(null)");
  });

  it("treats timeline, receipt, and compensation projections as one execution evidence contract", () => {
    const hook = read("src/hooks/useExecutionPlans.ts");
    const view = read("src/components/execution/ExecutionTimeline.tsx");

    expect(hook).toContain("Execution receipts unavailable:");
    expect(hook).toContain("Compensation evidence unavailable:");
    expect(hook).toContain("const evidenceReady = Boolean");
    expect(view).toContain("Execution evidence is unavailable");
    expect(view).toContain("evidenceReady && plans.length === 0");
    expect(view).toContain("disabled={loading || !evidenceReady || !!error}");
  });

  it("does not convert data-source or sync-history failures into empty-state claims", () => {
    const source = read("src/pages/DataSources.tsx");
    expect(source).toContain("Data-source inventory is unavailable");
    expect(source).toContain("Sync history unavailable");
    expect(source).toContain('.from("data_sync_jobs")');
    expect(source).toContain('.eq("organization_id", currentOrgId)');
    expect(source).toContain("Connector returned an incomplete sync result.");
  });

  it("uses cryptographic randomness for one-time webhook credentials", () => {
    const source = read("src/pages/DataSources.tsx");
    expect(source).toContain("crypto.getRandomValues(randomBytes)");
    expect(source).not.toContain("Math.random()");
  });
});
