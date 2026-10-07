import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { isValidEnum, isValidString, isValidUUID } from "../_shared/input-validation.ts";

const SYSTEM_TYPES = ["model", "agent", "workflow", "rules_engine", "other"] as const;
const ENVIRONMENTS = ["development", "test", "staging", "production", "other"] as const;

type ServiceClient = ReturnType<typeof createClient>;

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
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
  svc: ServiceClient,
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
  svc: ServiceClient,
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
    .select("id, ai_system_id, token_prefix, expires_at, created_at")
    .single();
  if (error) throw new Error(`CREATE_CREDENTIAL_FAILED:${error.message}`);
  return { credential: data, token: rawToken };
}

async function writeAudit(
  svc: ServiceClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await svc.from("audit_log").insert(row);
  if (error) throw new Error(`AUDIT_WRITE_FAILED:${error.message}`);
}

async function deleteCredentialBestEffort(svc: ServiceClient, credentialId: string): Promise<void> {
  const { error } = await svc.from("ai_system_credentials").delete().eq("id", credentialId);
  if (error) console.error("credential compensation delete failed", error.message);
}

async function restoreCredentialsBestEffort(svc: ServiceClient, credentialIds: string[]): Promise<void> {
  if (credentialIds.length === 0) return;
  const { error } = await svc
    .from("ai_system_credentials")
    .update({ status: "active", revoked_at: null })
    .in("id", credentialIds);
  if (error) console.error("credential compensation restore failed", error.message);
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

      let issued: Awaited<ReturnType<typeof createCredential>> | null = null;
      try {
        issued = await createCredential(svc, organizationId, system.id, userId, expiresAt);
        await writeAudit(svc, {
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
      } catch (createError) {
        if (issued) await deleteCredentialBestEffort(svc, issued.credential.id);
        const { error: cleanupError } = await svc
          .from("ai_systems")
          .delete()
          .eq("id", system.id)
          .eq("organization_id", organizationId);
        if (cleanupError) console.error("AI-system compensation delete failed", cleanupError.message);
        throw createError;
      }
    }

    if (action === "rotate_credential") {
      if (!isValidUUID(body.ai_system_id)) return json(req, { error: "INVALID_AI_SYSTEM_ID" }, 400);
      const expiresAt = parseExpiry(body.credential_expires_at);
      if (expiresAt === undefined) return json(req, { error: "INVALID_CREDENTIAL_EXPIRY" }, 400);

      const { data: system, error: systemError } = await svc
        .from("ai_systems")
        .select("id, lifecycle_status")
        .eq("id", body.ai_system_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (systemError) throw systemError;
      if (!system) return json(req, { error: "AI_SYSTEM_NOT_FOUND" }, 404);
      if (system.lifecycle_status === "retired") return json(req, { error: "AI_SYSTEM_RETIRED" }, 409);

      const { data: priorActive, error: priorError } = await svc
        .from("ai_system_credentials")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("ai_system_id", system.id)
        .eq("status", "active");
      if (priorError) throw priorError;
      const priorIds = (priorActive ?? []).map((row) => String(row.id));

      const issued = await createCredential(svc, organizationId, system.id, userId, expiresAt);
      try {
        if (priorIds.length > 0) {
          const { error: revokeError } = await svc
            .from("ai_system_credentials")
            .update({ status: "revoked", revoked_at: new Date().toISOString() })
            .in("id", priorIds);
          if (revokeError) throw new Error(`ROTATION_REVOKE_FAILED:${revokeError.message}`);
        }

        await writeAudit(svc, {
          organization_id: organizationId,
          actor_id: userId,
          actor_type: "user",
          action_type: "ai_system_credential_rotated",
          resource_type: "ai_system",
          resource_id: system.id,
          payload: {
            new_credential_id: issued.credential.id,
            revoked_credential_ids: priorIds,
          },
        });
      } catch (rotationError) {
        await restoreCredentialsBestEffort(svc, priorIds);
        await deleteCredentialBestEffort(svc, issued.credential.id);
        throw rotationError;
      }

      return json(req, {
        credential: issued.credential,
        token: issued.token,
        revoked_credential_ids: priorIds,
        warning: "Rotation revoked all previously active credentials. Store this new token now; Quantivis cannot reveal it again.",
      }, 201);
    }

    if (action === "revoke_credential") {
      if (!isValidUUID(body.credential_id)) return json(req, { error: "INVALID_CREDENTIAL_ID" }, 400);

      const { data: current, error: currentError } = await svc
        .from("ai_system_credentials")
        .select("id, ai_system_id, status, revoked_at")
        .eq("id", body.credential_id)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) return json(req, { error: "CREDENTIAL_NOT_FOUND" }, 404);
      if (current.status === "revoked") {
        return json(req, { credential: current, idempotent_replay: true });
      }

      const revokedAt = new Date().toISOString();
      const { data: credential, error } = await svc
        .from("ai_system_credentials")
        .update({ status: "revoked", revoked_at: revokedAt })
        .eq("id", current.id)
        .eq("organization_id", organizationId)
        .select("id, ai_system_id, status, revoked_at")
        .single();
      if (error) throw error;

      try {
        await writeAudit(svc, {
          organization_id: organizationId,
          actor_id: userId,
          actor_type: "user",
          action_type: "ai_system_credential_revoked",
          resource_type: "ai_system",
          resource_id: credential.ai_system_id,
          payload: { credential_id: credential.id },
        });
      } catch (auditError) {
        await restoreCredentialsBestEffort(svc, [credential.id]);
        throw auditError;
      }
      return json(req, { credential, idempotent_replay: false });
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
