import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("UX-2 executive decision review experience", () => {
  it("adds a dedicated executive decision review component with the required decision-review sections", () => {
    const component = read("src/components/decisions/ExecutiveDecisionReview.tsx");

    [
      "Executive Summary",
      "Why this matters",
      "Recommended action",
      "Business impact",
      "Supporting evidence",
      "Evidence quality",
      "AICIS trust verification",
      "Alternative actions",
      "Risks",
      "Approval checklist",
      "Outcome prediction",
      "Audit trail preview",
    ].forEach((section) => expect(component).toContain(section));
  });

  it("renders a plain-English AICIS narrative and decision alternatives", () => {
    const component = read("src/components/decisions/ExecutiveDecisionReview.tsx");

    expect(component).toContain("I analyzed");
    expect(component).toContain("I recommend");
    expect(component).toContain("Confidence is");
    expect(component).toContain("Evidence quality is");
    expect(component).toContain("Recommended option");
    expect(component).toContain("Alternative A");
    expect(component).toContain("Alternative B");
    expect(component).toContain("No action");
  });

  it("shows explicit approval-gating reasons instead of unexplained disabled approval buttons", () => {
    const component = read("src/components/decisions/ExecutiveDecisionReview.tsx");
    const utils = read("src/components/decisions/executive-decision-review-utils.ts");

    [
      "missing evidence",
      "weak evidence quality",
      "unresolved contradiction",
      "insufficient confidence",
      "missing required approval",
    ].forEach((reason) => expect(utils).toContain(reason));
    expect(component).toContain("Approval blocked");
    expect(component).toContain("Approval allowed");
    expect(utils).toContain("getExecutiveApprovalChecklist");
    expect(utils).toContain("isExecutiveApprovalAllowed");
  });

  it("mounts the executive review flow in the Decision Ledger expanded review area", () => {
    const ledger = read("src/pages/DecisionLedger.tsx");

    expect(ledger).toContain("ExecutiveDecisionReview");
    expect(ledger).toContain('params.get("review") === "top"');
    expect(ledger).toContain("setExpandedDecision(activeDecisions[0].id)");
  });

  it("routes the dashboard Review Decision CTA into the executive review flow and avoids dashboard approval", () => {
    const dashboardDriver = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

    expect(dashboardDriver).toContain('navigate("/decisions?review=top")');
    expect(dashboardDriver).toContain("Review Decision");
    expect(dashboardDriver).not.toContain("Approve");
    expect(dashboardDriver).not.toContain("Reject");
  });
});
