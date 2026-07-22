import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("datasets.status 'active' vs 'completed' mismatch (audit round 2: Governed Datasets 0/0 with 35 real datasets)", () => {
  // DataUpload.tsx -- the standard CSV upload flow every real user goes
  // through -- writes datasets.status = "completed" on success. Only the
  // demo seed (create-demo-session) and API-ingest edge function write
  // status = "active". Five governance/quality-facing components filtered
  // datasets by status = "active" only, so any org that used the normal
  // upload flow showed 0 datasets in governance/quality views regardless
  // of how much real data existed.

  it("DataUpload.tsx still writes 'completed' (documenting the convention these reads must match)", () => {
    const source = read("src/pages/DataUpload.tsx");
    expect(source).toContain('status: "completed", row_count: inserted');
  });

  const fixedSites: Array<[string, string]> = [
    ["src/pages/admin/Connectors.tsx", 'in("status", ["active", "completed"]).order("name")'],
    ["src/components/governance/StewardDrillDown.tsx", '.in("status", ["active", "completed"]),'],
    ["src/components/dashboard/GovernanceKPIs.tsx", 'in("status", ["active", "completed"]),'],
    ["src/components/dashboard/CrossWorkspaceIntelligence.tsx", '.in("status", ["active", "completed"])'],
    ["src/components/dashboard/DataQualityScorecard.tsx", '.in("status", ["active", "completed"]);'],
  ];

  for (const [path, expected] of fixedSites) {
    it(`${path} now accepts both "active" and "completed" datasets`, () => {
      const source = read(path);
      expect(source).toContain(expected);
      expect(source).not.toMatch(/from\("datasets"\)[^;]*\.eq\("status", "active"\)/s);
    });
  }
});
