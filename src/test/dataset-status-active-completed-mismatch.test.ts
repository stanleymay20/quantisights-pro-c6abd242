import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("datasets.status 'active' vs 'completed' mismatch (audit round 2: Governed Datasets 0/0 with 35 real datasets)", () => {
  it("the hardened standard upload writes completed only after exact metric verification", () => {
    const source = read("src/pages/DataUploadHardened.tsx");
    expect(source).toContain('status: "completed",');
    expect(source).toContain("verifiedCount !== inserted");
    expect(source).toContain("Dataset completion failed:");
    expect(source).not.toMatch(/status:\s*"active"/);
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
