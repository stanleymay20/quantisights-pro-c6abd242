import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Monte Carlo P10/P90 bracket regression", () => {
  // Root cause: expected_value is the arithmetic mean of a log-normal/GBM
  // path distribution, which is right-skewed. For volatile metrics the mean
  // can legitimately fall outside the P10-P90 band, which looked like a
  // "statistically impossible" result when displayed as "Expected Value"
  // directly beside P10/P90. median_value is the P50 percentile of the same
  // sorted array, so it is always bounded by P10 and P90 by construction.

  it("Simulations.tsx displays median_value, not expected_value, as the headline/table/band figure", () => {
    const source = read("src/pages/Simulations.tsx");
    expect(source).not.toContain("latest.expected_value");
    expect(source).not.toContain("s.expected_value");
    expect(source).not.toContain("sim.expected_value");
    expect(source).toContain("latest.median_value");
    expect(source).toContain("s.median_value");
    expect(source).toContain("sim.median_value");
  });

  it("ScenarioComparison.tsx sources the 'Expected Net' row from median_net_impact, not expected_net_impact", () => {
    const source = read("src/components/decision-intelligence/ScenarioComparison.tsx");
    expect(source).not.toContain("a.expected_net_impact");
    expect(source).not.toContain("b.expected_net_impact");
    expect(source).toContain("a.median_net_impact");
    expect(source).toContain("b.median_net_impact");
  });
});
