import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Decision velocity evidence surfaces", () => {
  it("continues to reuse the canonical Decision Intelligence route and existing velocity components", () => {
    const page = read("src/pages/DecisionIntelligence.tsx");
    expect(page).toContain("<DecisionVelocity decisions={decisions} />");
    expect(page).toContain("<DecisionVelocityCurve decisions={decisions} />");
    expect(page).toContain('.eq("organization_id", currentOrgId)');
  });

  it("does not misreport a failed organization query as a healthy empty state", () => {
    const page = read("src/pages/DecisionIntelligence.tsx");
    expect(page).toContain("decRes.error || simRes.error || !decRes.data || !simRes.data");
    expect(page).toContain("loadedOrgId !== currentOrgId");
    expect(page).toContain('role="alert"');
  });

  it("never labels an internal completion as independently verified external action", () => {
    const tracker = read("src/components/decision-intelligence/DecisionVelocity.tsx");
    expect(tracker).toContain("calculateDecisionVelocity");
    expect(tracker).toContain("internal");
    expect(tracker).toContain("does not prove an external provider completed its action");
    expect(tracker).toContain("valid");
  });

  it("does not manufacture an optimal speed or outcome success from raw signed deltas", () => {
    const curve = read("src/components/decision-intelligence/DecisionVelocityCurve.tsx");
    expect(curve).not.toContain("optimalZone:");
    expect(curve).not.toContain("outcome_delta >= 0");
    expect(curve).not.toContain("Paralysis Index");
    expect(curve).toContain("No optimal-speed or success-rate claim");
  });
});
