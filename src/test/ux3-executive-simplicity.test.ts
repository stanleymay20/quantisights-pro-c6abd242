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

  it("makes the dashboard itself the executive mode instead of nesting a duplicate mode block", () => {
    const dashboard = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboard).toContain("Executive focus");
    expect(dashboard).toContain("Priority decisions");
    expect(dashboard).toContain("decision-time confidence");
    expect(dashboard).toContain("Governed review required");
    expect(dashboard).toContain("Evidence in view");
    expect(dashboard).toContain("Decision value");
    expect(dashboard).toContain('"/decisions?review=top"');
    expect(dashboard).not.toContain("topExecutiveDecisions");
  });
});
