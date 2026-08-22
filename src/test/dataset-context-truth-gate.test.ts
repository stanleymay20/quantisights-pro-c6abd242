import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Organization-to-dataset context truth gate", () => {
  it("useOrganization exposes membership failure and synchronizes tenant switches", () => {
    const source = read("src/hooks/useOrganization.ts");
    expect(source).toContain("error,\n    evidenceReady");
    expect(source).toContain("Unable to verify organization membership");
    expect(source).toContain('ORG_SWITCH_EVENT = "quantivis:org-switch"');
    expect(source).toContain("window.addEventListener(ORG_SWITCH_EVENT, handleOrgSwitch)");
    expect(source).toContain("detail: { organizationId: orgId }");
    expect(source).not.toContain("platform running in reduced mode");
  });

  it("WorkspaceContext separates query failure from verified empty and propagates org evidence", () => {
    const source = read("src/contexts/WorkspaceContext.tsx");
    expect(source).toContain("error: string | null");
    expect(source).toContain("evidenceReady: boolean");
    expect(source).toContain("Organization context unavailable");
    expect(source).toContain("Unable to verify workspace membership");
    expect(source).toContain("Unable to verify accessible workspaces");
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

  it("ActiveDataContext composes all four evidence layers and retries the failed layer", () => {
    const source = read("src/hooks/useActiveDataContext.ts");
    expect(source).toContain("contextError = orgError ?? workspaceError ?? projectError ?? datasetError");
    expect(source).toContain("orgEvidenceReady");
    expect(source).toContain("workspaceEvidenceReady");
    expect(source).toContain("projectEvidenceReady");
    expect(source).toContain("datasetEvidenceReady");
    expect(source).toContain("refreshOrganizations");
    expect(source).toContain("retryContext");
  });

  it("DatasetRequired renders unavailable evidence instead of onboarding on any hierarchy failure", () => {
    const source = read("src/components/layout/DatasetRequired.tsx");
    expect(source).toContain('title="Data context unavailable"');
    expect(source).toContain("Retry Context Verification");
    expect(source).toContain("!orgEvidenceReady");
    expect(source).toContain("workspaceEvidenceReady");
    expect(source).toContain("projectEvidenceReady");
    expect(source).toContain("datasetEvidenceReady");
  });
});
