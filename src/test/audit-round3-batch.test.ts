import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("audit round 3 batch fixes", () => {
  describe("Trust Center connector_health_pct still blind to single-surface AICIS outages", () => {
    // The round-2 fix (external_data_sources.last_error) wasn't enough:
    // sync-aicis-bridge clears last_error on ANY surface landing, even if
    // another surface (e.g. /signals) keeps failing. Trust metrics therefore
    // also consume the per-surface circuit-breaker state used by Bridge Health
    // and Pipeline Observability.
    const source = read("supabase/functions/compute-trust-metrics/index.ts");

    it("also queries aicis_sync_surface_status for circuit-breaker state", () => {
      expect(source).toContain('"aicis_sync_surface_status"');
      expect(source).toContain('"consecutive_failures,circuit_breaker_until"');
    });

    it("folds only healthy AICIS surfaces into connector_health_pct", () => {
      expect(source).toContain("externalSources.length + aicisSurfaces.length");
      expect(source).toContain("const breakerActive = row.circuit_breaker_until");
      expect(source).toContain("return !breakerActive && Number(row.consecutive_failures ?? 0) < 3;");
      expect(source).toContain("/ connectorSample * 1000) / 10");
      expect(source).toContain('source_tables: ["external_data_sources", "aicis_sync_surface_status"]');
    });
  });

  describe("Board Report simulation section flags degenerate identical/zero-delta projections", () => {
    const source = read("src/components/board-report/SimulationSection.tsx");

    it("detects all-zero-delta and all-identical-value projections", () => {
      expect(source).toContain("allZeroDelta");
      expect(source).toContain("allIdenticalValue");
    });

    it("shows an explanatory caveat instead of presenting them as normal", () => {
      expect(source).toContain("may not target a metric any of these");
    });
  });

  describe("Intelligence Inbox no longer shows a structurally-always-empty TrustStrip", () => {
    const source = read("src/pages/IntelligenceInbox.tsx");

    it("removed the trustFromAdvisory-based TrustStrip for aicis_intelligence_items", () => {
      expect(source).not.toContain('import { trustFromExecutiveBrief, trustFromAdvisory }');
      expect(source).not.toMatch(/record=\{trustFromAdvisory\(/);
    });

    it("still renders TrustStrip for briefs, which do have matching confidence data", () => {
      expect(source).toContain("trustFromExecutiveBrief");
      expect(source).toContain("record={trustFromExecutiveBrief(b, orgId)}");
    });
  });

  describe("Billing date stale beyond the round-2 webhook fix — proactive reconciliation added", () => {
    it("check-subscription reconciles current_period_end against Stripe, only writing on real drift", () => {
      const source = read("supabase/functions/check-subscription/index.ts");
      expect(source).toContain("driftDetected");
      expect(source).toContain("current_period_end: subscriptionEnd");
      expect(source).toContain('.eq("stripe_subscription_id", subscription.id)');
    });

    it("useSubscription reconciles active Stripe subscriptions but never synthetic pilot rows", () => {
      const source = read("src/hooks/useSubscription.ts");
      expect(source).toContain('supabase.functions.invoke("check-subscription")');
      expect(source).toContain("if (isActive && !isPilot) {");
      expect(source).toContain('stripe_subscription_id?.startsWith("pilot_")');
    });
  });

  describe("OKRs default quarter no longer hardcoded to a fixed past/future year", () => {
    const source = read("src/pages/OKRs.tsx");

    it("derives TIME_PERIODS and the default selection from the real current date", () => {
      expect(source).toContain("const CURRENT_YEAR = new Date().getFullYear();");
      expect(source).toContain("const CURRENT_QUARTER = Math.floor(new Date().getMonth() / 3) + 1;");
      expect(source).toContain("useState(DEFAULT_TIME_PERIOD)");
      expect(source).not.toContain('useState("Q1 2026")');
    });
  });
});
