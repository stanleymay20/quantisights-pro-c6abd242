import { describe, it, expect } from "vitest";
import {
  computeProgress,
  estimateRowCount,
  finalizeHealth,
  formatEta,
  newRollingHealth,
  planIngestion,
  updateRollingHealth,
  LARGE_DATASET_THRESHOLD,
} from "./chunked-processor";

describe("computeProgress", () => {
  it("returns 0 percent with no total estimate", () => {
    const p = computeProgress(100, null, 1, 1000, 2000);
    expect(p.percent).toBe(0);
    expect(p.etaMs).toBeNull();
    expect(p.elapsedMs).toBe(1000);
  });

  it("computes percent and ETA when total known", () => {
    const p = computeProgress(500, 1000, 5, 0, 1000);
    expect(p.percent).toBe(50);
    expect(p.etaMs).toBeGreaterThan(0);
  });

  it("clamps percent at 100", () => {
    const p = computeProgress(2000, 1000, 10, 0, 1000);
    expect(p.percent).toBe(100);
    expect(p.etaMs).toBe(0);
  });

  it("estimates memory usage in MB", () => {
    const p = computeProgress(10_000, 10_000, 2, 0, 1);
    expect(p.memoryEstimateMb).toBeGreaterThan(0);
  });
});

describe("estimateRowCount", () => {
  it("scales sample lines to total bytes", () => {
    const sample = "h\n1\n2\n3\n4\n";
    const est = estimateRowCount(sample, 100, 1000);
    expect(est).toBeGreaterThanOrEqual(30);
  });
  it("returns null for invalid inputs", () => {
    expect(estimateRowCount("", 0, 0)).toBeNull();
  });
});

describe("planIngestion", () => {
  it("routes large datasets to server", () => {
    const plan = planIngestion(LARGE_DATASET_THRESHOLD + 1);
    expect(plan.routeToServer).toBe(true);
  });
  it("keeps small datasets in browser", () => {
    const plan = planIngestion(10_000);
    expect(plan.routeToServer).toBe(false);
    expect(plan.expectedChunks).toBeGreaterThanOrEqual(1);
  });
});

describe("formatEta", () => {
  it("handles null", () => expect(formatEta(null)).toBe("calculating…"));
  it("formats seconds and minutes", () => {
    expect(formatEta(500)).toBe("<1s");
    expect(formatEta(15_000)).toBe("15s");
    expect(formatEta(125_000)).toBe("2m 5s");
  });
});

describe("rolling health", () => {
  it("tracks completeness and duplicates incrementally", () => {
    const state = newRollingHealth();
    updateRollingHealth(state, [
      ["a", "b", "c"],
      ["a", "", "c"],
      ["a", "b", "c"], // duplicate of row 1
    ]);
    const result = finalizeHealth(state);
    expect(result.completeness).toBeGreaterThan(50);
    expect(result.completeness).toBeLessThan(100);
    expect(state.duplicates).toBe(1);
    expect(result.duplicatePct).toBeGreaterThan(0);
    expect(result.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.healthScore).toBeLessThanOrEqual(100);
  });

  it("handles empty input", () => {
    const result = finalizeHealth(newRollingHealth());
    expect(result.completeness).toBe(100);
    expect(result.duplicatePct).toBe(0);
  });
});
