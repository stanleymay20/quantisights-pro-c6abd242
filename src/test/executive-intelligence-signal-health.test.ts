import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Executive Intelligence degraded-signal banner", () => {
  // A live third-party vendor outage (e.g. AICIS /signals) starves the
  // briefing pipeline of new items, which naturally computes to zero-valued
  // pressure/risk metrics. Without a banner, that zero looks like a genuine
  // "all clear" instead of "we have no idea because ingestion is broken."
  // aicis_sync_surface_status already tracks consecutive_failures per
  // surface (used by the admin-only /admin/bridge-health page) — this must
  // also be surfaced on the executive-facing page.

  it("useExecutiveIntelligence fetches aicis_sync_surface_status and exposes degradedSurfaces", () => {
    const source = read("src/hooks/useExecutiveIntelligence.ts");
    expect(source).toContain('from("aicis_sync_surface_status")');
    expect(source).toContain("degradedSurfaces");
  });

  it("ExecutiveIntelligence page renders a warning when surfaces are degraded", () => {
    const source = read("src/pages/ExecutiveIntelligence.tsx");
    expect(source).toContain("degradedSurfaces");
    expect(source).toContain("Signal ingestion degraded");
    expect(source).toContain("/admin/bridge-health");
  });
});
