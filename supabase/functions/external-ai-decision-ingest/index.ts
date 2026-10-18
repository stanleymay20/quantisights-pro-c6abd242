import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import {
  sha256Canonical,
  validateExternalAIDecision,
} from "./contract.ts";

const MAX_REQUEST_BYTES = 196_608;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

function machineToken(req: Request): string | null {
  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return /^qv_ai_[0-9a-f]{64}$/.test(token) ? token : null;
}

function mapRpcError(message: string): { status: number; error: string } {
  if (message.includes("IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD")) {
    return { status: 409, error: "IDEMPOTENCY_KEY_REUSE_WITH_DIFFERENT_PAYLOAD" };
  }
  if (message.includes("EXTERNAL_EVENT_REUSE_WITH_DIFFERENT_PAYLOAD")) {
    return { status: 409, error: "EXTERNAL_EVENT_REUSE_WITH_DIFFERENT_PAYLOAD" };
  }
  if (message.includes("CREDENTIAL_INACTIVE") || message.includes("CREDENTIAL_EXPIRED")) {
    return { status: 401, error: "INVALID_MACHINE_CREDENTIAL" };
  }
  if (message.includes("AI_SYSTEM_INACTIVE")) {
    return { status: 409, error: "AI_SYSTEM_INACTIVE" };
  }
  if (message.includes("AI_SYSTEM_NOT_FOUND")) {
    return { status: 401, error: "INVALID_MACHINE_CREDENTIAL" };
  }
  return { status: 500, error: "INGEST_FAILED" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(req, { error: "REQUEST_TOO_LARGE" }, 413);
  }

  const token = machineToken(req);
  if (!token) return json(req, { error: "INVALID_MACHINE_CREDENTIAL" }, 401);

  let rawBody: unknown;
  try {
    const text = await req.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) {
      return json(req, { error: "REQUEST_TOO_LARGE" }, 413);
    }
    rawBody = JSON.parse(text);
  } catch {
    return json(req, { error: "INVALID_JSON" }, 400);
  }

  const validated = validateExternalAIDecision(rawBody);
  if (validated.ok === false) {
    return json(req, {
      error: validated.error,
      ...(validated.field ? { field: validated.field } : {}),
    }, 400);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tokenHash = await sha256(token);
  const { data: credential, error: credentialError } = await svc
    .from("ai_system_credentials")
    .select("id, organization_id, ai_system_id, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (credentialError) {
    console.error("external-ai-decision-ingest credential lookup failed", credentialError.message);
    return json(req, { error: "INGEST_UNAVAILABLE" }, 503);
  }
  if (!credential || credential.status !== "active") {
    return json(req, { error: "INVALID_MACHINE_CREDENTIAL" }, 401);
  }
  if (credential.expires_at && Date.parse(credential.expires_at) <= Date.now()) {
    return json(req, { error: "INVALID_MACHINE_CREDENTIAL" }, 401);
  }

  const { data: system, error: systemError } = await svc
    .from("ai_systems")
    .select("id, organization_id, lifecycle_status")
    .eq("id", credential.ai_system_id)
    .eq("organization_id", credential.organization_id)
    .maybeSingle();

  if (systemError) {
    console.error("external-ai-decision-ingest system lookup failed", systemError.message);
    return json(req, { error: "INGEST_UNAVAILABLE" }, 503);
  }
  if (!system) return json(req, { error: "INVALID_MACHINE_CREDENTIAL" }, 401);
  if (system.lifecycle_status !== "active") {
    return json(req, { error: "AI_SYSTEM_INACTIVE" }, 409);
  }

  const payloadHash = await sha256Canonical(validated.value);
  const { data, error } = await svc.rpc("ingest_external_ai_decision", {
    p_credential_id: credential.id,
    p_external_event_id: validated.value.external_event_id,
    p_occurred_at: validated.value.occurred_at,
    p_input_hash: validated.value.input_hash,
    p_output_hash: validated.value.output_hash,
    p_decision_descriptor: validated.value.decision,
    p_confidence: validated.value.confidence,
    p_human_oversight_state: validated.value.human_oversight_state,
    p_metadata: validated.value.metadata,
    p_provenance: {
      ...validated.value.provenance,
      transport: "quantivis_external_ai_ingest",
      request_id: req.headers.get("x-request-id") || null,
    },
    p_idempotency_key: validated.value.idempotency_key,
    p_payload_hash: payloadHash,
    p_protocol_version: validated.value.protocol_version,
  });

  if (error) {
    const mapped = mapRpcError(error.message || "");
    if (mapped.status >= 500) {
      console.error("external-ai-decision-ingest RPC failed", error.message);
    }
    return json(req, { error: mapped.error }, mapped.status);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.decision_ledger_id || !row?.evidence_id) {
    console.error("external-ai-decision-ingest RPC returned no identifiers");
    return json(req, { error: "INGEST_FAILED" }, 500);
  }

  await svc
    .from("ai_system_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);

  const replay = row.idempotent_replay === true;
  return json(req, {
    accepted: true,
    idempotent_replay: replay,
    replay_reason: row.replay_reason ?? null,
    decision_id: row.decision_ledger_id,
    evidence_id: row.evidence_id,
    ai_system_id: system.id,
    payload_hash: payloadHash,
    decision_status: "pending",
  }, replay ? 200 : 201);
});
