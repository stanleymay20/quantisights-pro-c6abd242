import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const edge = readFileSync(
  resolve(process.cwd(), "supabase/functions/refresh-aggregates/index.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260822110000_server_side_metric_aggregates.sql"),
  "utf8",
);

describe("enterprise aggregate refresh contract", () => {
  it("keeps raw metric aggregation inside Postgres", () => {
    expect(edge).toContain('"refresh_metric_aggregates_scoped"');
    expect(migration).toContain("GROUP BY");
    expect(migration).toContain("INSERT INTO public.metric_aggregates");
    expect(migration).toContain("ON CONFLICT");
    expect(edge).not.toContain("allMetrics");
    expect(edge).not.toContain('from("metrics")');
    expect(edge).not.toContain("PAGE_SIZE");
  });

  it("bounds control-plane request memory and validates aggregate periods", () => {
    expect(edge).toContain("parseJsonBody(req, MAX_BODY_BYTES)");
    expect(edge).toContain("ALLOWED_PERIODS");
    expect(migration).toContain("unsupported aggregate period type");
  });

  it("re-proves dataset and pipeline scope before privileged writes", () => {
    expect(edge).toContain('from("datasets")');
    expect(edge).toContain('from("pipeline_runs")');
    expect(edge).toContain("Pipeline run does not belong to this organization");
    expect(edge).toContain("Pipeline run does not belong to the requested dataset");
  });

  it("requires summaries, audit evidence, and pipeline finalization for clean success", () => {
    expect(edge).toContain('rpc("refresh_metric_summaries"');
    expect(edge).toContain("Aggregate audit persistence failed");
    expect(edge).toContain("Pipeline completion persistence failed");
    expect(edge).toContain('status: "partial"');
    expect(edge).toContain('stage: "aggregate_failed"');
  });

  it("serializes refreshes for the same organization/dataset scope", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("metric_aggregates:");
  });
});
