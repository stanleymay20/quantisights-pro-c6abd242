import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Pipeline Observability blind to AICIS Bridge outages (audit round 2)", () => {
  // AICIS Bridge syncs are tracked in aicis_sync_surface_status, entirely
  // separate from data_sync_jobs (the generic connector table this page
  // queried). A real, ongoing AICIS /signals outage (221 consecutive
  // failures, circuit breaker open, confirmed on Bridge Health / AICIS
  // Sync / Data Vendors / Executive Intelligence) was invisible here --
  // Success Rate showed 100% and Failures showed 0, because
  // successRate's fallback defaults to 100 when there's no data_sync_jobs
  // activity for an integration that doesn't use that table at all.
  const source = read("src/pages/PipelineObservability.tsx");

  it("fetches aicis_sync_surface_status alongside the generic sync job tables", () => {
    expect(source).toContain('from("aicis_sync_surface_status")');
    expect(source).toContain("setAicisSurfaces(aicisRes.data || [])");
  });

  it("folds AICIS surface breaker state into the health/success-rate/failure computation", () => {
    expect(source).toContain("degradedAicisSurfaces");
    expect(source).toContain("const totalFailures = failedJobs.length + degradedAicisSurfaces.length;");
    expect(source).toContain("completedJobs.length + healthyAicisSurfaces");
    expect(source).toContain("totalFailures === 0 ? \"healthy\"");
  });

  it("surfaces a visible, linked callout when an AICIS surface is degraded, not just a folded-in number", () => {
    expect(source).toContain("degradedAicisSurfaces.length > 0 && (");
    expect(source).toContain('to="/admin/bridge-health"');
  });
});
