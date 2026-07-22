import { describe, it, expect } from "vitest";
import { buildOntologyReport } from "@/lib/ontology/kpi-ontology";
import { routeToExecutives } from "@/lib/semantic/executive-routing";

describe("Executive Routing", () => {
  it("routes Revenue + Margin + Cash to CFO", () => {
    const r = routeToExecutives(buildOntologyReport(["revenue", "gross_margin", "cash_flow"]));
    expect(r.recommendedDashboards[0].role).toBe("CFO");
  });

  it("routes Inventory + Downtime + Defects to COO", () => {
    const r = routeToExecutives(
      buildOntologyReport(["inventory_turnover", "downtime", "defect_rate"]),
    );
    expect(r.recommendedDashboards[0].role).toBe("COO");
  });

  it("routes NPS + Churn + Satisfaction to CMO", () => {
    const r = routeToExecutives(buildOntologyReport(["nps", "churn_rate", "csat"]));
    expect(r.recommendedDashboards[0].role).toBe("CMO");
  });

  it("routes Headcount + Attrition to CHRO", () => {
    const r = routeToExecutives(buildOntologyReport(["headcount", "attrition"]));
    expect(r.recommendedDashboards[0].role).toBe("CHRO");
  });

  it("routes Risk + Compliance to CRO", () => {
    const r = routeToExecutives(buildOntologyReport(["risk_score", "compliance_score"]));
    expect(r.recommendedDashboards[0].role).toBe("CRO");
  });

  it("returns no recommendations when no canonical KPIs are matched", () => {
    const r = routeToExecutives(buildOntologyReport(["random_column_x", "noise_y"]));
    expect(r.recommendedDashboards).toEqual([]);
    expect(r.confidence).toBe(0);
  });

  it("caps recommendations at 3", () => {
    const r = routeToExecutives(
      buildOntologyReport([
        "revenue", "gross_margin", "cash_flow",
        "inventory_turnover", "downtime",
        "nps", "churn_rate",
        "headcount", "attrition",
        "risk_score", "compliance_score",
      ]),
    );
    expect(r.recommendedDashboards.length).toBeLessThanOrEqual(3);
  });
});
