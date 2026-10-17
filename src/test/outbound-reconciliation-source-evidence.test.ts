import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261017153000_add_reconciliation_source_evidence.sql"),
  "utf8",
);

describe("source-persisted outbound reconciliation evidence", () => {
  it("adds a bounded all-or-none versioned SHA-256 evidence contract", () => {
    expect(migration).toContain("reconciliation_evidence_version text");
    expect(migration).toContain("reconciliation_evidence_material text");
    expect(migration).toContain("reconciliation_evidence_digest text");
    expect(migration).toContain("execution_action_receipts_reconciliation_evidence_all_or_none");
    expect(migration).toContain("reconciliation_evidence_version = 'v1'");
    expect(migration).toContain("reconciliation_evidence_digest ~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("char_length(reconciliation_evidence_material) <= 10000");
  });

  it("preserves the authenticated owner/admin and uncertain-only reconciliation boundary", () => {
    expect(migration).toContain("v_user_id uuid := auth.uid()");
    expect(migration).toContain("v_role NOT IN ('owner', 'admin')");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("v_receipt.status <> 'uncertain'");
    expect(migration).toContain("p_resolution NOT IN ('succeeded', 'failed')");
    expect(migration).toContain("AND status = 'uncertain'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.reconcile_execution_action_receipt");
    expect(migration).toContain("TO authenticated, service_role");
  });

  it("pins every new function to an empty search_path and removes direct client execution on the trigger helper", () => {
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(3);
    expect(migration).not.toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.protect_execution_reconciliation_evidence()");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("binds reconciliation to the original provider digest and exact reviewed facts", () => {
    expect(migration).toContain("provider_evidence_digest");
    expect(migration).toContain("'receipt_id', v_receipt.id");
    expect(migration).toContain("'provider_evidence_digest', v_provider_evidence_digest");
    expect(migration).toContain("'reconciled_at', v_now");
    expect(migration).toContain("'reconciled_by', v_user_id");
    expect(migration).toContain("'resolution', p_resolution");
    expect(migration).toContain("'reconciliation_note', v_note");
    expect(migration).toContain("'external_reference', v_external_reference");
    expect(migration).toContain("reconciliation_evidence_material = v_reconciliation_material");
    expect(migration).toContain("reconciliation_evidence_digest = v_reconciliation_digest");
  });

  it("resolves pgcrypto from pg_catalog instead of trusting SECURITY DEFINER search_path", () => {
    expect(migration).toContain("FROM pg_catalog.pg_extension e");
    expect(migration).toContain("JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace");
    expect(migration).toContain("WHERE e.extname = 'pgcrypto'");
    expect(migration).toContain("pg_catalog.encode(%I.digest($1, ''sha256''), ''hex'')");
    expect(migration).toContain("USING v_reconciliation_material");
    expect(migration).not.toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  });

  it("makes the persisted reconciliation evidence and attested lifecycle fields immutable", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.protect_execution_reconciliation_evidence()");
    expect(migration).toContain("OLD.reconciliation_evidence_digest IS NOT NULL");
    expect(migration).toContain("NEW.reconciled_at IS DISTINCT FROM OLD.reconciled_at");
    expect(migration).toContain("NEW.reconciled_by IS DISTINCT FROM OLD.reconciled_by");
    expect(migration).toContain("NEW.reconciliation_note IS DISTINCT FROM OLD.reconciliation_note");
    expect(migration).toContain("NEW.external_reference IS DISTINCT FROM OLD.external_reference");
    expect(migration).toContain("NEW.status IS DISTINCT FROM OLD.status");
    expect(migration).toContain("CREATE TRIGGER protect_execution_reconciliation_evidence");
  });

  it("records the source digest in operational and audit history without dispatching externally", () => {
    expect(migration).toContain("'outbound_action_reconciled'");
    expect(migration).toContain("'outbound_execution_reconciled'");
    expect(migration).toContain("'reconciliation_evidence_digest', v_reconciliation_digest");
    expect(migration).toContain("'provider_evidence_digest', v_provider_evidence_digest");
    expect(migration).not.toMatch(/\bfetch\s*\(/i);
    expect(migration).not.toMatch(/http[s]?:\/\//i);
  });

  it("extends only the tenant-scoped receipt projection with bounded source evidence", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.list_execution_action_receipts");
    expect(migration).toContain("Organization membership required");
    expect(migration).toContain("'reconciliation_evidence_version', r.reconciliation_evidence_version");
    expect(migration).toContain("'reconciliation_evidence_material', r.reconciliation_evidence_material");
    expect(migration).toContain("'reconciliation_evidence_digest', r.reconciliation_evidence_digest");
    expect(migration).not.toContain("'idempotency_key', r.idempotency_key");
    expect(migration).not.toContain("'request_fingerprint', r.request_fingerprint");
  });
});
