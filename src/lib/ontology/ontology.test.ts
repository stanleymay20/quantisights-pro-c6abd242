import { describe, it, expect } from "vitest";
import { matchKpi, buildOntologyReport, KPI_ONTOLOGY_VERSION } from "@/lib/ontology/kpi-ontology";

describe("KPI Ontology", () => {
  it("exposes a stable version", () => {
    expect(KPI_ONTOLOGY_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches exact canonical keys", () => {
    const m = matchKpi("revenue");
    expect(m?.kpi.key).toBe("revenue");
    expect(m?.matchType).toBe("exact");
    expect(m?.confidence).toBe(1);
  });

  it("matches known synonyms", () => {
    expect(matchKpi("turnover")?.kpi.key).toBe("revenue");
    expect(matchKpi("net_sales")?.kpi.key).toBe("revenue");
    expect(matchKpi("dso")?.kpi.key).toBe("ar_days");
    expect(matchKpi("Umsatz")?.kpi.key).toBe("revenue");
  });

  it("handles fuzzy variants", () => {
    const m = matchKpi("revenu"); // typo
    expect(m?.kpi.key).toBe("revenue");
    expect(m?.matchType).toBe("fuzzy");
    expect(m?.confidence).toBeGreaterThan(0.6);
  });

  it("matches contained synonyms inside compound headers", () => {
    const m = matchKpi("total_revenue_usd");
    expect(m?.kpi.key).toBe("revenue");
  });

  it("returns null for unknown columns", () => {
    expect(matchKpi("xyzqwerty")).toBeNull();
  });

  it("buildOntologyReport groups by category", () => {
    const r = buildOntologyReport(["revenue", "gross_margin", "churn_rate", "headcount"]);
    expect(r.matches.length).toBe(4);
    expect(r.byCategory.financial).toBe(2);
    expect(r.byCategory.customer).toBe(1);
    expect(r.byCategory.people).toBe(1);
  });

  it("collects unmatched columns", () => {
    const r = buildOntologyReport(["revenue", "foo_bar_baz"]);
    expect(r.unmatched).toContain("foo_bar_baz");
  });
});
