/**
 * connector-credential-store
 *
 * Paid-pilot provisioning for certified external connectors. Credentials are
 * stored in Vault and provisioning fails closed unless the connector, linked
 * data source, schedule, and audit record are all created successfully.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PILOT_CONNECTOR_TYPES = new Set(["salesforce", "hubspot"]);
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
  const connectorType = typeof value.connector_type === "string" ? value.connector_type.trim().toLowerCase() : "";
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authorization header required" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Unauthorized" }, 401);

  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const body = parseRequestBody(await req.json().catch(() => null));
    if (!body) {
      return json({
        error: "organization_id, connector_type, name, non-empty string credentials, valid config, and schedule_kind are required",
      }, 400);
    }

    const { organization_id, connector_type, name, credentials, config, schedule_kind } = body;

    if (!PILOT_CONNECTOR_TYPES.has(connector_type)) {
      return json({ error: "This connector is not enabled for the paid pilot" }, 409);
    }

    const { data: membership, error: membershipError } = await svc
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) {
      console.error("connector membership lookup failed:", membershipError.message);
      return json({ error: "Unable to verify organization membership" }, 503);
    }
    if (!membership) return json({ error: "Not a member of this organization" }, 403);
    if (!["owner", "admin"].includes(membership.role)) {
      return json({ error: "Only owners and admins can add connectors" }, 403);
    }

    const connectorId = crypto.randomUUID();
    const vaultKeys: Record<string, string> = {};
    let dataSourceId: string | null = null;
    let connectorCreated = false;
    let scheduleCreated = false;

    const rollback = async () => {
      if (scheduleCreated) {
        const { error } = await svc.from("connector_sync_schedules")
          .delete()
          .eq("connector_id", connectorId)
          .eq("organization_id", organization_id);
        if (error) console.error("connector rollback schedule delete failed:", error.message);
      }
      if (connectorCreated) {
        const { error } = await svc.from("data_connectors")
          .delete()
          .eq("id", connectorId)
          .eq("organization_id", organization_id);
        if (error) console.error("connector rollback connector delete failed:", error.message);
      }
      if (dataSourceId) {
        const { error } = await svc.from("data_sources")
          .delete()
          .eq("id", dataSourceId)
          .eq("organization_id", organization_id);
        if (error) console.error("connector rollback data source delete failed:", error.message);
      }
      for (const vaultKey of Object.values(vaultKeys)) {
        const { error } = await svc.rpc("delete_vault_secret", { _name: vaultKey });
        if (error) console.error("connector rollback Vault delete failed:", error.message);
      }
    };

    for (const [field, rawValue] of Object.entries(credentials)) {
      const value = rawValue.trim();
      if (!value) continue;
      const vaultKeyName = `connector_${connectorId}_${field}`;
      const { error: vaultError } = await svc.rpc("upsert_vault_secret", {
        _name: vaultKeyName,
        _value: value,
        _description: `${connector_type} connector credential: ${field}`,
      });
      if (vaultError) {
        console.error(`Vault write failed for credential field ${field}:`, vaultError.message);
        await rollback();
        return json({ error: "Unable to securely store connector credentials" }, 503);
      }
      vaultKeys[field] = vaultKeyName;
    }

    if (Object.keys(vaultKeys).length === 0) {
      await rollback();
      return json({ error: "No non-empty connector credentials were provided" }, 400);
    }

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

    const { error: connectorError } = await svc.from("data_connectors").insert(connectorRecord);
    if (connectorError) {
      console.error("connector record creation failed:", connectorError.message);
      await rollback();
      return json({ error: "Unable to create connector" }, 500);
    }
    connectorCreated = true;

    const { data: dataSource, error: dataSourceError } = await svc
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
    if (dataSourceError || !dataSource?.id) {
      console.error("connector data source creation failed:", dataSourceError?.message ?? "missing data source id");
      await rollback();
      return json({ error: "Unable to create connector data source" }, 500);
    }
    dataSourceId = String(dataSource.id);

    const { error: linkError } = await svc.from("data_connectors")
      .update({ data_source_id: dataSourceId })
      .eq("id", connectorId)
      .eq("organization_id", organization_id);
    if (linkError) {
      console.error("connector data source link failed:", linkError.message);
      await rollback();
      return json({ error: "Unable to link connector data source" }, 500);
    }

    const intervalMs: Record<ScheduleKind, number> = {
      manual: 0,
      every_5_min: 5 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
    };
    const nextRunAt = schedule_kind === "manual"
      ? null
      : new Date(Date.now() + intervalMs[schedule_kind]).toISOString();

    const { error: scheduleError } = await svc.from("connector_sync_schedules").insert({
      organization_id,
      connector_id: connectorId,
      schedule_kind,
      next_run_at: nextRunAt,
      created_at: new Date().toISOString(),
    });
    if (scheduleError) {
      console.error("connector schedule creation failed:", scheduleError.message);
      await rollback();
      return json({ error: "Unable to schedule connector sync" }, 500);
    }
    scheduleCreated = true;

    const { error: auditError } = await svc.from("audit_log").insert({
      organization_id,
      actor_type: "user",
      actor_id: user.id,
      action_type: "connector_created",
      resource_type: "data_connector",
      resource_id: connectorId,
      payload: {
        connector_type,
        name,
        data_source_id: dataSourceId,
        schedule_kind,
        vault_fields: Object.keys(vaultKeys),
      },
    });
    if (auditError) {
      console.error("connector audit creation failed:", auditError.message);
      await rollback();
      return json({ error: "Unable to complete audited connector provisioning" }, 500);
    }

    return json({
      success: true,
      connector_id: connectorId,
      data_source_id: dataSourceId,
      vault_keys: Object.keys(vaultKeys),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("connector-credential-store error:", message);
    return json({ error: "Failed to securely provision connector" }, 500);
  }
});
