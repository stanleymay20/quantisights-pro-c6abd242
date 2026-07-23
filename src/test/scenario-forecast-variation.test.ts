import { describe, expect, it } from "vitest";
// ml-engine.ts is a pure-function module with zero Deno-specific APIs (no
// Deno.*, no esm.sh/deno.land imports), so it's directly importable here —
// this is the same function simulate-scenario/index.ts now uses to replace
// its flat "same average repeated every date" projection.
import { arimaForecast } from "../../supabase/functions/_shared/ml-engine";

describe("simulate-scenario day-by-day forecast (P0: static/fabricated-looking projections)", () => {
  // Root cause: simulate-scenario computed one flat 30-point average per
  // metric OUTSIDE the date loop, then reused that identical number as the
  // baseline for every single date in the forecast horizon — so
  // baseline_value/simulated_value/delta_value were bit-for-bit identical
  // across an entire scenario's projections. Replaced with arimaForecast,
  // which projects a genuine per-date trajectory.

  it("produces a distinct value per requested horizon step for a trending series", () => {
    const trending = Array.from({ length: 30 }, (_, i) => 1000 + i * 25); // clear upward trend
    const { forecast } = arimaForecast(trending, 10);
    expect(forecast).toHaveLength(10);
    const unique = new Set(forecast.map((v) => Math.round(v * 100)));
    expect(unique.size).toBeGreaterThan(1);
    for (const v of forecast) expect(Number.isFinite(v)).toBe(true);
  });

  it("still returns a safe, finite, non-crashing forecast for a short series (honest flat output, not fabricated variation)", () => {
    const short = [100, 105, 98, 110];
    const { forecast } = arimaForecast(short, 5);
    expect(forecast).toHaveLength(5);
    for (const v of forecast) expect(Number.isFinite(v)).toBe(true);
  });

  it("simulate-scenario no longer reuses one flat average for every forecast date", () => {
    const source = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../../supabase/functions/simulate-scenario/index.ts"),
      "utf8",
    );
    expect(source).toContain('import { arimaForecast } from "../_shared/ml-engine.ts"');
    expect(source).toContain("metricForecasts[dep]?.[dateIndex]");
    // The old bug: baseVal sourced ONLY from the flat average inside the date loop.
    expect(source).not.toMatch(/const baseVal = metricAverages\[dep\] \|\| 0;/);
  });

  it("generate-board-report picks one row per KPI instead of an unordered top-N across all KPIs/dates", () => {
    const source = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../../supabase/functions/generate-board-report/index.ts"),
      "utf8",
    );
    expect(source).toContain("latestByKpi");
    expect(source).toContain("Array.from(latestByKpi.values())");
  });
});
