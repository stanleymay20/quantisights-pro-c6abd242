import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("UX-3 executive simplicity", () => {
  it("makes /decisions?review=top executive-first with a focus anchor and collapsible analyst details", () => {
    const ledger = read("src/pages/DecisionLedger.tsx");

    expect(ledger).toContain("isExecutiveReviewMode");
    expect(ledger).toContain('data-testid="executive-review-focus-anchor"');
    expect(ledger).toContain("scrollIntoView");
    expect(ledger).toContain("Need more detail?");
    expect(ledger).toContain("Expand analyst details");
    expect(ledger).toContain("executive-review-top-section");
  });

  it("keeps analyst metrics and the full queue out of the initial executive review path", () => {
    const ledger = read("src/pages/DecisionLedger.tsx");

    expect(ledger).toContain("Analyst detail");
    expect(ledger).toContain("showAnalystDetails");
    expect(ledger).toContain("defaultOpen={!isExecutiveReviewMode}");
  });

  it("removes the contradictory no-dataset wording from authenticated context", () => {
    const contextBar = read("src/components/layout/GlobalContextBar.tsx");

    expect(contextBar).not.toContain("No dataset connected");
    expect(contextBar).toContain("Decision context");
  });

  it("adds an explicit executive mode block on the dashboard for the top decisions", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboard).toContain("Executive Mode");
    expect(dashboard).toContain("Today I recommend");
    expect(dashboard).toContain("topExecutiveDecisions");
    expect(dashboard).toContain("Expected impact");
    expect(dashboard).toContain("Evidence");
    expect(dashboard).toContain("Estimated execution");
  });
});
