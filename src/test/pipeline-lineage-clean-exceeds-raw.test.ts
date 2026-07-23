import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Data Pipeline funnel (audit: 'Raw 1,465 rows -> Clean 7,317 rows', 'Analytical: 0' next to 'Complete')", () => {
  // In multi-metric import mode, one raw row maps to N metric rows (one per
  // mapped value column). pipeline_runs.transformed_count was set from
  // `inserted`, the count of upserted METRIC rows, so a 5-value-column
  // import inflated "Clean" to ~5x "Raw" -- backwards for a funnel stage
  // that should only ever hold steady or shrink. Fixed by counting raw rows
  // that produced at least one metric instead.
  const source = read("src/pages/DataUpload.tsx");

  it("transformed_count is derived from a raw-row counter, not the metrics upsert count", () => {
    expect(source).toContain("let rawRowsCleaned = 0;");
    expect(source).toContain("if (rowProducedMetric) rawRowsCleaned++;");
    expect(source).toContain('pipeline_runs").update({ transformed_count: rawRowsCleaned, stage: "transform_complete" }');
    expect(source).not.toContain("transformed_count: inserted");
  });

  // invokeWithRetry() always resolves { data, error }, even after
  // exhausting retries -- it never rejects. Promise.allSettled therefore
  // always reports "fulfilled" for the refresh-aggregates call, so checking
  // only `aggResult.status === "rejected"` never caught a real failure, and
  // the pipeline was unconditionally finalized as stage "complete" /
  // status "completed" regardless -- showing an Analytical count stuck at
  // 0 (refresh-aggregates never got to write it) next to a "Complete" badge.
  it("checks aggResult.value.error, not just Promise rejection, to detect aggregation failure", () => {
    expect(source).toContain("aggResult.status === \"rejected\" ? true : !!aggResult.value.error");
  });

  it("only finalizes the pipeline run as complete when aggregation actually succeeded", () => {
    expect(source).toMatch(/aggFailed\s*\n\s*\? \{\s*\n\s*status: "failed",\s*\n\s*stage: "aggregating",/);
    expect(source).toContain('status: "completed",\n                stage: "complete",');
  });
});
