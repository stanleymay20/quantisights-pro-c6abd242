import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("ERP-100 production readiness gates", () => {
  it("blocks approval when a recommendation is not evidence-ready", () => {
    const queue = read("src/components/dashboard/DecisionQueue.tsx");

    expect(queue).toContain("isEvidenceReadyForApproval");
    expect(queue).toContain("approvalBlockedReason");
    expect(queue).toContain("Evidence review required");
    expect(queue).toContain("disabled={isActing || !isEvidenceReadyForApproval(decision)}");
    expect(queue).not.toContain("disabled={isActing || !rec.isDecisionGrade}");
  });

  it("blocks ledger approval when trust evidence or governance is not ready", () => {
    const ledger = read("src/pages/DecisionLedger.tsx");

    expect(ledger).toContain("isLedgerDecisionReadyForApproval");
    expect(ledger).toContain("getLedgerApprovalBlockReason");
    expect(ledger).toContain("Evidence review required");
    expect(ledger).toContain("disabled={updatingId === d.id || !isLedgerDecisionReadyForApproval(d)}");
    expect(ledger).toContain("disabled={updatingId === d.id || !isLedgerDecisionReadyForApproval(d)}");
  });

  it("keeps reports as an executive page with a clear h1 contract", () => {
    const reports = read("src/pages/Reports.tsx");

    expect(reports).toContain("<h1");
    expect(reports).toContain("Board-ready reports");
    expect(reports).toContain("Generate board-ready executive reports");
  });
});
