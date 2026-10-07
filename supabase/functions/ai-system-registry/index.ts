import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { isValidEnum, isValidString, isValidUUID } from "../_shared/input-validation.ts";

const SYSTEM_TYPES = ["model", "agent", "workflow", "rules_engine", "other"] as const;
const ENVIRONMENTS = ["development", "test", "staging", "production", "other"] as const;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

function newMachineToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `qv_ai_${hex}`;
}

function parseExpiry(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) return undefined;
  return parsed.toISOString();
}

async function requireAdmin(
  svc: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data, error } = await svc
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && Boolean(data && ["owner", "admin"].includes(String(data.role)));
}

async function createCredential(
  svc: ReturnType<typeof createClient>,
  organizationId: string,
  aiSystemId: string,
  userId: string,
  expiresAt: string | null,
) {
  const rawToken = newMachineToken();
  const tokenHash = await sha256(rawToken);
  const { data, error } = await svc
    .from("ai_system_credentials")
    .insert({
      organization_id: organizationId,
      ai_system_id: aiSystemId,
      token_hash: tokenHash,
      token_prefix: rawToken.slice(0, 14),
      expires_at: expiresAt,
      created_by: userId,
    })
    .select("id, token_prefix, expires_at, created_at")
    .single();
  if (error) throw error;
  return { credential: data, token: rawToken };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  if (req.method !== "POST") return json(req, { error: "METHOD_NOT_ALLOWED" }, 405);

  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "INVALID_JSON" }, 400);
  }

  const action = body.action;
  const organizationId = body.organization_id;
  if (!isValidUUID(organizationId)) {
    return json(req, { error: "INVALID_ORGANIZATION_ID" }, 400);
  }
  if (!(await verifyOrgMembership(userId, organizationId))) {
    return json(req, { error: "FORBIDDEN" }, 403);
  }

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  if (!(await requireAdmin(svc, userId, organizationId))) {
    return json(req, { error: "ADMIN_OR_OWNER_REQUIRED" }, 403);
  }

  try {
    if (action === "create_system") {
      if (!isValidString(body.name, 160)) return json(req, { error: "INVALID_NAME" }, 400);
      if (!isValidString(body.provider, 120)) return json(req, { error: "INVALID_PROVIDER" }, 400);
      if (!isValidString(body.system_identifier, 240)) {
        return json(req, { error: "INVALID_SYSTEM_IDENTIFIER" }, 400);
      }
      if (body.model_version != null && !isValidString(body.model_version, 240)) {
        return json(req, { error: "INVALID_MODEL_VERSION" }, 400);
      }
      if (body.purpose != null && !isValidString(body.purpose, 2000)) {
        return json(req, { error: "INVALID_PURPOSE" }, 400);
      }
      if (body.risk_classification != null && !isValidString(body.risk_classification, 240)) {
        return json(req, { error: "INVALID_RISK_CLASSIFICATION" }, 400);
      }
      if (body.external_identifier != null && !isValidString(body.external_identifier, 240)) {
        return json(req, { error: "INVALID_EXTERNAL_IDENTIFIER" }, 400);
      }

      const systemType = body.system_type == null
        ? "model"
        : isValidEnum(body.system_type, SYSTEM_TYPES) ? body.system_type : null;
      const environment = body.deployment_environment == null
        ? "production"
        : isValidEnum(body.deployment_environment, ENVIRONMENTS) ? body.deployment_environment : null;
      if (!systemType) return json(req, { error: "INVALID_SYSTEM_TYPE" }, 400);
      if (!environment) return json(req, { error: "INVALID_DEPLOYMENT_ENVIRONMENT" }, 400);

      const ownerUserId = body.owner_user_id == null ? userId : body.owner_user_id;
      if (!isValidUUID(ownerUserId)) return json(req, { error: "INVALID_OWNER_USER_ID" }, 400);
      if (!(await verifyOrgMembership(ownerUserId, organizationId))) {
        return json(req, { error: "OWNER_MUST_BE_ORG_MEMBER" }, 400);
      }

      const expiresAt = parseExpiry(body.credential_expires_at);
      if (expiresAt === undefined) return json(req, { error: "INVALID_CREDENTIAL_EXPIRY" }, 400);

      const { data: system, error } = await svc
        .from("ai_systems")
        .insert({
          organization_id: organizationId,
          name: String(body.name).trim(),
          provider: String(body.provider).trim(),
          system_identifier: String(body.system_identifier).trim(),
          model_version: body.model_version == null ? null : String(body.model_version).trim(),
          system_type: systemType,
          deployment_environment: environment,
          purpose: body.purpose == null ? null : String(body.purpose).trim(),
          owner_user_id: ownerUserId,
          risk_classification: body.risk_classification == null ? null : String(body.risk_classification).trim(),
          external_identifier: body.external_identifier == null ? null : String(body.external_identifier).trim(),
          created_by: userId,
        })
        .select("id, organization_id, name, provider, system_identifier, model_version, system_type, deployment_environment, purpose, owner_user_id, lifecycle_status, risk_classification, external_identifier, created_at")
        .single();
      if (error) throw error;

      try {
        const issued = await createCredential(svc, organizationId, system.id, userId, expiresAt);
        await svc.from("audit_log").insert({
          organization_id: organizationId,
          actor_id: userId,
          actor_type: "user",
          action_type: "ai_system_registered",
          resource_type: "ai_system",
          resource_id: system.id,
          payload: {
            provider: system.provider,
            system_identifier: system.system_identifier,
            model_version: system.model_version,
            credential_id: issued.credential.id,
          },
        });
        return json(req, {
          system,
          credential: issued.credential,
          token: issued.token,
          warning: "Store this token now. Quantivis stores only its SHA-256 digest and cannot reveal it again.",
        }, 201);
      } catch (credentialError) {
        // Avoid leaving a system that cannot authenticate during the create flow.
        await svc.from("ai_systems").delete().eq("id", system.id).eq("organization_id", organizationId);
        throw credentialError;
      }
    }

    if (action === "rotate_credential") {
      if (!isValidUUID(body.ai_system_id)) return json(req, { error: "INVALID_AI_SYSTEM_ID" }, 400);
      const expiresAt = parseExpiry(body.credential_expires_at);
      if (expiresAt === undefined) return json(req, { error: "INVALID_CREDENTIAL_EXPIRY" }, 400);

      const { data: system } = await svc
        .from("ai_systems")
        .select("id, lifecycle_status")
        .eq("id", body.ai_system_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!system) return json(req, { error: "AI_SYSTEM_NOT_FOUND" }, 404);
      if (system.lifecycle_status === "retired") return json(req, { error: "AI_SYSTEM_RETIRED" }, 409);

      const issued = await createCredential(svc, organizationId, system.id, userId, expiresAt);
      await svc.from("audit_log").insert({
        organization_id: organizationId,
        actor_id: userId,
        actor_type: "user",
        action_type: "ai_system_credential_rotated",
        resource_type: "ai_system",
        resource_id: system.id,
        payload: { credential_id: issued.credential.id },
      });
      return json(req, {
        credential: issued.credential,
        token: issued.token,
        warning: "Store this token now. Quantivis stores only its SHA-256 digest and cannot reveal it again.",
      }, 201);
    }

    if (action === "revoke_credential") {
      if (!isValidUUID(body.credential_id)) return json(req, { error: "INVALID_CREDENTIAL_ID" }, 400);
      const { data: credential, error } = await svc
        .from("ai_system_credentials")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", body.credential_id)
        .eq("organization_id", organizationId)
        .select("id, ai_system_id, status, revoked_at")
        .maybeSingle();
      if (error) throw error;
      if (!credential) return json(req, { error: "CREDENTIAL_NOT_FOUND" }, 404);

      await svc.from("audit_log").insert({
        organization_id: organizationId,
        actor_id: userId,
        actor_type: "user",
        action_type: "ai_system_credential_revoked",
        resource_type: "ai_system",
        resource_id: credential.ai_system_id,
        payload: { credential_id: credential.id },
      });
      return json(req, { credential });
    }

    return json(req, { error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("ai-system-registry error", message);
    if (message.includes("uq_ai_systems_org_external_identifier")) {
      return json(req, { error: "EXTERNAL_IDENTIFIER_ALREADY_EXISTS" }, 409);
    }
    return json(req, { error: "REGISTRY_OPERATION_FAILED" }, 500);
  }
});
