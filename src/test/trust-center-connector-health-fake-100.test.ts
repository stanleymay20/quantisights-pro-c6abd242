import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Trust Center connector_health_pct (audit: '100%' not reflecting AICIS outage)", () => {
  const source = read("supabase/functions/compute-trust-metrics/index.ts");

  it("no longer reads from the never-populated connector_health_snapshots table", () => {
    expect(source).not.toContain('svc.from("connector_health_snapshots")');
  });

  it("derives connector health from live external-source and AICIS surface evidence", () => {
    expect(source).toContain('safeRows<{ last_error?: string | null }>("external_data_sources", "last_error")');
    expect(source).toContain('"aicis_sync_surface_status"');
    expect(source).toContain("externalSources.filter((row) => !row.last_error).length");
    expect(source).toContain("Number(row.consecutive_failures ?? 0) < 3");
  });

  it("records both connector evidence sources in provenance", () => {
    expect(source).toContain('source_tables: ["external_data_sources", "aicis_sync_surface_status"]');
    expect(source).toContain("healthy external sources plus AICIS surfaces with closed circuit breakers");
  });

  it("does not convert missing connector evidence into a favorable 100% health score", () => {
    expect(source).toContain("externalSources !== null && aicisSurfaces !== null && connectorSample > 0");
    expect(source).toMatch(/const connector_health_pct =[\s\S]*?: null;/);
    expect(source).toContain('confidence: connector_health_pct === null ? "low" : "high"');
    expect(source).not.toContain("let connector_health_pct = 100");
    expect(source).not.toContain("connector_health_pct = 100");
  });
});

describe("compute-trust-metrics fail-closed evidence handling", () => {
  const source = read("supabase/functions/compute-trust-metrics/index.ts");

  it("keeps privileged or unmeasured coverage unknown instead of fabricating pass rates", () => {
    expect(source).toContain("const rls_coverage_pct: number | null = null;");
    expect(source).toContain("const audit_coverage_pct: number | null = null;");
    expect(source).toContain("Row counts are not proof");
    expect(source).toContain("Requires privileged catalog scan of exposed tables and effective policies");
    expect(source).toContain("Requires comparison of enumerated mutation classes with required and observed audit events");
  });

  it("renders unknown metric labels and missing statuses for nullable control evidence", () => {
    expect(source).toContain("function displayPct(value: number | null)");
    expect(source).toContain('return value === null ? "unknown"');
    expect(source).toContain('return value === null ? "missing"');
    expect(source).toContain("status: thresholdStatus(retention_compliance_pct, 90, 70)");
    expect(source).toContain("status: thresholdStatus(explainability_coverage_pct, 95, 70)");
    expect(source).toContain("status: thresholdStatus(drift_monitor_coverage_pct, 50, 1)");
  });

  it("shows nullable live Trust Center metrics as explicit unknowns", () => {
    const component = read("src/components/security/LiveTrustMetrics.tsx");
    expect(component).toContain('? "Unknown"');
  });
});
