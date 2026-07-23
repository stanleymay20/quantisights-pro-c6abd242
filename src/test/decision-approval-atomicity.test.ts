import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for the P0 release blocker: executive approval could
 * previously succeed even when the audit-log write failed, because
 * DecisionReview.tsx / DecisionLedger.tsx wrote decision_ledger directly
 * from the browser and then separately, non-atomically, fire-and-forget
 * called onDecisionApproved() (whose audit_log insert is unconditionally
 * rejected by RLS for authenticated users — see
 * supabase/migrations/20260303152450_..., "Deny user inserts on
 * audit_log"). The fix moves decision approval, audit-log creation,
 * execution-plan creation, and evaluability-gated outcome-tracking
 * creation into one SECURITY DEFINER Postgres function
 * (public.approve_decision / public.reject_decision — see
 * supabase/migrations/20260713010000_fix_decision_approval_atomicity.sql),
 * so a single Postgres transaction either commits every write or none of
 * them.
 *
 * IMPORTANT SCOPE NOTE: the tests in the first describe block are static
 * source-text assertions against the migration SQL. They prove the SQL is
 * *structured* to be atomic (single function body, row lock, guard clauses,
 * privilege model) and catch regressions in that structure (e.g. someone
 * reintroducing NEW.status/OLD.status, or removing the audit_log insert
 * from the transaction). They do NOT execute the SQL against a real
 * Postgres engine — no live Supabase/Lovable Cloud database is reachable
 * from this test environment (consistent with every other GA-phase
 * validation in this repository). The database-level guarantees
 * (transactional rollback, FOR UPDATE row-lock behavior under real
 * concurrency, trigger firing order) are therefore verified by direct code
 * review here, not by live execution — that live verification remains a
 * separate, explicit release gate, exactly like GA-2R.
 */

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const MIGRATION_PATH = "supabase/migrations/20260713010000_fix_decision_approval_atomicity.sql";
// enforce_decision_approval_gate() has been re-issued (CREATE OR REPLACE)
// twice since MIGRATION_PATH first defined it: once by
// 20260713101123_c24694df-...sql (added the executed/executable checks,
// but silently dropped the "approved/rejected are final" guard in the
// process — that regression is exactly what slipped through undetected
// when this suite kept reading the now-superseded original migration), and
// restored by this migration. Point the trigger-specific tests at whichever
// file most recently touched the trigger, not at MIGRATION_PATH, so a
// future re-issuance can't silently go untested the same way again.
const TRIGGER_MIGRATION_PATH = "supabase/migrations/20260714050200_restore_decision_final_status_guard.sql";

describe("decision approval atomicity — migration SQL structure", () => {
  const migration = read(MIGRATION_PATH);
  const triggerMigration = read(TRIGGER_MIGRATION_PATH);

  function extractFunctionBodyFrom(source: string, name: string): string {
    // Function bodies in this codebase are dollar-quoted with either $$ or
    // a named tag like $fn$ — match either, and require the SAME tag to
    // close it.
    const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\nEND;\\n(\\$\\w*\\$);`));
    expect(match, `expected to find function ${name}`).not.toBeNull();
    return match![0];
  }

  function extractFunctionBody(name: string): string {
    return extractFunctionBodyFrom(migration, name);
  }

  function extractTriggerFunctionBody(name: string): string {
    return extractFunctionBodyFrom(triggerMigration, name);
  }

  it("fixes the approval-gate trigger to reference decision_status, not the nonexistent status column", () => {
    // The old, broken trigger (enforce_decision_approval_gate, added in
    // 20260530194704_...) read NEW.status / OLD.status. decision_ledger has
    // no `status` column — only `decision_status` — so every UPDATE fired
    // this trigger straight into a "record has no field" error. Scoped to
    // the function body itself (not this file's explanatory comments,
    // which intentionally mention the old broken pattern for documentation).
    const fn = extractTriggerFunctionBody("enforce_decision_approval_gate");
    expect(fn).not.toMatch(/NEW\.status\b/);
    expect(fn).not.toMatch(/OLD\.status\b/);
    expect(fn).toContain("NEW.decision_status");
    expect(fn).toContain("OLD.decision_status");
  });

  it("makes approved and rejected final decision_status values (no re-approval, no rejected->approved)", () => {
    const fn = extractTriggerFunctionBody("enforce_decision_approval_gate");
    expect(fn).toMatch(/OLD\.decision_status IN \('approved', 'rejected'\)/);
    expect(fn).toMatch(/already has a final decision_status/);
    // The finality guard must be scoped to decision_status TRANSITIONS only.
    // An earlier draft also raised whenever OLD='approved' AND NEW='approved'
    // — which fires on every routine update to an approved row that leaves
    // decision_status untouched (execution_status tracking, notes,
    // outcome/calibration writes), breaking all post-approval workflows.
    // Caught by live-Postgres validation; must never come back.
    expect(fn).not.toMatch(/OLD\.decision_status = 'approved' AND NEW\.decision_status = 'approved'/);
    // Same-value updates short-circuit through the no-transition early return.
    expect(fn).toMatch(/IF NEW\.decision_status IS NOT DISTINCT FROM OLD\.decision_status THEN\s*\n\s*RETURN NEW;/);
    // Re-approval via the sanctioned path is blocked by approve_decision's
    // pending gate (asserted in the approve_decision structure test below).
  });

  it("defines approve_decision as a single SECURITY DEFINER function performing all four writes", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.approve_decision(");
    const fnMatch = migration.match(/CREATE OR REPLACE FUNCTION public\.approve_decision\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    const fn = fnMatch![0];

    expect(fn).toContain("SECURITY DEFINER");
    // Row lock: makes duplicate/concurrent approval attempts serialize
    // instead of racing.
    expect(fn).toContain("FOR UPDATE");
    // Re-implements the authorization boundary the SECURITY DEFINER bypasses.
    expect(fn).toContain("public.get_user_org_role(auth.uid(), v_org_id)");
    expect(fn).toMatch(/NOT IN \('owner', 'admin'\)/);
    // Duplicate-approval / invalid-transition guard.
    expect(fn).toMatch(/v_status <> 'pending'/);
    // All four writes inside the same function body (same transaction).
    expect(fn).toContain("UPDATE public.decision_ledger");
    expect(fn).toContain("INSERT INTO public.audit_log");
    expect(fn).toContain("INSERT INTO public.execution_plans");
    expect(fn).toContain("INSERT INTO public.decision_outcomes");
    // Reuses the existing evaluability RPC rather than re-implementing it.
    expect(fn).toContain("public.check_decision_evaluability(");
  });

  it("defines reject_decision as a SECURITY DEFINER function that also writes audit_log atomically", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.reject_decision(");
    const fnMatch = migration.match(/CREATE OR REPLACE FUNCTION public\.reject_decision\([\s\S]*?\nEND;\n\$\$;/);
    expect(fnMatch).not.toBeNull();
    const fn = fnMatch![0];

    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toMatch(/NOT IN \('owner', 'admin'\)/);
    expect(fn).toMatch(/v_status <> 'pending'/);
    expect(fn).toContain("UPDATE public.decision_ledger");
    expect(fn).toContain("INSERT INTO public.audit_log");
  });

  it("locks down execution to authenticated callers only, not PUBLIC", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.approve_decision(uuid, uuid, text, int, text) TO authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.reject_decision(uuid, text) FROM PUBLIC");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.reject_decision(uuid, text) TO authenticated");
  });
});

// ---------------------------------------------------------------------------
// DecisionReview.tsx: the browser must call the atomic RPC, never write
// decision_ledger/audit_log directly.
// ---------------------------------------------------------------------------

const rpcMock = vi.fn();
const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("@/hooks/useOrganization", () => ({
  useOrganization: () => ({ currentOrgId: "org-1", loading: false }),
}));

vi.mock("@/contexts/ProjectContext", () => ({
  useProject: () => ({ activeDatasetId: "dataset-1" }),
}));

describe("decision approval atomicity — client contract (source)", () => {
  it("DecisionReview.tsx never writes decision_ledger or audit_log directly from the browser", () => {
    const review = read("src/pages/DecisionReview.tsx");
    // The only decision_ledger table access left is the read-only SELECT
    // that loads the decision for display.
    expect(review).not.toMatch(/\.from\("decision_ledger"\)\s*\.update/);
    expect(review).not.toContain('.from("audit_log")');
    expect(review).toContain('supabase.rpc("approve_decision"');
    expect(review).toContain('supabase.rpc("reject_decision"');
  });

  it("DecisionLedger.tsx's approve/reject path never writes decision_ledger or audit_log directly", () => {
    const ledger = read("src/pages/DecisionLedger.tsx");
    expect(ledger).not.toContain('.from("audit_log")');
    expect(ledger).toContain('supabase.rpc("approve_decision"');
    expect(ledger).toContain('supabase.rpc("reject_decision"');
    // The generic field-update path (execution_status, notes, etc.) is a
    // deliberately separate, untouched code path — it must still exist.
    expect(ledger).toMatch(/await supabase\s*\.from\("decision_ledger"\)\s*\.update\(updates\)/);
  });
});

describe("DecisionReview.tsx — approve()/reject() behavior (mocked RPC)", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    invokeMock.mockReset();
    fromMock.mockReset();
  });
  afterEach(cleanup);

  async function renderReview(decisionId: string) {
    const DecisionReview = (await import("@/pages/DecisionReview")).default;
    return render(
      React.createElement(
        MemoryRouter,
        { initialEntries: [`/decisions/${decisionId}/review`] },
        React.createElement(
          Routes,
          null,
          React.createElement(Route, { path: "/decisions/:id/review", element: React.createElement(DecisionReview) }),
          React.createElement(Route, { path: "/decisions/:id/outcome", element: React.createElement("p", null, "outcome-route-reached") }),
          React.createElement(Route, { path: "/decisions", element: React.createElement("p", null, "ledger-route-reached") }),
        ),
      ),
    );
  }

  it("does not call approve_decision for the demo decision (nothing is persisted for sample data)", async () => {
    await renderReview("demo-decision");
    await waitFor(() => expect(screen.getByTestId("approve-button")).toBeInTheDocument());

    for (const item of screen.getAllByTestId(/^checklist-/)) fireEvent.click(item);
    fireEvent.click(screen.getByTestId("approve-button"));

    expect(rpcMock).not.toHaveBeenCalled();
  });

  const REAL_DECISION = {
    id: "real-decision-1",
    organization_id: "org-1",
    decision_type: "cost_optimization",
    recommended_action: "Renegotiate top supplier contract",
    chosen_action: null,
    decision_status: "pending",
    execution_status: "not_started",
    notes: null,
    source_insight_summary: "Costs rose 12%.",
    recommendation_logic_type: "rule_based",
    decision_origin: "platform",
    capped_confidence: 80,
    confidence_at_decision: 80,
    raw_confidence: 85,
    confidence_cap_reason: null,
    predicted_net_impact: 10000,
    predicted_roi_probability: 70,
    outcome_delta: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    decided_at: null,
    decided_by: null,
    explanation_metadata: null,
  };

  // Generic chainable/thenable Supabase query-builder stub: every method
  // (select/eq/order/limit/single/maybeSingle/...) returns another
  // chainable stub, and awaiting the chain at any point resolves to
  // `result`. This lets DecisionReview.tsx's own decision_ledger load AND
  // whatever other queries its child components (e.g.
  // DecisionEvidencePanel) happen to run both resolve safely, without this
  // test needing to replicate every exact call shape.
  function chainable(result: { data: unknown; error: unknown }): any {
    return new Proxy(() => {}, {
      get(_target, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        return () => chainable(result);
      },
    });
  }

  function mockDecisionLoad() {
    fromMock.mockImplementation((table: string) =>
      table === "decision_ledger" ? chainable({ data: REAL_DECISION, error: null }) : chainable({ data: null, error: null }),
    );
  }

  async function approveViaRealFlow() {
    mockDecisionLoad();
    await renderReview(REAL_DECISION.id);
    await waitFor(() => expect(screen.getByTestId("approve-button")).toBeInTheDocument());
    for (const item of screen.getAllByTestId(/^checklist-/)) fireEvent.click(item);
    fireEvent.click(screen.getByTestId("approve-button"));
  }

  it("on approve_decision failure: does not navigate and does not fire the enrichment calls (no partial success)", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "audit_log insert failed inside transaction" } });
    await approveViaRealFlow();

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(rpcMock).toHaveBeenCalledWith("approve_decision", expect.objectContaining({ _decision_id: REAL_DECISION.id }));
    expect(screen.queryByText("outcome-route-reached")).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("on approve_decision success: navigates to the outcome page and fires the enrichment calls exactly once", async () => {
    rpcMock.mockResolvedValue({ data: { decision_id: REAL_DECISION.id, decision_status: "approved" }, error: null });
    invokeMock.mockResolvedValue({ data: null, error: null });
    await approveViaRealFlow();

    await waitFor(() => expect(screen.getByText("outcome-route-reached")).toBeInTheDocument());
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith("embed-decisions", expect.anything());
    expect(invokeMock).toHaveBeenCalledWith("predict-outcome", expect.anything());
  });

  it("disables the approve button immediately on click, preventing a second approve_decision call from a duplicate click", async () => {
    // RPC never resolves during this test — simulates the in-flight window
    // where a duplicate click would otherwise race.
    rpcMock.mockReturnValue(new Promise(() => {}));
    await approveViaRealFlow();

    const approveButton = screen.getByTestId("approve-button");
    await waitFor(() => expect(approveButton).toBeDisabled());
    fireEvent.click(approveButton);
    fireEvent.click(approveButton);

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("on reject_decision success: navigates to the decision ledger", async () => {
    rpcMock.mockResolvedValue({ data: { decision_id: REAL_DECISION.id, decision_status: "rejected" }, error: null });
    mockDecisionLoad();
    await renderReview(REAL_DECISION.id);
    await waitFor(() => expect(screen.getByTestId("reject-toggle")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("reject-toggle"));
    fireEvent.change(screen.getByTestId("reject-reason-input"), { target: { value: "Superseded by a better option." } });
    fireEvent.click(screen.getByTestId("confirm-reject-button"));

    await waitFor(() => expect(screen.getByText("ledger-route-reached")).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith("reject_decision", { _decision_id: REAL_DECISION.id, _reason: "Superseded by a better option." });
  });

  it("on reject_decision failure: stays on the review page and does not silently record a rejection", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "insufficient_privilege" } });
    mockDecisionLoad();
    await renderReview(REAL_DECISION.id);
    await waitFor(() => expect(screen.getByTestId("reject-toggle")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("reject-toggle"));
    fireEvent.change(screen.getByTestId("reject-reason-input"), { target: { value: "reason" } });
    fireEvent.click(screen.getByTestId("confirm-reject-button"));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("ledger-route-reached")).not.toBeInTheDocument();
  });
});
