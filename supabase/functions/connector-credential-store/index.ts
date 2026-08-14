/**
 * connector-credential-store
 *
 * Receives per-connector credentials from the frontend, stores them encrypted
 * in Supabase Vault (via get_connector_secret / upsert_vault_secret RPCs),
 * creates / updates the data_connectors record, and schedules recurring syncs.
 *
 * Called by the DataConnectors UI after the user fills in their credentials.
 * Returns { connector_id, vault_keys } so the frontend can immediately trigger
 * an initial sync via connector-pull.
 *
 * Security:
 *  - Requires a valid user JWT (Authorization header).
 *  - Only writes to the caller's organization.
 *  - Never logs credential values — only vault key names.
 *  - Fails closed if Vault cannot persist a credential; secrets are never
 *    downgraded into ordinary connector config storage.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScheduleKind = "manual" | "every_5_min" | "hourly" | "daily";

interface CredentialStoreRequest {
  organization_id: string;
  connector_type: string;
  name: string;
  credentials: Record<string, string>;
  config: Record<string, unknown>;
  schedule_kind: ScheduleKind;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") return null;
    result[key] = entry;
  }
  return result;
}

function parseScheduleKind(value: unknown): ScheduleKind | null {
  if (value === undefined || value === null || value === "") return "hourly";
  return value === "manual" || value === "every_5_min" || value === "hourly" || value === "daily"
    ? value
    : null;
}

function parseRequestBody(value: unknown): CredentialStoreRequest | null {
  if (!isRecord(value)) return null;
  const organizationId = typeof value.organization_id === "string" ? value.organization_id.trim() : "";
  const connectorType = typeof value.connector_type === "string" ? value.connector_type.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const credentials = stringMap(value.credentials);
  const config = value.config === undefined ? {} : isRecord(value.config) ? value.config : null;
  const scheduleKind = parseScheduleKind(value.schedule_kind);

  if (!organizationId || !connectorType || !name || !credentials || !config || !scheduleKind) return null;
  if (Object.keys(credentials).length === 0) return null;

  return {
    organization_id: organizationId,
    connector_type: connectorType,
    name,
    credentials,
    config: { ...config },
    schedule_kind: scheduleKind,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    console.error("connector-credential-store missing required Supabase environment configuration");
    return json({ error: "Connector credential service unavailable" }, 503);
  }

  // Authenticate the calling user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authorization header required" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const rawBody: unknown = await req.json().catch(() => null);
    const body = parseRequestBody(rawBody);
    if (!body) {
      return json({
        error: "organization_id, connector_type, name, non-empty string credentials, valid config, and schedule_kind are required",
      }, 400);
    }

    const {
      organization_id,
      connector_type,
      name,
      credentials,
      config,
      schedule_kind,
    } = body;

    // Verify caller belongs to this org
    const { data: membership } = await svc
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!membership) return json({ error: "Not a member of this organization" }, 403);
    if (!["owner", "admin"].includes(membership.role)) {
      return json({ error: "Only owners and admins can add connectors" }, 403);
    }

    // Generate a unique ID for this connector record
    const connectorId = crypto.randomUUID();

    // Store every credential in Vault under a namespaced key. Never persist a
    // credential value in data_connectors.config if Vault is unavailable.
    const vaultKeys: Record<string, string> = {};
    for (const [field, value] of Object.entries(credentials)) {
      if (!value) continue;
      const vaultKeyName = `connector_${connectorId}_${field}`;
      const { error: vErr } = await svc.rpc("upsert_vault_secret", {
        _name: vaultKeyName,
        _value: value,
        _description: `${connector_type} connector credential: ${field}`,
      });
      if (vErr) {
        console.error(`Vault write failed for credential field ${field}:`, vErr.message);
        return json({ error: `Unable to securely store connector credential: ${field}` }, 503);
      }
      vaultKeys[field] = vaultKeyName;
    }

    if (Object.keys(vaultKeys).length === 0) {
      return json({ error: "No non-empty connector credentials were provided" }, 400);
    }

    // Build the data_connectors record aligned with existing schema. The config
    // contains only non-sensitive connector settings and Vault key references.
    const connectorRecord: Record<string, unknown> = {
      id: connectorId,
      organization_id,
      name,
      connector_type,
      status: "draft",
      created_by: user.id,
      updated_by: user.id,
      vault_secret_name: Object.values(vaultKeys)[0] ?? null,
      config: {
        ...config,
        vault_keys: vaultKeys,
        connector_type_detail: connector_type,
      },
      credential_vault_keys: vaultKeys,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertErr } = await svc
      .from("data_connectors")
      .upsert(connectorRecord, { onConflict: "id" });

    if (insertErr) {
      // If enum type validation fails, fall back to 'rest_api' as the stored type
      // and keep the real type in config.connector_type_detail.
      const fallbackRecord = {
        ...connectorRecord,
        connector_type: "rest_api",
        config: { ...connectorRecord.config as Record<string, unknown>, connector_type_detail: connector_type },
      };
      const { error: fbErr } = await svc.from("data_connectors").upsert(fallbackRecord, { onConflict: "id" });
      if (fbErr) return json({ error: `Failed to save connector: ${fbErr.message}` }, 500);
    }

    // Create a data_sources record (used by the sync pipeline)
    const { data: ds } = await svc
      .from("data_sources")
      .insert({
        organization_id,
        name,
        source_type: "connector",
        connector_type,
        status: "pending",
        config: { connector_id: connectorId, connector_type },
      })
      .select("id")
      .single();

    const dataSourceId = ds?.id ?? null;

    // Link connector to data source
    if (dataSourceId) {
      await svc.from("data_connectors")
        .update({ data_source_id: dataSourceId })
        .eq("id", connectorId);
    }

    // Schedule recurring syncs
    const NEXT_INTERVAL_MS: Record<ScheduleKind, number> = {
      manual: 0,
      every_5_min: 5 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
    };
    const intervalMs = NEXT_INTERVAL_MS[schedule_kind];
    const nextRunAt = new Date(Date.now() + intervalMs).toISOString();

    await svc.from("connector_sync_schedules").insert({
      organization_id,
      connector_id: connectorId,
      schedule_kind,
      next_run_at: nextRunAt,
      created_at: new Date().toISOString(),
    }).then(() => {}); // Non-fatal if table doesn't exist yet

    // Audit log contains Vault field names only, never credential values.
    await svc.from("audit_log").insert({
      organization_id,
      actor_type: "user",
      actor_id: user.id,
      action_type: "connector_created",
      resource_type: "data_connector",
      resource_id: connectorId,
      payload: { connector_type, name, vault_fields: Object.keys(vaultKeys) },
    }).then(() => {});

    return json({
      success: true,
      connector_id: connectorId,
      data_source_id: dataSourceId,
      vault_keys: Object.keys(vaultKeys),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("connector-credential-store error:", msg);
    return json({ error: "Failed to securely store connector credentials" }, 500);
  }
});
