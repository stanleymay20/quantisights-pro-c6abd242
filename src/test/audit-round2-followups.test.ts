import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("audit round 2 follow-up findings", () => {
  describe("Board Report vs Strategy Pack risk-score mismatch (48 vs 78)", () => {
    // Investigation: both pages query executive_risk_index identically
    // (compute-executive-signals upserts one row per (organization_id,
    // role_type), so it's a current-state table, not history), and both
    // correctly take the max score across roles. Not a code bug -- the
    // scores are genuinely recomputed periodically, so two live reports
    // generated minutes apart can show different real snapshots. The
    // fixable gap: Strategy Pack's header showed "today's date" (always
    // "now", not tied to the actual data) instead of when the risk data
    // was last computed, making the discrepancy look like an unexplained
    // contradiction rather than a live-data timing difference.
    it("Strategy Pack now selects last_updated and shows a data-freshness timestamp", () => {
      const source = read("src/pages/StrategyPack.tsx");
      expect(source).toContain("score, components, escalation_required, last_updated");
      expect(source).toContain("riskDataAsOf");
      expect(source).toContain("Risk data as of");
    });
  });

  describe("Dashboard 'Critical Risk' fabricated a signal from any pending decision", () => {
    it("criticalCount no longer falls back to 1 when there are zero real critical/high interventions", () => {
      const source = read("src/components/dashboard/ExecutiveDailyDriver.tsx");
      expect(source).toContain("const criticalCount = criticalInterventions.length;");
      expect(source).not.toContain('criticalInterventions.length || (pendingDecisions > 0 ? 1 : 0)');
    });
  });
});
