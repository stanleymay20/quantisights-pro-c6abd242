import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createUnavailableSubscriptionEvidence,
  maskSubscriptionEvidenceForScope,
} from "@/lib/subscription-evidence";

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

  it("masks paid evidence from a previous organization synchronously", () => {
    const orgAEvidence = {
      ...createUnavailableSubscriptionEvidence({ organizationId: "org-a" }),
      subscribed: true,
      tier: "enterprise" as const,
      hasSubscriptionRecord: true,
      evidenceReady: true,
    };

    const orgBEvidence = maskSubscriptionEvidenceForScope(orgAEvidence, "org-b", true);

    expect(orgBEvidence.organizationId).toBeNull();
    expect(orgBEvidence.evidenceReady).toBe(false);
    expect(orgBEvidence.loading).toBe(true);
    expect(orgBEvidence.subscribed).toBe(false);
    expect(orgBEvidence.tier).toBeNull();
    expect(orgBEvidence.hasSubscriptionRecord).toBe(false);
  });

  it("fails closed while entitlement evidence is loading or unavailable", () => {
    const gate = read("src/components/SubscriptionGate.tsx");
    const hook = read("src/hooks/useSubscription.ts");

    expect(gate).not.toContain("if (loading) return <>{children}</>;");
    expect(gate).toContain("Verifying subscription access");
    expect(gate).toContain("if (!evidenceReady || error)");
    expect(hook).not.toContain("setState((s) => ({ ...s, loading: false }))");
    expect(hook).toContain("createUnavailableSubscriptionEvidence");
    expect(hook).toContain("maskSubscriptionEvidenceForScope");
  });

  it("only offers a new pilot after verified subscription absence", () => {
    const gate = read("src/components/SubscriptionGate.tsx");
    expect(gate).toContain("const canStartPilot = !hasSubscriptionRecord;");
    expect(gate).toContain("const pilotEnded = hasSubscriptionRecord && !subscribed && isPilot;");
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
