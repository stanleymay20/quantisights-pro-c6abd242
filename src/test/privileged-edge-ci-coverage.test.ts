import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ci = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("privileged Edge CI coverage", () => {
  it("Deno-checks security-sensitive data, database/connector, ingestion, aggregation, orchestration, execution, forecasting, contradiction, advisory, trust, automatic-decision, outcome, and decision-value functions", () => {
    for (const path of [
      "supabase/functions/delete-account/index.ts",
      "supabase/functions/api-ingest/index.ts",
      "supabase/functions/webhook-ingest/index.ts",
      "supabase/functions/event-stream/index.ts",
      "supabase/functions/queued-metric-ingest/index.ts",
      "supabase/functions/process-metric-ingest-queue/index.ts",
      "supabase/functions/refresh-aggregates/index.ts",
      "supabase/functions/ingest-csv-pipeline/index.ts",
      "supabase/functions/ingest-external-signals/index.ts",
      "supabase/functions/connector-rest-sync/index.ts",
      "supabase/functions/connector-pull/index.ts",
      "supabase/functions/db-connector/index.ts",
      "supabase/functions/connector-sheets-pull/index.ts",
      "supabase/functions/connector-dynamics-pull/index.ts",
      "supabase/functions/connector-netsuite-pull/index.ts",
      "supabase/functions/connector-dq-compute/index.ts",
      "supabase/functions/connector-sap-discover/index.ts",
      "supabase/functions/connector-sap-pull/index.ts",
      "supabase/functions/connector-bigquery-pull/index.ts",
      "supabase/functions/connector-snowflake-pull/index.ts",
      "supabase/functions/connector-s3-pull/index.ts",
      "supabase/functions/executive-orchestration/index.ts",
      "supabase/functions/execution-intelligence/index.ts",
      "supabase/functions/predictive-forecast/index.ts",
      "supabase/functions/supplier-risk-runtime-ingest/index.ts",
      "supabase/functions/detect-executive-contradictions/index.ts",
      "supabase/functions/prescriptive-advisory/index.ts",
      "supabase/functions/compute-trust-metrics/index.ts",
      "supabase/functions/auto-create-decisions/index.ts",
      "supabase/functions/aicis-auto-decisions/index.ts",
      "supabase/functions/aicis-evaluate-outcomes/index.ts",
      "supabase/functions/decision-value-summary/index.ts",
    ]) {
      expect(ci).toContain(
        `deno check --config supabase/functions/deno.json ${path}`,
      );
    }
  });
});
