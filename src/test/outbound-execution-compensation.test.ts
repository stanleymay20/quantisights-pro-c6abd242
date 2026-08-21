import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821202000_add_governed_execution_compensation.sql"),
  "utf8",
);

describe("governed execution compensation", () => {
  it("preserves the original execution receipt and models compensation separately", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.execution_compensation_requests");
    expect(migration).toContain("original_receipt_id uuid NOT NULL REFERENCES public.execution_action_receipts(id) ON DELETE RESTRICT");
    expect(migration).toContain("Only proven successful receipts may enter compensation");
    expect(migration).toContain("v_receipt.status <> 'succeeded'");
    expect(migration).not.toMatch(/UPDATE public\.execution_action_receipts\s+SET\s+status/);
  });

  it("fails closed to action types with an explicit compensation contract", () => {
    expect(migration).toContain("v_receipt.action_type NOT IN ('trigger_webhook')");
    expect(migration).toContain("has no governed compensation contract");
  });

  it("requires owner/admin authorization and independent approval", () => {
    expect(migration).toContain("v_role NOT IN ('owner', 'admin')");
    expect(migration).toContain("v_request.requested_by = v_user_id");
    expect(migration).toContain("requires independent review by a different owner/admin");
    expect(migration).toContain("FOR UPDATE");
  });

  it("records immutable operational and audit evidence for request and review", () => {
    expect(migration).toContain("'compensation_requested'");
    expect(migration).toContain("'compensation_approved'");
    expect(migration).toContain("'compensation_rejected'");
    expect(migration).toContain("'execution_compensation_requested'");
    expect(migration).toContain("'execution_compensation_' || p_decision");
  });

  it("does not dispatch a compensating side effect in the governance RPCs", () => {
    expect(migration).not.toMatch(/\bfetch\s*\(/i);
    expect(migration).not.toMatch(/http[s]?:\/\//i);
    expect(migration).toContain("never dispatches externally");
  });

  it("keeps compensation hidden behind authenticated RPCs and tenant-scoped reads", () => {
    expect(migration).toContain("ALTER TABLE public.execution_compensation_requests ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.request_execution_compensation");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.review_execution_compensation");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.list_execution_compensation_requests");
    expect(migration).toContain("Organization membership required");
  });
});
