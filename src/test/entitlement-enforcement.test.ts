import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { routes } from "@/routes";
import { FEATURE_TIERS, requiredTierFor } from "@/hooks/useSubscriptionGate";

const read = (p: string) => readFileSync(p, "utf8");

/**
 * Regression cover for the GA customer-acceptance audit:
 * paid capabilities must be gated in the UI *and* enforced server-side.
 */
describe("plan entitlement enforcement", () => {
  const GATED_ROUTES: Record<string, string> = {
    "/simulations": "simulations",
    "/forecasting": "forecasting",
    "/advisory": "advisory",
    "/causal-inference": "causalInference",
    "/benchmarking": "benchmarking",
    "/alert-playbooks": "alertPlaybooks",
    "/okrs": "okrAlignment",
    "/aicis-sync": "aicisIntegration",
    "/lineage": "dataLineage",
    "/market-intelligence": "marketIntelligence",
    "/cognitive-bias": "biasDetection",
    "/counterfactual": "counterfactual",
    "/branching": "scenarioBranching",
    "/sso": "sso",
  };

  it("tags every paid route with the entitlement key it requires", () => {
    for (const [path, feature] of Object.entries(GATED_ROUTES)) {
      const entry = routes.find((r) => r.path === path);
      expect(entry, `route ${path} missing`).toBeTruthy();
      expect(entry?.feature, `route ${path} not gated`).toBe(feature);
    }
  });

  it("only uses entitlement keys that exist in the tier matrix", () => {
    for (const r of routes) {
      if (r.feature) expect(FEATURE_TIERS[r.feature]).toBeTruthy();
    }
  });

  it("renders gated routes through the entitlement boundary", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("RouteEntitlement");
    expect(app).toContain("feature ? <RouteEntitlement feature={feature}>");
  });

  it("derives upgrade messaging from the lowest tier that unlocks a feature", () => {
    expect(requiredTierFor("simulations")).toBe("growth");
    expect(requiredTierFor("biasDetection")).toBe("enterprise");
  });

  it("enforces entitlements server-side, not only in the UI", () => {
    const mc = read("supabase/functions/monte-carlo-sim/index.ts");
    expect(mc).toContain('requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "simulations")');

    const board = read("supabase/functions/generate-board-report/index.ts");
    expect(board).toContain('requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "boardExport")');
    // The ad-hoc lookup below denied board reports to trialing/grace subscriptions.
    expect(board).not.toContain('.eq("status", "active").maybeSingle()');

    const forecast = read("supabase/functions/predictive-forecast/index.ts");
    expect(forecast).toContain('"forecasting"');
  });
});
