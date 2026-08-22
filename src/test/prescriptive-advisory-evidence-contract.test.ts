import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/prescriptive-advisory/index.ts"),
  "utf8",
);

describe("prescriptive advisory evidence contract", () => {
  it("checks source-system HTTP responses before using their data", () => {
    expect(source).toContain("async function fetchChecked(");
    expect(source).toContain("if (!response.ok)");
    expect(source).toContain('"metrics read"');
    expect(source).toContain('"risk index read"');
    expect(source).toContain('"insights read"');
  });

  it("does not fabricate missing model confidence", () => {
    expect(source).not.toContain("a.raw_confidence || 70");
    expect(source).toContain("rawConfidence === null");
    expect(source).toContain("rawConfidence: null");
  });

  it("does not persist LLM-authored quantified impact as evidence", () => {
    expect(source).toContain('const UNQUANTIFIED_IMPACT = "Not quantified from available evidence"');
    expect(source).toContain("Do not fabricate monetary savings, ROI, percentages, or causal impact");
    expect(source).toContain("impact_quantified: false");
  });

  it("requires advisory persistence and governance evidence before superseding the old set", () => {
    const insertAt = source.indexOf('"advisory persistence"');
    const governanceAt = source.indexOf("await Promise.all(inserted.map((row) => recordGovernanceUse");
    const supersedeAt = source.indexOf('"previous advisory supersession"');
    expect(insertAt).toBeGreaterThan(-1);
    expect(governanceAt).toBeGreaterThan(insertAt);
    expect(supersedeAt).toBeGreaterThan(governanceAt);
  });

  it("cleans up newly inserted advisories if required governance evidence fails", () => {
    expect(source).toContain("cleanupInsertedAdvisories");
    expect(source).toContain("Governance evidence persistence failed");
  });

  it("returns persisted rows rather than transient generated drafts", () => {
    expect(source).toContain("advisories: inserted");
    expect(source).toContain("persisted: true");
    expect(source).toContain("governance_evidence_persisted: true");
  });
});
