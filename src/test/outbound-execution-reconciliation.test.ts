import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const metadataMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821183500_add_execution_receipt_reconciliation.sql"),
  "utf8",
);
const rpcMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260821184200_add_reconcile_execution_receipt_rpc.sql"),
  "utf8",
);
const helperSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/execute-decision-action/idempotency.ts"),
  "utf8",
);

describe("governed outbound execution reconciliation", () => {
  it("persists reviewer evidence and indexes unresolved receipts", () => {
    expect(metadataMigration).toContain("reconciled_at timestamptz");
    expect(metadataMigration).toContain("reconciled_by uuid");
    expect(metadataMigration).toContain("reconciliation_note text");
    expect(metadataMigration).toContain("external_reference text");
    expect(metadataMigration).toContain("WHERE status = 'uncertain'");
  });

  it("runs reconciliation atomically under an authenticated owner/admin boundary", () => {
    expect(rpcMigration).toContain("SECURITY DEFINER");
    expect(rpcMigration).toContain("SET search_path = public, pg_temp");
    expect(rpcMigration).toContain("v_user_id uuid := auth.uid()");
    expect(rpcMigration).toContain("v_role NOT IN ('owner', 'admin')");
    expect(rpcMigration).toContain("FOR UPDATE");
  });

  it("only permits uncertain receipts to transition to a definitive result", () => {
    expect(rpcMigration).toContain("p_resolution NOT IN ('succeeded', 'failed')");
    expect(rpcMigration).toContain("v_receipt.status <> 'uncertain'");
    expect(rpcMigration).toContain("AND status = 'uncertain'");
    expect(rpcMigration).toContain("status = p_resolution");
  });

  it("requires durable reconciliation evidence and records both operational and audit history", () => {
    expect(rpcMigration).toContain("char_length(v_note) < 10");
    expect(rpcMigration).toContain("'outbound_action_reconciled'");
    expect(rpcMigration).toContain("'outbound_execution_reconciled'");
    expect(rpcMigration).toContain("'reconciliation_note', v_note");
    expect(rpcMigration).toContain("'external_reference', v_external_reference");
  });

  it("cannot be invoked anonymously and does not contain an outbound dispatch path", () => {
    expect(rpcMigration).toContain("REVOKE ALL ON FUNCTION public.reconcile_execution_action_receipt");
    expect(rpcMigration).toContain("GRANT EXECUTE ON FUNCTION public.reconcile_execution_action_receipt");
    expect(rpcMigration).toContain("TO authenticated");
    expect(rpcMigration).not.toMatch(/\bfetch\s*\(/i);
    expect(rpcMigration).not.toMatch(/http[s]?:\/\//i);
  });

  it("keeps the receipt helper uncertain-only if server-side callers use it later", () => {
    expect(helperSource).toContain("export async function reconcileExecutionReceipt");
    expect(helperSource).toContain('.eq("status", "uncertain")');
    expect(helperSource).toContain('resolution: "succeeded" | "failed"');
  });
});
