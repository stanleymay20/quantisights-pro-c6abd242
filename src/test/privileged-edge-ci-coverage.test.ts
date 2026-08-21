import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ci = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);

describe("privileged Edge CI coverage", () => {
  it("Deno-checks security-sensitive data, account, ingestion, and decision-value functions", () => {
    for (const path of [
      "supabase/functions/delete-account/index.ts",
      "supabase/functions/api-ingest/index.ts",
      "supabase/functions/webhook-ingest/index.ts",
      "supabase/functions/event-stream/index.ts",
      "supabase/functions/ingest-csv-pipeline/index.ts",
      "supabase/functions/connector-rest-sync/index.ts",
      "supabase/functions/connector-sheets-pull/index.ts",
      "supabase/functions/connector-bigquery-pull/index.ts",
      "supabase/functions/connector-snowflake-pull/index.ts",
      "supabase/functions/connector-s3-pull/index.ts",
      "supabase/functions/decision-value-summary/index.ts",
    ]) {
      expect(ci).toContain(
        `deno check --config supabase/functions/deno.json ${path}`,
      );
    }
  });
});
