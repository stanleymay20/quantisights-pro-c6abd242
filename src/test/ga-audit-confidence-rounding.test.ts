import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// Confidence/accuracy/probability/score values throughout the app are raw
// DB floats (e.g. 85.79166666666667) displayed directly with a literal "%"
// suffix — no rounding anywhere. Spot-checks a representative sample of the
// ~80 call sites now wrapped in Math.round(); not exhaustive, but covers
// the exact example from the audit (DecisionHistory.tsx) plus a spread
// across pages/components/admin surfaces.
describe("confidence/accuracy/probability values are rounded before display", () => {
  const cases: Array<[string, string]> = [
    ["src/pages/DecisionHistory.tsx", "{Math.round(r.confidence_at_decision)}%"],
    ["src/pages/DecisionLedger.tsx", "{Math.round(simResult.probability_positive_roi)}%"],
    ["src/pages/Simulations.tsx", "{Math.round(latest.capped_confidence)}%"],
    ["src/pages/ExecutiveIntelligence.tsx", "{Math.round(s.confidence)}%"],
    ["src/pages/CausalInference.tsx", "{Math.round(result.confidence)}%"],
    ["src/pages/DataCatalog.tsx", "{Math.round(selectedProfile.quality_score)}%"],
    ["src/pages/admin/GovernanceSimulation.tsx", "{Math.round(r.outcome.capped_confidence)}%"],
    ["src/components/dashboard/ExecutiveDailyDriver.tsx", "{Math.round(decision.capped_confidence)}%"],
    ["src/components/dashboard/DecisionMemoryWidget.tsx", "{Math.round(accuracy)}%"],
    ["src/components/portfolio/PortfolioCompanyDetail.tsx", "{Math.round(company.ownership_pct)}%"],
  ];

  for (const [path, expected] of cases) {
    it(`${path} rounds before rendering`, () => {
      expect(read(path)).toContain(expected);
    });
  }
});
