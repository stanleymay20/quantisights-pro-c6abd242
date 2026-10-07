import { describe, expect, it } from "vitest";
import {
  EXTERNAL_AI_PROTOCOL_VERSION,
  normalizeSha256,
  sha256Canonical,
  validateExternalAIDecision,
} from "../../supabase/functions/external-ai-decision-ingest/contract";

const H1 = "1".repeat(64);
const H2 = "2".repeat(64);

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    external_event_id: "evt-2026-10-07-001",
    occurred_at: "2026-10-07T12:00:00.000Z",
    input_hash: `sha256:${H1}`,
    output_hash: H2,
    decision: { action: "hold_payment", reason: "policy threshold exceeded" },
    confidence: 0.91,
    human_oversight_state: "required",
    metadata: { workflow: "supplier_payment" },
    provenance: { trace_id: "trace-1" },
    idempotency_key: "idem-evt-2026-10-07-001",
    protocol_version: EXTERNAL_AI_PROTOCOL_VERSION,
    ...overrides,
  };
}

describe("external AI decision ingest contract", () => {
  it("accepts a valid payload and normalizes SHA-256 references", () => {
    const result = validateExternalAIDecision(validPayload());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.input_hash).toBe(`sha256:${H1}`);
    expect(result.value.output_hash).toBe(`sha256:${H2}`);
    expect(result.value.occurred_at).toBe("2026-10-07T12:00:00.000Z");
  });

  it("rejects tenant/system identity fields because identity comes from the credential", () => {
    for (const field of ["organization_id", "ai_system_id", "credential_id"]) {
      const result = validateExternalAIDecision(validPayload({ [field]: "attacker-selected-id" }));
      expect(result).toMatchObject({ ok: false, error: "IDENTITY_FIELDS_NOT_ALLOWED" });
    }
  });

  it("rejects malformed input and output hashes", () => {
    expect(validateExternalAIDecision(validPayload({ input_hash: "not-a-hash" }))).toMatchObject({
      ok: false,
      error: "INVALID_SHA256",
      field: "input_hash",
    });
    expect(validateExternalAIDecision(validPayload({ output_hash: "abc" }))).toMatchObject({
      ok: false,
      error: "INVALID_SHA256",
      field: "output_hash",
    });
  });

  it("rejects unsupported versions and unknown top-level fields", () => {
    expect(validateExternalAIDecision(validPayload({ protocol_version: "v0" }))).toMatchObject({
      ok: false,
      error: "UNSUPPORTED_PROTOCOL_VERSION",
    });
    expect(validateExternalAIDecision(validPayload({ surprise: true }))).toMatchObject({
      ok: false,
      error: "UNKNOWN_TOP_LEVEL_FIELD",
      field: "surprise",
    });
  });

  it("rejects confidence outside the normalized 0..1 range", () => {
    expect(validateExternalAIDecision(validPayload({ confidence: 1.01 }))).toMatchObject({
      ok: false,
      error: "INVALID_CONFIDENCE",
    });
  });

  it("canonicalizes semantically identical JSON before hashing", async () => {
    const a = await sha256Canonical({ z: 3, a: { y: 2, x: 1 } });
    const b = await sha256Canonical({ a: { x: 1, y: 2 }, z: 3 });
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("normalizes raw or prefixed SHA-256 and rejects other algorithms", () => {
    expect(normalizeSha256(H1)).toBe(`sha256:${H1}`);
    expect(normalizeSha256(`SHA256:${H1.toUpperCase()}`)).toBe(`sha256:${H1}`);
    expect(normalizeSha256(`md5:${H1}`)).toBeNull();
  });
});
