import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const governanceMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821202000_add_governed_execution_compensation.sql"),
  "utf8",
);
const contractMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821203500_freeze_compensation_execution_contract.sql"),
  "utf8",
);

describe("governed execution compensation", () => {
  it("preserves the original execution receipt and models compensation separately", () => {
    expect(governanceMigration).toContain("CREATE TABLE IF NOT EXISTS public.execution_compensation_requests");
    expect(governanceMigration).toContain("original_receipt_id uuid NOT NULL REFERENCES public.execution_action_receipts(id) ON DELETE RESTRICT");
    expect(governanceMigration).toContain("Only proven successful receipts may enter compensation");
    expect(governanceMigration).toContain("v_receipt.status <> 'succeeded'");
    expect(governanceMigration).not.toMatch(/UPDATE public\.execution_action_receipts\s+SET\s+status/);
  });

  it("fails closed to action types with an explicit compensation contract", () => {
    expect(governanceMigration).toContain("v_receipt.action_type NOT IN ('trigger_webhook')");
    expect(governanceMigration).toContain("has no governed compensation contract");
    expect(contractMigration).toContain("v_receipt.action_type <> 'trigger_webhook'");
    expect(contractMigration).toContain("v_type <> 'webhook'");
  });

  it("requires owner/admin authorization and independent approval", () => {
    expect(governanceMigration).toContain("v_role NOT IN ('owner', 'admin')");
    expect(governanceMigration).toContain("v_request.requested_by = v_user_id");
    expect(governanceMigration).toContain("requires independent review by a different owner/admin");
    expect(governanceMigration).toContain("FOR UPDATE");
  });

  it("freezes the exact compensation destination and payload before review", () => {
    expect(contractMigration).toContain("compensation_config jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(contractMigration).toContain("p_compensation_config jsonb");
    expect(contractMigration).toContain("v_config->>'webhook_url'");
    expect(contractMigration).toContain("left(lower(v_url), 8) <> 'https://'");
    expect(contractMigration).toContain("jsonb_typeof(v_config->'payload') <> 'object'");
    expect(contractMigration).toContain("pg_column_size(v_config) > 65536");
    expect(contractMigration).toContain("'contract_frozen', true");
    expect(contractMigration).toContain("'compensation_config', v_config");
  });

  it("records immutable operational and audit evidence for request and review", () => {
    expect(governanceMigration).toContain("'compensation_requested'");
    expect(governanceMigration).toContain("'compensation_approved'");
    expect(governanceMigration).toContain("'compensation_rejected'");
    expect(governanceMigration).toContain("'execution_compensation_requested'");
    expect(governanceMigration).toContain("'execution_compensation_' || p_decision");
  });

  it("does not dispatch a compensating side effect in governance or contract-freeze RPCs", () => {
    for (const source of [governanceMigration, contractMigration]) {
      expect(source).not.toMatch(/\bfetch\s*\(/i);
    }
    // HTTPS literals are intentionally allowed here because contract freezing must
    // validate that the reviewed compensation destination uses HTTPS. This guard
    // is about preventing dispatch capability, not preventing safe URL validation.
    expect(contractMigration).toContain("left(lower(v_url), 8) <> 'https://'");
    expect(governanceMigration).toContain("never dispatches externally");
    expect(contractMigration).toContain("never dispatches externally");
  });

  it("keeps compensation hidden behind authenticated RPCs and tenant-scoped reads", () => {
    expect(governanceMigration).toContain("ALTER TABLE public.execution_compensation_requests ENABLE ROW LEVEL SECURITY");
    expect(contractMigration).toContain("REVOKE ALL ON FUNCTION public.request_execution_compensation");
    expect(governanceMigration).toContain("REVOKE ALL ON FUNCTION public.review_execution_compensation");
    expect(governanceMigration).toContain("REVOKE ALL ON FUNCTION public.list_execution_compensation_requests");
    expect(contractMigration).toContain("Organization membership required");
  });
});
