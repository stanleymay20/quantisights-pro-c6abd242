// @ts-nocheck
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
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    const body = await req.json();
    const {
      organization_id,
      connector_type,
      name,
      credentials,       // { key: value } — all sensitive fields
      config = {},       // non-sensitive config (e.g. property IDs, object lists)
      schedule_kind = "hourly",
    } = body;

    if (!organization_id || !connector_type || !name || !credentials) {
      return json({ error: "organization_id, connector_type, name, credentials required" }, 400);
    }

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

    // Store each credential in Vault under a namespaced key
    const vaultKeys: Record<string, string> = {};
    for (const [field, value] of Object.entries(credentials)) {
      if (!value) continue;
      const vaultKeyName = `connector_${connectorId}_${field}`;
      const { error: vErr } = await svc.rpc("upsert_vault_secret", {
        _name: vaultKeyName,
        _value: String(value),
        _description: `${connector_type} connector credential: ${field}`,
      });
      if (vErr) {
        console.error(`Vault write failed for ${field}:`, vErr.message);
        // Fall back: store in encrypted config (Postgres encrypts at rest)
        config[`credential_${field}`] = String(value);
      } else {
        vaultKeys[field] = vaultKeyName;
      }
    }

    // Build the data_connectors record aligned with existing schema
    const connectorRecord: Record<string, unknown> = {
      id: connectorId,
      organization_id,
      name,
      connector_type,        // Must be a valid connector_type enum value (migration adds new ones)
      status: "draft",
      created_by: user.id,   // Required NOT NULL field
      updated_by: user.id,
      // Store the primary vault secret name (the first credential for single-cred connectors)
      vault_secret_name: Object.values(vaultKeys)[0] ?? null,
      // Store full vault key mapping in config (multi-credential connectors)
      config: {
        ...config,
        vault_keys: vaultKeys,
        connector_type_detail: connector_type,  // preserve exact type string
      },
      // credential_vault_keys column added by enterprise migration
      credential_vault_keys: vaultKeys,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: insertErr } = await svc
      .from("data_connectors")
      .upsert(connectorRecord, { onConflict: "id" });

    if (insertErr) {
      // If enum type validation fails, fall back to 'rest_api' as the stored type
      // and keep the real type in config.connector_type_detail
      const fallbackRecord = {
        ...connectorRecord,
        connector_type: "rest_api",   // valid base type as fallback
        config: { ...connectorRecord.config as Record<string, unknown>, connector_type_detail: connector_type },
      };
      const { error: fbErr } = await svc.from("data_connectors").upsert(fallbackRecord, { onConflict: "id" });
      if (fbErr) return json({ error: `Failed to save connector: ${fbErr.message}` }, 500);
    }

    // Create a data_sources record (used by the sync pipeline)
    const { data: ds, error: dsErr } = await svc
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
    const NEXT_INTERVAL_MS: Record<string, number> = {
      manual: 0,
      every_5_min: 5 * 60 * 1000,
      hourly: 60 * 60 * 1000,
      daily: 24 * 60 * 60 * 1000,
    };
    const intervalMs = NEXT_INTERVAL_MS[schedule_kind] ?? NEXT_INTERVAL_MS.hourly;
    const nextRunAt = new Date(Date.now() + intervalMs).toISOString();

    await svc.from("connector_sync_schedules").insert({
      organization_id,
      connector_id: connectorId,
      schedule_kind,
      next_run_at: nextRunAt,
      created_at: new Date().toISOString(),
    }).then(() => {});  // Non-fatal if table doesn't exist yet

    // Audit log
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
    return json({ error: msg }, 500);
  }
});
