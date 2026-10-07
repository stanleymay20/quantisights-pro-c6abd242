import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20261007160000_external_ai_evidence_wedge.sql");
const confidenceBridge = read("supabase/migrations/20261007160500_external_ai_confidence_scale.sql");
const concurrency = read("supabase/migrations/20261007161000_external_ai_ingest_concurrency.sql");
const orgErasure = read("supabase/migrations/20261007161500_external_ai_evidence_org_cascade.sql");
const credentialRotation = read("supabase/migrations/20261007162000_atomic_ai_system_credential_rotation.sql");
const dataApiHardening = read("supabase/migrations/20261007162500_external_ai_data_api_hardening.sql");
const ingest = read("supabase/functions/external-ai-decision-ingest/index.ts");
const registry = read("supabase/functions/ai-system-registry/index.ts");
const config = read("supabase/config.toml");

describe("external AI evidence security invariants", () => {
  it("keeps producer evidence append-only and client writes closed", () => {
    expect(migration).toContain("external_ai_decision_evidence");
    expect(migration).toContain("external_ai_evidence_append_only");
    expect(migration).toContain("BEFORE UPDATE OR DELETE");
    expect(migration).toContain("No INSERT/UPDATE/DELETE client policies");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });

  it("allows evidence erasure only inside the owning-organization delete transaction", () => {
    expect(orgErasure).toContain("current_setting('quantivis.external_ai_purge_org', true)");
    expect(orgErasure).toContain("v_purge_org = OLD.organization_id::text");
    expect(orgErasure).toContain("BEFORE DELETE ON public.organizations");

    const evidenceDelete = orgErasure.indexOf("DELETE FROM public.external_ai_decision_evidence");
    const credentialDelete = orgErasure.indexOf("DELETE FROM public.ai_system_credentials");
    const systemDelete = orgErasure.indexOf("DELETE FROM public.ai_systems");
    expect(evidenceDelete).toBeGreaterThan(-1);
    expect(evidenceDelete).toBeLessThan(credentialDelete);
    expect(credentialDelete).toBeLessThan(systemDelete);
  });

  it("forces externally produced decisions into pending governance state", () => {
    expect(migration).toMatch(/'external_ai'[\s\S]*?'pending'[\s\S]*?'not_started'/);
    expect(migration).not.toMatch(/'external_ai'[\s\S]{0,300}'executable'/);
  });

  it("enforces replay identity at both idempotency-key and external-event levels", () => {
    expect(migration).toContain("UNIQUE (organization_id, ai_system_id, external_event_id)");
    expect(migration).toContain("UNIQUE (organization_id, ai_system_id, idempotency_key)");
    expect(concurrency).toContain("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD");
    expect(concurrency).toContain("EXTERNAL_EVENT_REUSE_WITH_DIFFERENT_PAYLOAD");
  });

  it("serializes simultaneous retry identities before replay checks", () => {
    expect(concurrency.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
    expect(concurrency).toContain("quantivis:external-ai:idem:");
    expect(concurrency).toContain("quantivis:external-ai:event:");
    expect(concurrency.indexOf("quantivis:external-ai:idem:")).toBeLessThan(
      concurrency.indexOf("quantivis:external-ai:event:"),
    );
  });

  it("limits the atomic ingest RPC to service_role", () => {
    expect(concurrency).toContain("REVOKE ALL ON FUNCTION public.ingest_external_ai_decision");
    expect(concurrency).toContain("FROM PUBLIC, anon, authenticated");
    expect(concurrency).toContain("TO service_role");
  });

  it("pins privileged database functions to an empty search_path", () => {
    expect(concurrency).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(credentialRotation).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(orgErasure).toContain("SECURITY DEFINER\nSET search_path = ''");
  });

  it("derives organization and system identity from the credential server-side", () => {
    expect(ingest).toContain(".eq(\"token_hash\", tokenHash)");
    expect(ingest).toContain("credential.organization_id");
    expect(ingest).toContain("credential.ai_system_id");
    expect(ingest).not.toContain("body.organization_id");
    expect(ingest).not.toContain("body.ai_system_id");
  });

  it("stores only a one-way digest of machine credentials", () => {
    expect(registry).toContain("const tokenHash = await sha256(rawToken)");
    expect(registry).toContain("token_hash: tokenHash");
    expect(registry).not.toContain("raw_token:");
  });

  it("serializes credential rotation and commits revoke + replacement + audit atomically", () => {
    expect(registry).toContain('.rpc("rotate_ai_system_credential"');
    expect(credentialRotation).toContain("FOR UPDATE");
    expect(credentialRotation).toContain("SET status = 'revoked'");
    expect(credentialRotation).toContain("INSERT INTO public.ai_system_credentials");
    expect(credentialRotation).toContain("'ai_system_credential_rotated'");
    expect(credentialRotation).toContain("REVOKE ALL ON FUNCTION public.rotate_ai_system_credential");
    expect(credentialRotation).toContain("TO service_role");

    const revoke = credentialRotation.indexOf("UPDATE public.ai_system_credentials");
    const replacement = credentialRotation.indexOf("INSERT INTO public.ai_system_credentials");
    const audit = credentialRotation.indexOf("INSERT INTO public.audit_log");
    expect(revoke).toBeGreaterThan(-1);
    expect(revoke).toBeLessThan(replacement);
    expect(replacement).toBeLessThan(audit);
  });

  it("prevents direct client registry writes and makes Data API grants explicit", () => {
    expect(dataApiHardening).toContain('DROP POLICY IF EXISTS "Admins owners can create AI systems"');
    expect(dataApiHardening).toContain('DROP POLICY IF EXISTS "Admins owners can update AI systems"');
    expect(dataApiHardening).toContain("REVOKE ALL ON TABLE public.ai_systems FROM anon, authenticated");
    expect(dataApiHardening).toContain("GRANT SELECT ON TABLE public.ai_systems TO authenticated");
    expect(dataApiHardening).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_systems TO service_role");
    expect(dataApiHardening).toContain("REVOKE ALL ON TABLE public.ai_system_credentials FROM anon, authenticated");
    expect(dataApiHardening).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_system_credentials TO service_role");
    expect(dataApiHardening).toContain("GRANT SELECT ON TABLE public.external_ai_decision_evidence TO authenticated");
    expect(dataApiHardening).toContain("TO authenticated\n  USING (public.is_org_member((select auth.uid()), organization_id))");
  });

  it("treats non-rotation registry audit writes as required and compensates on failure", () => {
    expect(registry).toContain("AUDIT_WRITE_FAILED");
    expect(registry).toContain("await writeAudit");
    expect(registry).toContain("credential compensation restore failed");
    expect(registry).toContain("credential compensation delete failed");
  });

  it("keeps normalized external confidence while bridging the ledger projection to 0..100", () => {
    expect(migration).toContain("confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))");
    expect(confidenceBridge).toContain("NEW.confidence_at_decision := NEW.confidence_at_decision * 100");
    expect(confidenceBridge).toContain("NEW.decision_type = 'external_ai'");
  });

  it("keeps both new functions on manual authentication boundaries", () => {
    expect(config).toContain("[functions.ai-system-registry]\n    verify_jwt = false");
    expect(config).toContain("[functions.external-ai-decision-ingest]\n    verify_jwt = false");
    expect(registry).toContain("authenticateRequest(req)");
    expect(ingest).toContain("machineToken(req)");
  });
});
