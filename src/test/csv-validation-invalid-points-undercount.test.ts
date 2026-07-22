import { describe, expect, it } from "vitest";
import { validateData } from "../lib/data-upload-utils";

describe("validateData invalidPoints undercount (audit round 2: '1 will be skipped' vs '2 issues')", () => {
  // Reproduces the exact live finding: a 4-row CSV where row 2 has a
  // blank date (invalid) and row 3 has a non-numeric value (invalid).
  // Row 2's value ("52000") is numerically fine, so it fell through
  // neither the invalidPoints branch nor a real validPoints count (it was
  // gated behind `if (dateValid)` with no else) -- the point vanished
  // from both tallies. That undercounted invalidPoints (used for "N data
  // points will be skipped") relative to the row-level banner, which
  // correctly showed 2 invalid rows / 2 issues.
  const headers = ["date", "revenue"];
  const rows = [
    ["2024-01-01", "50000"],
    ["", "52000"],
    ["2024-03-01", "not_a_number"],
    ["2024-04-01", "58000"],
  ];
  const mapping = { "0": "date", "1": "value" } as const;

  it("counts both invalid rows' data points as invalid, not just one", () => {
    const result = validateData(rows, headers, mapping as any, "single");
    expect(result.totalRows).toBe(4);
    expect(result.validRows).toBe(2);
    expect(result.errors).toHaveLength(2);
    // Previously invalidPoints was 1 (only the non-numeric row) even
    // though 2 rows are actually invalid and will be skipped.
    expect(result.invalidPoints).toBe(2);
    expect(result.validPoints).toBe(2);
    expect(result.validPoints + result.invalidPoints).toBe(result.totalPoints);
  });

  it("the blank-date row's otherwise-valid value is excluded from the value range summary", () => {
    const result = validateData(rows, headers, mapping as any, "single");
    // Only rows 0 and 3 (50000, 58000) are truly valid and importable.
    expect(result.valueRange).toEqual({ min: 50000, max: 58000 });
  });
});
