import { describe, it, expect } from "vitest";
import { detectAnomalies } from "@/lib/semantic/anomaly-detector";

function rowsFor(col: string, values: number[]): Record<string, unknown>[] {
  return values.map((v) => ({ [col]: v }));
}

describe("Anomaly Detector", () => {
  it("flags extreme outliers above 4σ", () => {
    const vals = [10, 11, 10, 12, 9, 11, 10, 12, 9, 10, 11, 9, 10, 11, 10, 9, 11, 10, 9, 5000];
    const r = detectAnomalies(["revenue"], rowsFor("revenue", vals));
    expect(r.anomalies.some((a) => a.kind === "outlier")).toBe(true);
    expect(r.affectedColumns).toContain("revenue");
  });

  it("flags impossible negatives on non-negative columns", () => {
    const vals = [100, 120, 130, -50, 110, 105, 115, 120, 130, 100];
    const r = detectAnomalies(["revenue"], rowsFor("revenue", vals));
    const imp = r.anomalies.find((a) => a.kind === "impossible");
    expect(imp).toBeDefined();
    expect(imp?.severity).toBe("high");
  });

  it("flags constant columns", () => {
    const vals = new Array(10).fill(42);
    const r = detectAnomalies(["score"], rowsFor("score", vals));
    expect(r.anomalies.some((a) => a.kind === "constant")).toBe(true);
  });

  it("flags spikes vs early window", () => {
    const vals = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 5000];
    const r = detectAnomalies(["throughput"], rowsFor("throughput", vals));
    expect(r.anomalies.some((a) => a.kind === "spike")).toBe(true);
  });

  it("returns clean result for tame data", () => {
    const vals = [100, 101, 99, 102, 98, 100, 101, 99, 102, 100, 101, 99, 100, 100, 101];
    const r = detectAnomalies(["revenue"], rowsFor("revenue", vals));
    const sev = r.anomalies.filter((a) => a.severity === "high" || a.severity === "critical");
    expect(sev.length).toBe(0);
  });

  it("handles empty input", () => {
    const r = detectAnomalies([], []);
    expect(r.anomalies).toEqual([]);
  });
});
