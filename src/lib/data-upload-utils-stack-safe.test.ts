import { describe, expect, it } from "vitest";
import { validateData, type ColumnMapping } from "./data-upload-utils-safe";

describe("stack-safe data validation", () => {
  it("validates 150k numeric rows without Math.min/Math.max argument stack overflow", () => {
    const headers = ["date", "revenue"];
    const mapping: ColumnMapping = { 0: "date", 1: "value" };
    const rows = Array.from({ length: 150_000 }, (_, index) => [
      `2024-01-${String((index % 28) + 1).padStart(2, "0")}`,
      String(index + 1),
    ]);

    const result = validateData(rows, headers, mapping, "single");

    expect(result.validRows).toBe(150_000);
    expect(result.errors).toHaveLength(0);
    expect(result.valueRange).toEqual({ min: 1, max: 150_000 });
  });
});
