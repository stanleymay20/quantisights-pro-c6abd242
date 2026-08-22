import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Dataset context truth gate", () => {
  it("DatasetContext exposes read failure separately from verified empty", () => {
    const source = read("src/contexts/DatasetContext.tsx");
    expect(source).toContain("error: string | null");
    expect(source).toContain("evidenceReady: boolean");
    expect(source).toContain("setEvidenceReady(false)");
    expect(source).toContain("Unable to verify project datasets");
    expect(source).toContain("Unable to verify linked datasets");
    expect(source).toContain("setEvidenceReady(true)");
  });

  it("ActiveDataContext threads dataset evidence/error into readiness", () => {
    const source = read("src/hooks/useActiveDataContext.ts");
    expect(source).toContain("contextError = datasetError");
    expect(source).toContain("datasetEvidenceReady");
    expect(source).toContain("!contextError");
  });

  it("DatasetRequired renders unavailable evidence instead of onboarding on read failure", () => {
    const source = read("src/components/layout/DatasetRequired.tsx");
    expect(source).toContain('title="Dataset context unavailable"');
    expect(source).toContain("Retry Dataset Verification");
    expect(source).toContain("contextError || (hasOrg && hasProject && !datasetEvidenceReady)");
  });
});
