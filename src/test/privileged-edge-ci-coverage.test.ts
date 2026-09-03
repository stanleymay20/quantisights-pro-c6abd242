import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ci = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("privileged Edge CI coverage", () => {
  it("runs pull-request CI even when controlled work is stacked on a non-main base", () => {
    expect(ci).toContain("pull_request:\n");
    expect(ci).not.toContain("pull_request:\n    branches: [main]");
  });

  it("Deno-checks security-sensitive commercial, demo, data, connector, orchestration and decision functions", () => {
    expect(ci).toContain("check_edge() {");
    expect(ci).toContain('config="$1"');
    expect(ci).toContain('file="$2"');
    expect(ci).toContain('deno check --config "$config" "$file"');

    for (const path of [
      "supabase/functions/delete-account/index.ts",
      "supabase/functions/create-checkout/index.ts",
      "supabase/functions/confirm-checkout/index.ts",
      "supabase/functions/check-subscription/index.ts",
      "supabase/functions/customer-portal/index.ts",
      "supabase/functions/stripe-webhook/index.ts",
      "supabase/functions/create-demo-session/index.ts",
      "supabase/functions/seed-demo-data/index.ts",
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
        `check_edge supabase/functions/deno.json ${path}`,
      );
    }
  });
});
