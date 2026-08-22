import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/compute-trust-metrics/index.ts"),
  "utf8",
);

describe("trust readiness evidence contract", () => {
  it("does not hard-code documentary/legal controls as met", () => {
    for (const key of [
      "gdpr_dpa_available",
      "gdpr_toms_published",
      "gdpr_subprocessor_registry",
      "aia_classification_documented",
      "aia_human_oversight",
      "sec_security_txt",
      "sec_disclosure_policy",
      "sec_incident_response",
      "aig_confidence_capping",
      "vt_change_notice",
    ]) {
      expect(source).toContain(`"${key}"`);
    }
    expect(source).toContain("unknownControl(");
  });

  it("leaves RLS and audit coverage unknown without independent probes", () => {
    expect(source).toContain("const rls_coverage_pct: number | null = null");
    expect(source).toContain("const audit_coverage_pct: number | null = null");
    expect(source).toContain("Audit-row presence alone is not control coverage");
  });

  it("checks every procurement-readiness persistence result", () => {
    expect(source).toContain('const { error } = await svc.from("procurement_readiness_items").upsert');
    expect(source).toContain("Procurement readiness persistence failed at");
    expect(source).toContain("readinessUpdated += 1");
  });

  it("can repair readiness on a day whose immutable trust snapshot already exists", () => {
    const existingAt = source.indexOf("if (existingSnapshot?.id)");
    const readinessAt = source.indexOf("const readiness = [");
    expect(existingAt).toBeGreaterThan(-1);
    expect(readinessAt).toBeGreaterThan(existingAt);
    expect(source).not.toContain('skipped: "snapshot already exists for date"');
  });

  it("reports the persisted readiness count rather than attempted length", () => {
    expect(source).toContain("readiness_updated: readinessUpdated");
    expect(source).toContain("readiness_total: readiness.length");
  });
});
