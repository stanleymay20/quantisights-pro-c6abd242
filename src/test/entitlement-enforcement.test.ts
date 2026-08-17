import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

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

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("plan entitlement enforcement", () => {
  it("tags every paid route with the entitlement key it requires", () => {
    const routes = read("src/routes/index.tsx");
    for (const [path, feature] of Object.entries(GATED_ROUTES)) {
      const routePattern = new RegExp(
        `\\{[^}]*path:\\s*["']${escapeRegExp(path)}["'][^}]*feature:\\s*["']${escapeRegExp(feature)}["'][^}]*\\}`,
      );
      expect(routes, `route ${path} is not gated by ${feature}`).toMatch(routePattern);
    }
  });

  it("keeps every route entitlement key in the tier matrix", () => {
    const tiers = read("src/hooks/useSubscriptionGate.ts");
    for (const feature of new Set(Object.values(GATED_ROUTES))) {
      expect(tiers, `missing tier definition for ${feature}`).toMatch(
        new RegExp(`\\b${escapeRegExp(feature)}\\s*:`),
      );
    }
  });

  it("renders gated routes through the entitlement boundary", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("RouteEntitlement");
    expect(app).toContain("feature ? <RouteEntitlement feature={feature}>");
  });

  it("keeps representative growth and enterprise tier boundaries explicit", () => {
    const tiers = read("src/hooks/useSubscriptionGate.ts");
    expect(tiers).toMatch(/simulations:\s*\["growth",\s*"enterprise"\]/);
    expect(tiers).toMatch(/biasDetection:\s*\["enterprise"\]/);
    expect(tiers).toContain("requiredTierFor");
  });

  it("enforces entitlements server-side, not only in the UI", () => {
    const mc = read("supabase/functions/monte-carlo-sim/index.ts");
    expect(mc).toContain('requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "simulations")');

    const board = read("supabase/functions/generate-board-report/index.ts");
    expect(board).toContain('requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "boardExport")');
    expect(board).not.toContain('.eq("status", "active").maybeSingle()');

    const forecast = read("supabase/functions/predictive-forecast/index.ts");
    expect(forecast).toContain('"forecasting"');
  });
});
