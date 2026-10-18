export const EXTERNAL_AI_PROTOCOL_VERSION = "quantivis.external-ai-decision.v1";

export type ExternalAIDecisionPayload = {
  external_event_id: string;
  occurred_at: string;
  input_hash: string;
  output_hash: string;
  decision: Record<string, unknown>;
  confidence: number | null;
  human_oversight_state: string | null;
  metadata: Record<string, unknown>;
  provenance: Record<string, unknown>;
  idempotency_key: string;
  protocol_version: typeof EXTERNAL_AI_PROTOCOL_VERSION;
};

export type ContractResult =
  | { ok: true; value: ExternalAIDecisionPayload }
  | { ok: false; error: string; field?: string };

const TOP_LEVEL_FIELDS = new Set([
  "external_event_id",
  "occurred_at",
  "input_hash",
  "output_hash",
  "decision",
  "confidence",
  "human_oversight_state",
  "metadata",
  "provenance",
  "idempotency_key",
  "protocol_version",
]);

function objectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedObject(value: unknown, maxBytes: number): value is Record<string, unknown> {
  if (!objectRecord(value)) return false;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength <= maxBytes;
  } catch {
    return false;
  }
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

export function normalizeSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  const match = raw.match(/^(?:sha256:)?([0-9a-f]{64})$/);
  return match ? `sha256:${match[1]}` : null;
}

export function validateExternalAIDecision(input: unknown): ContractResult {
  if (!objectRecord(input)) return { ok: false, error: "BODY_MUST_BE_OBJECT" };

  // Organization and system identity always come from the machine credential.
  // Rejecting these fields prevents callers from believing they can select a
  // tenant/system by request payload.
  if ("organization_id" in input || "ai_system_id" in input || "credential_id" in input) {
    return { ok: false, error: "IDENTITY_FIELDS_NOT_ALLOWED" };
  }

  const unknownFields = Object.keys(input).filter((key) => !TOP_LEVEL_FIELDS.has(key));
  if (unknownFields.length > 0) {
    return { ok: false, error: "UNKNOWN_TOP_LEVEL_FIELD", field: unknownFields.sort()[0] };
  }

  if (input.protocol_version !== EXTERNAL_AI_PROTOCOL_VERSION) {
    return { ok: false, error: "UNSUPPORTED_PROTOCOL_VERSION", field: "protocol_version" };
  }
  if (!boundedString(input.external_event_id, 1, 240)) {
    return { ok: false, error: "INVALID_EXTERNAL_EVENT_ID", field: "external_event_id" };
  }
  if (!boundedString(input.idempotency_key, 8, 240)) {
    return { ok: false, error: "INVALID_IDEMPOTENCY_KEY", field: "idempotency_key" };
  }
  if (typeof input.occurred_at !== "string") {
    return { ok: false, error: "INVALID_OCCURRED_AT", field: "occurred_at" };
  }
  const occurred = new Date(input.occurred_at);
  if (Number.isNaN(occurred.getTime())) {
    return { ok: false, error: "INVALID_OCCURRED_AT", field: "occurred_at" };
  }

  const inputHash = normalizeSha256(input.input_hash);
  if (!inputHash) return { ok: false, error: "INVALID_SHA256", field: "input_hash" };
  const outputHash = normalizeSha256(input.output_hash);
  if (!outputHash) return { ok: false, error: "INVALID_SHA256", field: "output_hash" };

  if (!boundedObject(input.decision, 32_768) || Object.keys(input.decision).length === 0) {
    return { ok: false, error: "INVALID_DECISION_DESCRIPTOR", field: "decision" };
  }

  let confidence: number | null = null;
  if (input.confidence !== undefined && input.confidence !== null) {
    if (typeof input.confidence !== "number" || !Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
      return { ok: false, error: "INVALID_CONFIDENCE", field: "confidence" };
    }
    confidence = input.confidence;
  }

  let humanOversightState: string | null = null;
  if (input.human_oversight_state !== undefined && input.human_oversight_state !== null) {
    if (!boundedString(input.human_oversight_state, 1, 120)) {
      return { ok: false, error: "INVALID_HUMAN_OVERSIGHT_STATE", field: "human_oversight_state" };
    }
    humanOversightState = input.human_oversight_state.trim();
  }

  const metadata = input.metadata ?? {};
  const provenance = input.provenance ?? {};
  if (!boundedObject(metadata, 65_536)) {
    return { ok: false, error: "INVALID_METADATA", field: "metadata" };
  }
  if (!boundedObject(provenance, 65_536)) {
    return { ok: false, error: "INVALID_PROVENANCE", field: "provenance" };
  }

  return {
    ok: true,
    value: {
      external_event_id: input.external_event_id.trim(),
      occurred_at: occurred.toISOString(),
      input_hash: inputHash,
      output_hash: outputHash,
      decision: input.decision,
      confidence,
      human_oversight_state: humanOversightState,
      metadata,
      provenance,
      idempotency_key: input.idempotency_key.trim(),
      protocol_version: EXTERNAL_AI_PROTOCOL_VERSION,
    },
  };
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
      sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

export async function sha256Canonical(value: unknown): Promise<string> {
  const canonical = JSON.stringify(canonicalize(value));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}
