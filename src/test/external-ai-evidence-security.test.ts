import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/20261007160000_external_ai_evidence_wedge.sql");
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

  it("forces externally produced decisions into pending governance state", () => {
    expect(migration).toMatch(/'external_ai'[\s\S]*?'pending'[\s\S]*?'not_started'/);
    expect(migration).not.toMatch(/'external_ai'[\s\S]{0,300}'executable'/);
  });

  it("enforces replay identity at both idempotency-key and external-event levels", () => {
    expect(migration).toContain("UNIQUE (organization_id, ai_system_id, external_event_id)");
    expect(migration).toContain("UNIQUE (organization_id, ai_system_id, idempotency_key)");
    expect(migration).toContain("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD");
    expect(migration).toContain("EXTERNAL_EVENT_REUSE_WITH_DIFFERENT_PAYLOAD");
  });

  it("limits the atomic ingest RPC to service_role", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.ingest_external_ai_decision");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
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

  it("keeps both new functions on manual authentication boundaries", () => {
    expect(config).toContain("[functions.ai-system-registry]\n    verify_jwt = false");
    expect(config).toContain("[functions.external-ai-decision-ingest]\n    verify_jwt = false");
    expect(registry).toContain("authenticateRequest(req)");
    expect(ingest).toContain("machineToken(req)");
  });
});
