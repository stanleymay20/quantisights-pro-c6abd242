import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("audit round 2 batch fixes", () => {
  describe("nav duplicates (Decision History / History both -> /history, Data / Upload both -> /data-upload)", () => {
    const source = read("src/components/dashboard/DashboardSidebar.tsx");

    it("Operations no longer has a redundant 'History' entry duplicating Decisions' 'Decision History'", () => {
      expect(source).toContain('label: "Decision History", path: "/history"');
      expect(source).not.toContain('label: "History",           path: "/history"');
    });

    it("Settings no longer has a redundant 'Data' entry duplicating Advanced > Data & Pipeline's 'Upload'", () => {
      expect(source).toContain('label: "Upload",           path: "/data-upload"');
      expect(source).not.toContain('label: "Data",           path: "/data-upload"');
    });

    it("adds a nav entry for the previously-orphaned /privacy-dashboard", () => {
      expect(source).toContain('label: "Privacy",        path: "/privacy-dashboard"');
    });
  });

  describe("notification threshold inputs clamp on change, not just on save", () => {
    const source = read("src/pages/Settings.tsx");

    it("Alert Threshold and Escalation Threshold onChange handlers clamp to 0-100", () => {
      expect(source).toContain("setAlertThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))");
      expect(source).toContain("setEscalationThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))");
    });
  });

  describe("Cognitive Bias Detection no longer has embedded marketing copy", () => {
    it("removed the 'No competitor offers this level of behavioral analysis' line", () => {
      const source = read("src/pages/CognitiveBiasDetection.tsx");
      expect(source).not.toContain("No competitor offers this level");
    });
  });

  describe("stripe-webhook advances current_period_end on every successful renewal, not just on subscription-object changes", () => {
    const source = read("supabase/functions/stripe-webhook/index.ts");

    it("invoice.payment_succeeded re-fetches the subscription and updates current_period_end", () => {
      const caseStart = source.indexOf('case "invoice.payment_succeeded"');
      const caseEnd = source.indexOf('case "checkout.session.completed"');
      const caseBody = source.slice(caseStart, caseEnd);
      expect(caseBody).toContain("stripe.subscriptions.retrieve(subId)");
      expect(caseBody).toContain("current_period_end: new Date(sub.current_period_end * 1000).toISOString()");
      expect(caseBody).toContain("...periodEndUpdate");
    });
  });
});
