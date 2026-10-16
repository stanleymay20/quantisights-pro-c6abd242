import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  canExecuteExternalAction,
  getConnectorActionPolicy,
  normalizeConnectorType,
} from "../_shared/governed-action-policy.ts";

type GovernedActionRequest = {
  organization_id: string;
  decision_id: string;
  connector_id: string;
  action_type: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  dry_run: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTION_TYPE = /^[a-z][a-z0-9_.:-]{0,79}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SENSITIVE_KEY = /(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|bearer|credential)/i;
const MAX_PAYLOAD_BYTES = 64 * 1024;

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function hasSensitiveKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => hasSensitiveKey(entry, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    SENSITIVE_KEY.test(key) || hasSensitiveKey(nested, depth + 1)
  );
}

function parseRequest(input: unknown): GovernedActionRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("request must be an object");
  }
  const raw = input as Record<string, unknown>;
  const organizationId = typeof raw.organization_id === "string" ? raw.organization_id.trim() : "";
  const decisionId = typeof raw.decision_id === "string" ? raw.decision_id.trim() : "";
  const connectorId = typeof raw.connector_id === "string" ? raw.connector_id.trim() : "";
  const actionType = typeof raw.action_type === "string" ? raw.action_type.trim() : "";
  const idempotencyKey = typeof raw.idempotency_key === "string" ? raw.idempotency_key.trim() : "";
  const payload = raw.payload;

  if (!UUID.test(organizationId)) throw new Error("organization_id must be a UUID");
  if (!UUID.test(decisionId)) throw new Error("decision_id must be a UUID");
  if (!UUID.test(connectorId)) throw new Error("connector_id must be a UUID");
  if (!ACTION_TYPE.test(actionType)) throw new Error("action_type is invalid");
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) throw new Error("idempotency_key is invalid");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("payload must be an object");
  if (hasSensitiveKey(payload)) throw new Error("payload contains credential-like fields");

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload)).byteLength;
  if (payloadBytes > MAX_PAYLOAD_BYTES) throw new Error("payload exceeds 64 KiB");

  return {
    organization_id: organizationId,
    decision_id: decisionId,
    connector_id: connectorId,
    action_type: actionType,
    payload: payload as Record<string, unknown>,
    idempotency_key: idempotencyKey,
    dry_run: raw.dry_run !== false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Governed action service unavailable" }, 503, cors);
    }

    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, cors);

    let action: GovernedActionRequest;
    try {
      action = parseRequest(await req.json().catch(() => null));
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400, cors);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user?.id) return json({ error: "Unauthorized" }, 401, cors);

    const { data: isMember, error: memberError } = await serviceClient.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: action.organization_id,
    });
    if (memberError) return json({ error: "Membership verification failed" }, 503, cors);
    if (!isMember) return json({ error: "Forbidden" }, 403, cors);

    const [{ data: decision, error: decisionError }, { data: connector, error: connectorError }] = await Promise.all([
      serviceClient
        .from("decision_ledger")
        .select("id,organization_id,decision_status")
        .eq("id", action.decision_id)
        .eq("organization_id", action.organization_id)
        .maybeSingle(),
      serviceClient
        .from("data_connectors")
        .select("id,organization_id,connector_type,status")
        .eq("id", action.connector_id)
        .eq("organization_id", action.organization_id)
        .maybeSingle(),
    ]);

    if (decisionError) return json({ error: "Decision lookup failed" }, 503, cors);
    if (!decision) return json({ error: "Decision not found in organization" }, 404, cors);
    if (decision.decision_status !== "approved") {
      return json({ error: "Decision must be approved before external action", code: "decision_not_approved" }, 409, cors);
    }

    if (connectorError) return json({ error: "Connector lookup failed" }, 503, cors);
    if (!connector) return json({ error: "Connector not found in organization" }, 404, cors);
    if (connector.status !== "active") {
      return json({ error: "Connector must be active", code: "connector_not_active" }, 409, cors);
    }

    const connectorType = normalizeConnectorType(connector.connector_type);
    const policy = getConnectorActionPolicy(connectorType);
    const executionPolicy = canExecuteExternalAction(connectorType, action.action_type);

    const existing = await serviceClient
      .from("governed_action_requests")
      .select("id,status,dry_run,reversible,provider_receipt_id,response_digest,verified_at,failure_code")
      .eq("organization_id", action.organization_id)
      .eq("connector_id", action.connector_id)
      .eq("action_type", action.action_type)
      .eq("idempotency_key", action.idempotency_key)
      .maybeSingle();
    if (existing.error) return json({ error: "Idempotency lookup failed" }, 503, cors);
    if (existing.data) {
      return json({
        reused: true,
        action_id: existing.data.id,
        status: existing.data.status,
        dry_run: existing.data.dry_run,
        reversible: existing.data.reversible,
        provider_receipt_id: existing.data.provider_receipt_id,
        response_digest: existing.data.response_digest,
        verified_at: existing.data.verified_at,
        failure_code: existing.data.failure_code,
      }, 200, cors);
    }

    const status = action.dry_run
      ? "dry_run"
      : executionPolicy.allowed
        ? "executing"
        : "failed";
    const failureCode = !action.dry_run && !executionPolicy.allowed
      ? "connector_write_not_proven"
      : null;

    const { data: inserted, error: insertError } = await serviceClient
      .from("governed_action_requests")
      .insert({
        organization_id: action.organization_id,
        decision_id: action.decision_id,
        connector_id: action.connector_id,
        requested_by: user.id,
        connector_type: connectorType,
        action_type: action.action_type,
        request_payload: action.payload,
        idempotency_key: action.idempotency_key,
        dry_run: action.dry_run,
        status,
        reversible: executionPolicy.reversible,
        failure_code: failureCode,
        failure_message: failureCode
          ? `No proven write adapter exists for ${connectorType}:${action.action_type}`
          : null,
      })
      .select("id,status,dry_run,reversible,failure_code")
      .single();

    if (insertError || !inserted?.id) {
      // Concurrent retries can race after the idempotency pre-read. Recover by
      // reading the unique record rather than creating a duplicate side effect.
      const retryRead = await serviceClient
        .from("governed_action_requests")
        .select("id,status,dry_run,reversible,provider_receipt_id,response_digest,verified_at,failure_code")
        .eq("organization_id", action.organization_id)
        .eq("connector_id", action.connector_id)
        .eq("action_type", action.action_type)
        .eq("idempotency_key", action.idempotency_key)
        .maybeSingle();
      if (retryRead.data) return json({ reused: true, action_id: retryRead.data.id, ...retryRead.data }, 200, cors);
      return json({ error: "Unable to persist governed action request" }, 503, cors);
    }

    const eventRows = [
      {
        organization_id: action.organization_id,
        action_request_id: inserted.id,
        event_type: "requested",
        actor_id: user.id,
        details: {
          connector_type: connectorType,
          action_type: action.action_type,
          dry_run: action.dry_run,
          capability: policy?.capability ?? "unsupported",
        },
      },
      {
        organization_id: action.organization_id,
        action_request_id: inserted.id,
        event_type: action.dry_run ? "dry_run_validated" : executionPolicy.allowed ? "attempted" : "failed",
        actor_id: user.id,
        details: action.dry_run
          ? {
              policy_result: executionPolicy.reason,
              note: "No external provider call was made.",
            }
          : executionPolicy.allowed
            ? { note: "Write-capable adapter dispatch is not implemented in tranche 1." }
            : { failure_code: failureCode, policy_result: executionPolicy.reason },
      },
    ];

    const { error: eventError } = await serviceClient.from("governed_action_events").insert(eventRows);
    if (eventError) {
      return json({ error: "Action persisted but lifecycle audit failed", action_id: inserted.id }, 503, cors);
    }

    if (action.dry_run) {
      return json({
        action_id: inserted.id,
        status: "dry_run",
        dry_run: true,
        connector_type: connectorType,
        connector_capability: policy?.capability ?? "unsupported",
        executable: executionPolicy.allowed,
        policy_reason: executionPolicy.reason,
        reversible: executionPolicy.reversible,
        provider_called: false,
      }, 200, cors);
    }

    if (!executionPolicy.allowed) {
      return json({
        action_id: inserted.id,
        status: "failed",
        code: failureCode,
        connector_type: connectorType,
        connector_capability: policy?.capability ?? "unsupported",
        policy_reason: executionPolicy.reason,
        provider_called: false,
      }, 409, cors);
    }

    // No policy currently reaches this branch. When the first connector earns
    // approve_execute, its adapter must be added in the same reviewed change and
    // must persist a provider receipt before returning success.
    return json({
      action_id: inserted.id,
      status: "unknown",
      code: "write_adapter_missing",
      provider_called: false,
    }, 501, cors);
  } catch (error) {
    console.error("governed-action error:", error instanceof Error ? error.message : String(error));
    return json({ error: "Governed action request failed" }, 500, cors);
  }
});
