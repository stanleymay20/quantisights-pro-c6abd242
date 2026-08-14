import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read("supabase/migrations/20260814193000_atomic_dashboard_decision_approval.sql");
const helper = read("src/lib/decision-queue-approval.ts");
const queue = read("src/components/dashboard/DecisionQueue.tsx");

describe("dashboard decision approval atomicity", () => {
  it("creates queue decisions pending and delegates final state to approve_decision in one transaction", () => {
    expect(migration).toContain("public.create_and_approve_decision");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("public.approve_decision(");

    const approvalCall = migration.indexOf("v_approval := public.approve_decision(");
    const sourceResolution = migration.indexOf("IF _source_type = 'advisory' THEN");
    expect(approvalCall).toBeGreaterThan(-1);
    expect(sourceResolution).toBeGreaterThan(approvalCall);
  });

  it("rolls source resolution into the same server transaction", () => {
    expect(migration).toContain("source item not found in organization");
    expect(migration).toContain("organization_id = _organization_id");
    expect(migration).toContain("GET DIAGNOSTICS v_source_rows = ROW_COUNT");
  });

  it("active dashboard queue uses the atomic client instead of inserting an approved ledger row", () => {
    expect(queue).toContain("createAndApproveQueueDecision");
    expect(queue).not.toContain("onDecisionApproved(");
    expect(queue).not.toContain('decision_status: "approved"');
  });

  it("does not pre-resolve advisory or insight sources before approval", () => {
    const approveStart = queue.indexOf("const executeApprove");
    const dismissStart = queue.indexOf("const initiateDismiss");
    expect(approveStart).toBeGreaterThan(-1);
    expect(dismissStart).toBeGreaterThan(approveStart);

    const approvalBlock = queue.slice(approveStart, dismissStart);
    expect(approvalBlock).not.toContain('.from("advisory_instances")');
    expect(approvalBlock).not.toContain('.from("insights")');
    expect(approvalBlock).not.toContain('.from("decision_ledger")');
    expect(approvalBlock).toContain("sourceType");
    expect(approvalBlock).toContain("sourceId");
  });

  it("runs embeddings and prediction only after the durable atomic approval response", () => {
    const rpcIndex = helper.indexOf('rpc("create_and_approve_decision"');
    const embeddingIndex = helper.indexOf('functions.invoke("embed-decisions"');
    const predictionIndex = helper.indexOf('functions.invoke("predict-outcome"');

    expect(rpcIndex).toBeGreaterThan(-1);
    expect(embeddingIndex).toBeGreaterThan(rpcIndex);
    expect(predictionIndex).toBeGreaterThan(rpcIndex);
  });
});
