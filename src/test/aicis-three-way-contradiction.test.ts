import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AICIS three-way status contradiction (Bridge Health vs AICIS Sync vs Data Vendors)", () => {
  // Root cause: three admin screens report AICIS health from two
  // independent, unreconciled sources. Bridge Health and AICIS Sync both
  // read aicis_sync_surface_status (populated by sync-aicis-bridge, the
  // resilience-layer pipeline with circuit breakers). Data Vendors instead
  // reads external_data_sources.last_error/last_refreshed_at, populated by
  // a completely separate function (ingest-external-signals) that can be
  // invoked less often and show a stale "Healthy" reading from before the
  // resilience layer started failing. Data Vendors now also checks the
  // authoritative aicis_sync_surface_status source for its aicis row and
  // lets a real degraded state override a stale "Healthy".
  it("Data Vendors fetches aicis_sync_surface_status alongside external_data_sources", () => {
    const source = read("src/pages/admin/DataVendors.tsx");
    expect(source).toContain('from("aicis_sync_surface_status")');
    expect(source).toContain("aicisDegraded");
  });

  it("the aicis row's Healthy badge is suppressed when the resilience layer reports failures", () => {
    const source = read("src/pages/admin/DataVendors.tsx");
    expect(source).toMatch(/!\(s\.vendor_key === "aicis" && aicisDegraded\)/);
    expect(source).toContain("Resilience-layer sync is failing");
    expect(source).toContain("/admin/bridge-health");
  });
});
