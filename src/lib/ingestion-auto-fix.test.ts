import { describe, expect, it } from "vitest";
import { applyAutoFixes, buildRecommendedAutoFixOperations } from "./ingestion-auto-fix";

describe("ingestion auto-fix engine", () => {
  it("deduplicates headers and records header changes", () => {
    const result = applyAutoFixes({
      headers: ["revenue", "revenue", "revenue"],
      rows: [["1", "2", "3"]],
      operations: [{ kind: "deduplicate_headers" }],
    });

    expect(result.headers).toEqual(["revenue", "revenue_2", "revenue_3"]);
    expect(result.summary.headerChanges).toBe(2);
    expect(result.changes.map((change) => change.kind)).toContain("deduplicate_headers");
  });

  it("normalizes whitespace and null sentinel values", () => {
    const result = applyAutoFixes({
      headers: ["region", "notes"],
      rows: [[" Berlin ", " N/A "], [" Hamburg ", "NULL"]],
      operations: [{ kind: "trim_whitespace" }, { kind: "normalize_nulls" }],
    });

    expect(result.rows).toEqual([["Berlin", ""], ["Hamburg", ""]]);
    expect(result.summary.cellChanges).toBe(4);
    expect(result.summary.operationsApplied).toEqual(expect.arrayContaining(["trim_whitespace", "normalize_nulls"]));
  });

  it("normalizes messy numeric values on selected columns", () => {
    const result = applyAutoFixes({
      headers: ["revenue", "cost"],
      rows: [["$1,200", "(300)"], ["2.5K", "150"]],
      operations: [
        { kind: "normalize_numbers", column: "revenue", columnIndex: 0 },
        { kind: "normalize_numbers", column: "cost", columnIndex: 1 },
      ],
    });

    expect(result.rows[0][0]).toBe("1200");
    expect(result.rows[0][1]).toBe("-300");
    expect(result.rows[1][0]).toBe("2500");
    expect(result.summary.operationsApplied).toContain("normalize_numbers");
  });

  it("normalizes date-like values on selected columns", () => {
    const result = applyAutoFixes({
      headers: ["order_date"],
      rows: [["2024-01-05"], ["2024/02/10"]],
      operations: [{ kind: "normalize_dates", column: "order_date", columnIndex: 0 }],
    });

    expect(result.rows[0][0]).toBe("2024-01-05");
    expect(result.rows[1][0]).toBe("2024-02-10");
    expect(result.summary.operationsApplied).toContain("normalize_dates");
  });

  it("masks PII only when explicitly enabled", () => {
    const result = applyAutoFixes({
      headers: ["customer_email", "phone"],
      rows: [["alice@example.com", "+49 123 456789"]],
      operations: [
        { kind: "mask_pii", column: "customer_email", columnIndex: 0 },
        { kind: "mask_pii", column: "phone", columnIndex: 1 },
      ],
    });

    expect(result.rows[0][0]).toBe("a***@example.com");
    expect(result.rows[0][1]).toBe("[masked-phone]");
    expect(result.summary.operationsApplied).toContain("mask_pii");
  });

  it("recommends safe operations from header names while leaving PII masking disabled", () => {
    const operations = buildRecommendedAutoFixOperations(["revenue", "order_date", "customer_email"]);

    expect(operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "deduplicate_headers" }),
      expect.objectContaining({ kind: "normalize_numbers", column: "revenue", columnIndex: 0 }),
      expect.objectContaining({ kind: "normalize_dates", column: "order_date", columnIndex: 1 }),
      expect.objectContaining({ kind: "mask_pii", column: "customer_email", columnIndex: 2, enabled: false }),
    ]));
  });
});
