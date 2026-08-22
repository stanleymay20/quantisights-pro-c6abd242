import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const handler = readFileSync(
  resolve(process.cwd(), "supabase/functions/db-connector/index.ts"),
  "utf8",
);
const runtime = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/db-connector-runtime.ts"),
  "utf8",
);

describe("db-connector production contract", () => {
  it("requires owner/admin membership in the target organization", () => {
    expect(handler).toContain('from("organization_members")');
    expect(handler).toContain('.eq("user_id", user.id)');
    expect(handler).toContain('.eq("organization_id", body.organization_id)');
    expect(handler).toContain('new Set(["owner", "admin"])');
    expect(handler).toContain("Forbidden — owner or admin required");
  });

  it("tenant-binds connector config and data source identifiers", () => {
    expect(handler).toMatch(/from\("connector_configs"\)[\s\S]*eq\("organization_id", body\.organization_id\)/);
    expect(handler).toMatch(/from\("data_sources"\)[\s\S]*eq\("organization_id", body\.organization_id\)/);
  });

  it("counts only confirmed persisted metric batches and gates freshness", () => {
    expect(runtime).toContain("records += batch.length");
    expect(runtime).toContain("if (errors.length === 0 && records === rows.length)");
    expect(runtime).not.toMatch(/return\s*\{\s*records:\s*metrics\.length/);
  });

  it("does not call a TCP socket reachability check a successful database login", () => {
    expect(runtime).not.toContain("Deno.connect");
    expect(runtime).toContain('connectorType === "mysql" || connectorType === "sqlserver"');
    expect(runtime).toContain("A TCP socket alone is not treated as a successful database login");
  });

  it("validates BigQuery against the real API", () => {
    expect(runtime).toContain("bigquery.googleapis.com/bigquery/v2/projects/");
    expect(runtime).toContain("BigQuery API validation failed");
  });

  it("does not pretend direct Snowflake Basic-auth is production supported", () => {
    expect(runtime).toContain('connectorType === "snowflake"');
    expect(runtime).toContain("Use the managed Snowflake connector");
    expect(runtime).toContain("return result(501");
  });
});
