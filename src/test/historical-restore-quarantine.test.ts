import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260903090000_historical_restore_quarantine_v1.sql",
  ),
  "utf8",
);

describe("historical restore quarantine", () => {
  it("keeps restore data outside the public application schema", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS restore_quarantine");
    expect(migration).toContain("REVOKE ALL ON SCHEMA restore_quarantine FROM anon");
    expect(migration).toContain("REVOKE ALL ON SCHEMA restore_quarantine FROM authenticated");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("does not grant browser roles access to quarantine tables", () => {
    expect(migration).toContain(
      "REVOKE ALL ON ALL TABLES IN SCHEMA restore_quarantine FROM anon",
    );
    expect(migration).toContain(
      "REVOKE ALL ON ALL TABLES IN SCHEMA restore_quarantine FROM authenticated",
    );
    expect(migration).not.toMatch(/GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*\sTO\s+(?:anon|authenticated)/i);
  });

  it("exposes no browser-callable promotion or security-definer path", () => {
    expect(migration).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\./i);
    expect(migration).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(migration).not.toMatch(/GRANT\s+EXECUTE/i);
  });

  it("stores source rows without promoting them into public tenant tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS restore_quarantine.rows");
    expect(migration).toContain("payload jsonb NOT NULL");
    expect(migration).toContain("payload_md5 text GENERATED ALWAYS AS (md5(payload::text)) STORED");
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(migration).not.toMatch(/UPDATE\s+public\./i);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\./i);
  });

  it("tracks per-table counts, chunks, and explicit auth identity remapping", () => {
    expect(migration).toContain("restore_quarantine.table_manifest");
    expect(migration).toContain("expected_row_count bigint NOT NULL");
    expect(migration).toContain("restore_quarantine.chunks");
    expect(migration).toContain("source_chunk_md5 text");
    expect(migration).toContain("restore_quarantine.identity_map");
    expect(migration).toContain("source_user_id uuid NOT NULL");
    expect(migration).toContain("destination_user_id uuid NOT NULL");
  });

  it("limits quarantine rows to the controlled historical table set", () => {
    for (const table of [
      "organizations",
      "profiles",
      "organization_members",
      "workspaces",
      "workspace_members",
      "projects",
      "kpis",
      "decision_ledger",
      "insights",
      "data_sources",
      "reports",
      "datasets",
      "dataset_versions",
      "raw_records",
      "metrics",
      "metric_aggregates",
      "decision_outcomes",
      "forecast_results",
      "scenario_results",
      "executive_briefs",
      "audit_log",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
  });
});
