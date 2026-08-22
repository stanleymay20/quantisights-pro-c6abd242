import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const helper = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/inline-connector-pull.ts"),
  "utf8",
);
const dispatcher = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-pull/index.ts"),
  "utf8",
);

describe("connector-pull persistence contract", () => {
  it("centralizes inline metric persistence behind a checked helper", () => {
    expect(helper).toContain("async function persistMetrics(");
    expect(helper).toContain('from("metrics").upsert');
    expect(helper).toContain("if (error) throw new Error(`metrics persistence failed:");
    expect(helper).toContain("persisted = metrics.length;");
  });

  it("does not advance freshness when an upstream read is partial", () => {
    expect(helper).toContain("if (upstreamErrors.length === 0)");
    expect(helper).toContain("last_synced_at");
    expect(helper).toContain("data source freshness update failed");
  });

  it("never reports generated metric count directly from provider implementations", () => {
    expect(helper).not.toMatch(/return\s*\{\s*records:\s*metrics\.length/);
    expect(dispatcher).not.toMatch(/return\s*\{\s*records:\s*metrics\.length/);
  });

  it("keeps formerly duplicated connector families delegated to dedicated functions", () => {
    for (const fn of [
      "connector-snowflake-pull",
      "connector-bigquery-pull",
      "connector-s3-pull",
      "connector-hubspot-pull",
      "connector-salesforce-pull",
      "connector-sap-pull",
      "connector-netsuite-pull",
      "connector-dynamics-pull",
      "connector-sheets-pull",
    ]) {
      expect(dispatcher).toContain(fn);
    }
  });
});
