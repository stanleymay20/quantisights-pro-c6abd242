import { describe, it, expect } from "vitest";
import {
  buildSnapshot,
  detectDrift,
  nameSimilarity,
  summarizeDrift,
  type SchemaColumn,
} from "./schema-evolution";

const col = (
  name: string,
  type: SchemaColumn["type"] = "number",
  role: SchemaColumn["role"] = "value",
): SchemaColumn => ({ name, type, role });

describe("nameSimilarity", () => {
  it("returns 1 for identical normalized names", () => {
    expect(nameSimilarity("Revenue", "revenue")).toBe(1);
    expect(nameSimilarity("net_revenue", "Net Revenue")).toBe(1);
  });
  it("returns >=0.72 for known rename pairs", () => {
    expect(nameSimilarity("revenue", "revenues")).toBeGreaterThanOrEqual(0.72);
    expect(nameSimilarity("cost", "costs")).toBeGreaterThanOrEqual(0.72);
  });
  it("returns low score for unrelated names", () => {
    expect(nameSimilarity("revenue", "supplier")).toBeLessThan(0.5);
  });
});

describe("detectDrift", () => {
  const baseDate = "2024-01-01T00:00:00Z";
  const prev = buildSnapshot("ds1", 1, [
    col("revenue", "number", "value"),
    col("cost", "number", "value"),
    col("month", "date", "date"),
  ]);
  prev.capturedAt = baseDate;

  it("returns empty drift for first snapshot", () => {
    const report = detectDrift(null, prev);
    expect(report.totalChanges).toBe(0);
    expect(report.backwardCompatible).toBe(true);
  });

  it("detects added column", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenue", "number", "value"),
      col("cost", "number", "value"),
      col("month", "date", "date"),
      col("margin", "number", "value"),
    ]);
    const report = detectDrift(prev, next);
    expect(report.totalChanges).toBe(1);
    expect(report.changes[0]).toMatchObject({
      changeType: "added",
      columnName: "margin",
    });
    expect(report.backwardCompatible).toBe(true);
  });

  it("detects removed column as breaking", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenue", "number", "value"),
      col("month", "date", "date"),
    ]);
    const report = detectDrift(prev, next);
    expect(report.changes.find((c) => c.changeType === "removed")?.columnName).toBe("cost");
    expect(report.backwardCompatible).toBe(false);
  });

  it("detects renames via fuzzy match and same type", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenues", "number", "value"), // renamed from "revenue"
      col("cost", "number", "value"),
      col("month", "date", "date"),
    ]);
    const report = detectDrift(prev, next);
    const rename = report.changes.find((c) => c.changeType === "renamed");
    expect(rename).toBeDefined();
    expect(rename?.oldName).toBe("revenue");
    expect(rename?.columnName).toBe("revenues");
    // Renames should NOT produce a spurious add + remove pair
    expect(report.changes.filter((c) => c.changeType === "added")).toHaveLength(0);
    expect(report.changes.filter((c) => c.changeType === "removed")).toHaveLength(0);
  });

  it("does not treat type-mismatched fuzzy names as renames", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenues", "text", "segment"), // similar name but different type
      col("cost", "number", "value"),
      col("month", "date", "date"),
    ]);
    const report = detectDrift(prev, next);
    expect(report.changes.some((c) => c.changeType === "renamed")).toBe(false);
    expect(report.changes.some((c) => c.changeType === "added")).toBe(true);
    expect(report.changes.some((c) => c.changeType === "removed")).toBe(true);
  });

  it("detects type changes", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenue", "text", "value"),
      col("cost", "number", "value"),
      col("month", "date", "date"),
    ]);
    const report = detectDrift(prev, next);
    const tc = report.changes.find((c) => c.changeType === "type_changed");
    expect(tc).toBeDefined();
    expect(tc?.oldType).toBe("number");
    expect(tc?.newType).toBe("text");
    expect(report.backwardCompatible).toBe(false);
  });

  it("caps confidence at 0.95", () => {
    const next = buildSnapshot("ds1", 2, [
      col("revenue", "number", "value"),
      col("cost", "number", "value"),
      col("month", "date", "date"),
      col("margin", "number", "value"),
    ]);
    const report = detectDrift(prev, next);
    for (const c of report.changes) {
      expect(c.confidence).toBeLessThanOrEqual(0.95);
    }
  });
});

describe("summarizeDrift", () => {
  it("produces human-readable summary", () => {
    const prev = buildSnapshot("d", 1, [col("a"), col("b")]);
    const next = buildSnapshot("d", 2, [col("a"), col("c")]);
    const report = detectDrift(prev, next);
    expect(summarizeDrift(report)).toMatch(/added|removed/);
  });
});
