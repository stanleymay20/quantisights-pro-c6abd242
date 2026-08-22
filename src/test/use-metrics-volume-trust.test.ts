import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/hooks/useMetrics.ts"), "utf8");

describe("useMetrics enterprise-volume trust contract", () => {
  it("fails closed instead of exposing partially loaded metric pages", () => {
    expect(source).toContain("const failClosed =");
    expect(source).toContain("Metric data could not be loaded completely");
    expect(source).toContain("setMetrics([])");
    expect(source).not.toContain("if (error || !data) break");
  });

  it("refuses to compute client KPIs from datasets beyond the raw-row safety ceiling", () => {
    expect(source).toContain("const MAX_CLIENT_ROWS = 50_000");
    expect(source).toContain("Metric volume boundary could not be verified");
    expect(source).toContain("refusing to compute KPIs from a partial raw slice");
    expect(source).toContain("setIsTruncated(truncated)");
  });

  it("does not enable realtime on top of an incomplete base snapshot", () => {
    expect(source).toContain("!canStream || loadError || isTruncated");
  });
});
