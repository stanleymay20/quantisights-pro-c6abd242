import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Trust Center connector_health_pct (audit: '100%' not reflecting AICIS outage)", () => {
  // Nothing in the codebase ever inserted into connector_health_snapshots
  // (grep across supabase/functions found zero writers), so the query
  // always returned an empty result set and connector_health_pct silently
  // kept its hardcoded 100 default -- a real AICIS outage that set
  // external_data_sources.last_error never moved this number. Switched to
  // reading external_data_sources.last_error, which sync-aicis-bridge and
  // other connector pipelines actually write to on failure.
  const source = read("supabase/functions/compute-trust-metrics/index.ts");

  it("no longer reads from the never-populated connector_health_snapshots table", () => {
    expect(source).not.toContain('svc.from("connector_health_snapshots")');
  });

  it("derives connector_health_pct from external_data_sources.last_error", () => {
    expect(source).toContain('svc.from("external_data_sources").select("last_error")');
    expect(source).toContain("eds.filter((r: any) => !r.last_error)");
  });

  // Round 3: last_error alone still wasn't enough -- sync-aicis-bridge
  // clears it on any surface landing even while another surface keeps
  // failing, so a real single-surface outage stayed invisible. See
  // audit-round3-batch.test.ts for the aicis_sync_surface_status fold-in.
  it("also factors in AICIS per-surface circuit-breaker state, per the round-3 fix", () => {
    expect(source).toContain('source_tables: ["external_data_sources", "aicis_sync_surface_status"]');
  });

  it("does not convert missing connector evidence into a favorable 100% health score", () => {
    expect(source).toContain("let connector_health_pct: number | null = null;");
    expect(source).toContain("connector_health_pct === null ? \"No connector evidence or an evidence query failed; health is unknown.\"");
    expect(source).not.toContain("let connector_health_pct = 100");
    expect(source).not.toContain("connector_health_pct = 100");
  });
});

describe("compute-trust-metrics fail-closed evidence handling", () => {
  const source = read("supabase/functions/compute-trust-metrics/index.ts");

  it("keeps privileged or unmeasured coverage unknown instead of fabricating pass rates", () => {
    expect(source).toContain("const rls_coverage_pct = null;");
    expect(source).toContain("const audit_coverage_pct = null;");
    expect(source).toContain("Source-code policy presence is not production evidence.");
    expect(source).toContain("Coverage requires comparison of auditable mutation classes");
  });

  it("renders unknown metric labels and missing statuses for nullable control evidence", () => {
    expect(source).toContain('const displayPct = (value: number | null) => value === null ? "unknown"');
    expect(source).toContain('value === null ? "missing"');
    expect(source).toContain("status: thresholdStatus(retention_compliance_pct, 90, 70)");
    expect(source).toContain("status: thresholdStatus(explainability_coverage_pct, 95, 70)");
    expect(source).toContain("status: thresholdStatus(drift_monitor_coverage_pct, 50, 1)");
    expect(source).not.toContain("currently ${retention_compliance_pct}%");
    expect(source).not.toContain("currently ${drift_monitor_coverage_pct}%");
  });

  it("shows nullable live Trust Center metrics as explicit unknowns", () => {
    const component = read("src/components/security/LiveTrustMetrics.tsx");
    expect(component).toContain('? "Unknown"');
  });
});
