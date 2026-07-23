import { describe, expect, it } from "vitest";
import { applyAutoFixesAndRecompute, buildMappingFromSchema } from "./ingestion-auto-fix-recompute";

describe("auto-fix recompute workflow", () => {
  it("applies fixes and rebuilds schema, mapping, diagnostics, intelligence, and remediation", () => {
    const result = applyAutoFixesAndRecompute({
      headers: ["date", "revenue", "revenue"],
      rows: [
        [" 2024/01/01 ", "$1,200", "N/A"],
        ["2024/01/02", "2.5K", "(300)"],
      ],
    });

    expect(result.headers).toEqual(["date", "revenue", "revenue_2"]);
    expect(result.autoFix.summary.totalChanges).toBeGreaterThan(0);
    expect(result.schema.length).toBe(3);
    expect(Object.keys(result.mapping)).toHaveLength(3);
    expect(result.diagnostics.healthScore).toBeGreaterThanOrEqual(0);
    expect(result.intelligence.dictionary.fieldCount).toBe(3);
    expect(result.remediation.readiness.total).toBeGreaterThanOrEqual(0);
  });

  it("respects explicit operations and can mask PII during recompute", () => {
    const result = applyAutoFixesAndRecompute({
      headers: ["customer_email", "revenue"],
      rows: [["alice@example.com", "$1,000"]],
      operations: [
        { kind: "mask_pii", column: "customer_email", columnIndex: 0 },
        { kind: "normalize_numbers", column: "revenue", columnIndex: 1 },
      ],
    });

    expect(result.rows[0][0]).toBe("a***@example.com");
    expect(result.rows[0][1]).toBe("1000");
    expect(result.autoFix.summary.operationsApplied).toEqual(expect.arrayContaining(["mask_pii", "normalize_numbers"]));
  });

  it("builds mapping directly from inferred schema", () => {
    const mapping = buildMappingFromSchema([
      { column: "date", colIdx: 0, inferredType: "date", confidence: 98, reason: "date pattern", sampleValues: ["2024-01-01"], rulesApplied: [] },
      { column: "revenue", colIdx: 1, inferredType: "value", confidence: 96, reason: "numeric", sampleValues: ["1000"], rulesApplied: [] },
    ]);

    expect(mapping).toEqual({ 0: "date", 1: "value" });
  });
});
