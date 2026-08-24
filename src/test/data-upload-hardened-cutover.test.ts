import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

describe("Hardened data-upload cutover", () => {
  it("keeps the public DataUpload module as a minimal compatibility export", () => {
    const source = read("src/pages/DataUpload.tsx").trim();
    expect(source).toBe('export { default } from "./DataUploadHardened";');
  });

  it("routes the compatibility export to the fail-closed implementation", () => {
    const source = read("src/pages/DataUploadHardened.tsx");

    expect(source).toContain('const finalStatus = finalFailures.length > 0 ? "partial_success" : "completed"');
    expect(source).toContain("status: finalStatus");
    expect(source).toContain('truth_contract: "hardened_v1"');
    expect(source).toContain("Metric verification mismatch");
    expect(source).toContain('runEdgeStage("aggregates"');
    expect(source).toContain('runEdgeStage("insights"');
    expect(source).toContain('runEdgeStage("data profile"');
    expect(source).toContain('runEdgeStage("prescriptive advisory"');
    expect(source).toContain('runEdgeStage("automatic decisions"');
  });
});
