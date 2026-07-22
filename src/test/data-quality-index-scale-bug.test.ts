import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("data_quality_index / variance_score scale bug (audit: 'Data quality index: 10000%')", () => {
  // Both fields are already 0-100 scale (see create-demo-session/index.ts's
  // seed values: variance_score 15.2, data_quality_index 58-92, matching
  // explainability-adapter.ts's correct `${a.data_quality_index}/100`
  // display) -- but InsightEvidencePanel.tsx and HeroInsight.tsx both
  // multiplied by 100 again as if they were 0-1 fractions, and compared
  // against 0-1-scale thresholds (0.3, 0.7, 0.5) that are trivially
  // always-true or always-false against real 0-100 values. A near-max
  // data_quality_index of ~100 rendered as "10000%".

  it("InsightEvidencePanel no longer multiplies data_quality_index/variance_score by 100", () => {
    const source = read("src/components/dashboard/InsightEvidencePanel.tsx");
    expect(source).not.toMatch(/data_quality_index \* 100/);
    expect(source).not.toMatch(/variance_score \* 100/);
    expect(source).toContain("insight.data_quality_index.toFixed(0)");
    expect(source).toContain("insight.variance_score.toFixed(1)");
  });

  it("HeroInsight no longer multiplies data_quality_index by 100 or compares against 0-1-scale thresholds", () => {
    const source = read("src/components/dashboard/HeroInsight.tsx");
    expect(source).not.toMatch(/data_quality_index \* 100/);
    expect(source).not.toMatch(/variance_score > 0\.3/);
    expect(source).not.toMatch(/data_quality_index < 0\.7/);
    expect(source).not.toMatch(/dqi >= 0\.7/);
    expect(source).not.toMatch(/dqi < 0\.7/);
    expect(source).not.toMatch(/\?\? 0\.5/);
    expect(source).toContain("insight.variance_score > 30");
    expect(source).toContain("insight.data_quality_index < 70");
    expect(source).toContain("dqi >= 70");
    expect(source).toContain("dqi < 70");
    expect(source).toContain("?? 50");
  });
});
