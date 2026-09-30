import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(__dirname, "../../.github/workflows/ci.yml"), "utf8");

describe("normal CI SHA semantics", () => {
  it("checks out and verifies the literal PR head SHA for candidate quality evidence", () => {
    expect(workflow).toContain("github.event.pull_request.head.sha");
    expect(workflow).toContain("Checkout exact candidate SHA");
    expect(workflow).toContain("Verify exact candidate checkout");
    expect(workflow).toContain('actual_sha="$(git rev-parse HEAD)"');
    expect(workflow).toContain('if [ "$actual_sha" != "$EXPECTED_SHA" ]');
    expect(workflow).toContain("persist-credentials: false");
  });

  it("retains separately-labelled PR merge/base integration evidence", () => {
    expect(workflow).toContain("merge-compatibility:");
    expect(workflow).toContain("Checkout GitHub PR merge ref");
    expect(workflow).toContain("Verify merge-ref checkout identity");
    expect(workflow).toContain("Typecheck merged tree");
    expect(workflow).toContain("Build merged tree");
  });

  it("uses exact pushed SHA semantics on main", () => {
    expect(workflow).toContain("github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha");
  });
});
