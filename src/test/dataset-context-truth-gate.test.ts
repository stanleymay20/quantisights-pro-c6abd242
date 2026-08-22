import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Active data-context truth gate", () => {
  it("WorkspaceContext separates query failure from verified empty", () => {
    const source = read("src/contexts/WorkspaceContext.tsx");
    expect(source).toContain("error: string | null");
    expect(source).toContain("evidenceReady: boolean");
    expect(source).toContain("Unable to verify workspace membership");
    expect(source).toContain("Unable to verify accessible workspaces");
    expect(source).toContain("setEvidenceReady(true)");
  });

  it("ProjectContext separates project-read failure from verified no-project", () => {
    const source = read("src/contexts/ProjectContext.tsx");
    expect(source).toContain("error: string | null");
    expect(source).toContain("evidenceReady: boolean");
    expect(source).toContain("Unable to verify projects");
    expect(source).toContain("Project context is not verified");
  });

  it("DatasetContext exposes read failure separately from verified empty", () => {
    const source = read("src/contexts/DatasetContext.tsx");
    expect(source).toContain("error: string | null");
    expect(source).toContain("evidenceReady: boolean");
    expect(source).toContain("Unable to verify project datasets");
    expect(source).toContain("Unable to verify linked datasets");
  });

  it("ActiveDataContext composes the three evidence layers and retries the failed layer", () => {
    const source = read("src/hooks/useActiveDataContext.ts");
    expect(source).toContain("contextError = workspaceError ?? projectError ?? datasetError");
    expect(source).toContain("hierarchyEvidenceReady = workspaceEvidenceReady && projectEvidenceReady && datasetEvidenceReady");
    expect(source).toContain("retryContext");
    expect(source).toContain("!contextError");
  });

  it("DatasetRequired renders unavailable evidence instead of onboarding on hierarchy failure", () => {
    const source = read("src/components/layout/DatasetRequired.tsx");
    expect(source).toContain('title="Data context unavailable"');
    expect(source).toContain("Retry Context Verification");
    expect(source).toContain("workspaceEvidenceReady");
    expect(source).toContain("projectEvidenceReady");
    expect(source).toContain("datasetEvidenceReady");
  });
});
