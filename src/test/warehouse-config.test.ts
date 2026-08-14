import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertSelectOnly,
  enforceLimit,
  rowToCanonicalMetric,
  validateMapping,
} from "../../supabase/functions/_shared/warehouse-config";

describe("warehouse query governance", () => {
  it("adds an outer limit even when a CTE already has an inner LIMIT", () => {
    const query = "WITH sample AS (SELECT * FROM source LIMIT 10) SELECT * FROM sample";
    expect(enforceLimit(query, 1_000)).toBe(`${query} LIMIT 1000`);
  });

  it("does not mistake LIMIT text inside a string or comment for the outer bound", () => {
    const literal = "SELECT * FROM events WHERE note = 'LIMIT 999999'";
    expect(enforceLimit(literal, 500)).toBe(`${literal} LIMIT 500`);

    const commented = "SELECT * FROM events -- LIMIT 999999";
    expect(enforceLimit(commented, 500)).toBe("SELECT * FROM events LIMIT 500 -- LIMIT 999999");
  });

  it("caps an oversized existing outer LIMIT and preserves OFFSET", () => {
    expect(enforceLimit("SELECT * FROM events LIMIT 999999 OFFSET 20", 1_000)).toBe(
      "SELECT * FROM events LIMIT 1000 OFFSET 20",
    );
  });

  it("inserts the limit before a trailing semicolon and comment", () => {
    expect(enforceLimit("SELECT * FROM events; -- bounded query", 250)).toBe(
      "SELECT * FROM events LIMIT 250; -- bounded query",
    );
  });

  it("clamps invalid policy caps to a safe bounded range", () => {
    expect(enforceLimit("SELECT * FROM events", -5)).toBe("SELECT * FROM events LIMIT 1");
    expect(enforceLimit("SELECT * FROM events", 500_000)).toBe("SELECT * FROM events LIMIT 50000");
    expect(enforceLimit("SELECT * FROM events", Number.NaN)).toBe("SELECT * FROM events LIMIT 10000");
  });

  it("ignores write-keyword text in literals/comments but blocks executable mutations", () => {
    expect(() =>
      assertSelectOnly("SELECT * FROM events WHERE note = 'delete update create' -- drop table"),
    ).not.toThrow();
    expect(() => assertSelectOnly("WITH changed AS (DELETE FROM events) SELECT * FROM changed")).toThrow(
      "write/DDL keywords are not allowed",
    );
    expect(() => assertSelectOnly("SELECT 1; DELETE FROM events")).toThrow(
      "multiple statements not allowed",
    );
  });
});

describe("warehouse mapping", () => {
  it("requires non-empty core mapping columns and validates optional dimensions/grain", () => {
    expect(validateMapping(null)).toEqual({ ok: false, reason: "mapping missing" });
    expect(
      validateMapping({ metric_key_column: "", value_column: "value", period_column: "period" }),
    ).toEqual({ ok: false, reason: "mapping.metric_key_column required" });
    expect(
      validateMapping({
        metric_key_column: "metric",
        value_column: "value",
        period_column: "period",
        period_grain: "year",
      }),
    ).toEqual({ ok: false, reason: "mapping.period_grain invalid" });
    expect(
      validateMapping({
        metric_key_column: "metric",
        value_column: "value",
        period_column: "period",
        dimension_columns: "region",
      }),
    ).toEqual({ ok: false, reason: "mapping.dimension_columns must be an array" });
  });

  it("normalizes a valid mapping and converts row identifiers/units to strings", () => {
    const result = validateMapping({
      metric_key_column: " metric ",
      value_column: "value",
      period_column: "period",
      period_grain: "month",
      unit_column: "unit",
      dimension_columns: ["region", "region"],
      entity_external_id_column: "entity_id",
      entity_type: "account",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mapping.dimension_columns).toEqual(["region"]);

    expect(
      rowToCanonicalMetric(
        {
          metric: "Revenue",
          value: "1,250",
          period: "2026-08-01",
          unit: 123,
          region: "DE",
          entity_id: 456,
        },
        result.mapping,
      ),
    ).toMatchObject({
      metric_key: "Revenue",
      value: 1250,
      period_start: "2026-08-01",
      period_grain: "month",
      unit: "123",
      dimensions: { region: "DE" },
      entity_external_id: "456",
      entity_type: "account",
    });
  });

  it("keeps the helper free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/warehouse-config.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
    expect(source).toContain("maskSqlNonCode");
    expect(source).toContain("OUTER_LIMIT_PATTERN");
  });
});
