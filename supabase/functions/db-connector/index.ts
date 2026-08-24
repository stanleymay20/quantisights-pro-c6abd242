import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import {
  resolveConnectorType,
  runDbConnectorAction,
  type DbConnectorRequest,
  type RuntimeResult,
} from "../_shared/db-connector-runtime.ts";

const ADMIN_ROLES = new Set(["owner", "admin"]);

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function runtimeErrors(runtime: RuntimeResult): string[] {
  const raw = runtime.body.errors;
  if (Array.isArray(raw)) return raw.filter((entry): entry is string => typeof entry === "string");
  if (typeof runtime.body.error === "string") return [runtime.body.error];
  return [];
}

function runtimeRecords(runtime: RuntimeResult): number | null {
  if (runtime.body.records === null || runtime.body.records === undefined) return null;
  const value = Number(runtime.body.records);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json({ error: "Database connector unavailable" }, 503, cors);
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, cors);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user?.id) return json({ error: "Unauthorized" }, 401, cors);

    let body: DbConnectorRequest;
    try {
      const parsed = await req.json();
      if (!isRecord(parsed)) return json({ error: "JSON object body required" }, 400, cors);
      body = parsed as unknown as DbConnectorRequest;
    } catch {
      return json({ error: "Valid JSON body required" }, 400, cors);
    }

    if (!body.organization_id || typeof body.organization_id !== "string") {
      return json({ error: "organization_id required" }, 400, cors);
    }
    if (!["test", "discover", "preview", "sync"].includes(body.action)) {
      return json({ error: `Unknown action: ${String(body.action)}` }, 400, cors);
    }

    const service = createClient(supabaseUrl, serviceKey);
    const { data: membership, error: membershipError } = await service
      .from("organization_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
    if (membershipError) {
      return json({ error: "Unable to verify organization authorization" }, 503, cors);
    }
    if (!membership || !ADMIN_ROLES.has(String(membership.role))) {
      return json({ error: "Forbidden — owner or admin required" }, 403, cors);
    }

    if (body.connector_config_id) {
      const { data: connectorConfig, error } = await service
        .from("connector_configs")
        .select("id,organization_id,data_source_id")
        .eq("id", body.connector_config_id)
        .eq("organization_id", body.organization_id)
        .maybeSingle();
      if (error) return json({ error: "Unable to verify connector configuration" }, 503, cors);
      if (!connectorConfig) return json({ error: "Connector configuration not found in organization" }, 404, cors);
      if (body.data_source_id && connectorConfig.data_source_id && connectorConfig.data_source_id !== body.data_source_id) {
        return json({ error: "Connector configuration does not belong to requested data source" }, 409, cors);
      }
    }

    if (body.data_source_id) {
      const { data: dataSource, error } = await service
        .from("data_sources")
        .select("id,organization_id")
        .eq("id", body.data_source_id)
        .eq("organization_id", body.organization_id)
        .maybeSingle();
      if (error) return json({ error: "Unable to verify data source" }, 503, cors);
      if (!dataSource) return json({ error: "Data source not found in organization" }, 404, cors);
    }

    const connectorType = resolveConnectorType(body);

    if (body.action === "sync") {
      if (!body.data_source_id) return json({ error: "data_source_id required" }, 400, cors);
      if (!body.metric_mappings?.length) return json({ error: "metric_mappings required" }, 400, cors);

      const { data: syncJob, error: syncJobError } = await service
        .from("data_sync_jobs")
        .insert({
          data_source_id: body.data_source_id,
          organization_id: body.organization_id,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (syncJobError || !syncJob?.id) {
        return json({ error: "Unable to create database sync job" }, 503, cors);
      }

      let runtime: RuntimeResult;
      try {
        runtime = await runDbConnectorAction(connectorType, body, body.organization_id, service);
      } catch (error) {
        runtime = { status: 500, body: { errors: [`Database sync failed: ${errorMessage(error)}`] } };
      }

      const records = runtimeRecords(runtime);
      const errors = runtimeErrors(runtime);
      if (records === null && errors.length === 0) {
        errors.push("Database sync did not return a verified records count");
      }
      const finalStatus = runtime.status >= 400 || records === null || (errors.length > 0 && records === 0)
        ? "failed"
        : errors.length > 0
          ? "partial"
          : "completed";

      const { error: updateError } = await service
        .from("data_sync_jobs")
        .update({
          status: finalStatus,
          records_synced: records,
          error_message: errors.length ? errors.join("; ").slice(0, 2_000) : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncJob.id)
        .eq("organization_id", body.organization_id);
      if (updateError) return json({ error: "Database sync finished but job bookkeeping failed" }, 503, cors);

      const { error: auditError } = await service.from("audit_log").insert({
        organization_id: body.organization_id,
        actor_id: user.id,
        actor_type: "user",
        action_type: "data_sync",
        resource_type: "data_source",
        resource_id: body.data_source_id,
        payload: {
          connector_type: connectorType,
          records,
          errors_count: errors.length,
          status: finalStatus,
        },
      });
      if (auditError) return json({ error: "Database sync finished but audit logging failed" }, 503, cors);

      return json(
        { ...runtime.body, records, errors, status: finalStatus, success: finalStatus !== "failed" },
        finalStatus === "failed" ? 502 : finalStatus === "partial" ? 207 : 200,
        cors,
      );
    }

    const runtime = await runDbConnectorAction(connectorType, body, body.organization_id, service);
    const runtimeFailed = runtime.status >= 400 || typeof runtime.body.error === "string" || runtime.body.success === false;

    if (body.action === "test" && !runtimeFailed && body.connector_config_id) {
      const { error } = await service
        .from("connector_configs")
        .update({ connection_status: "connected", last_tested_at: new Date().toISOString() })
        .eq("id", body.connector_config_id)
        .eq("organization_id", body.organization_id);
      if (error) return json({ error: "Connection test succeeded but connector status persistence failed" }, 503, cors);
    }

    if (body.action === "discover" && !runtimeFailed && body.connector_config_id) {
      const { error } = await service
        .from("connector_configs")
        .update({ discovered_schema: runtime.body, connection_status: "connected" })
        .eq("id", body.connector_config_id)
        .eq("organization_id", body.organization_id);
      if (error) return json({ error: "Schema discovery succeeded but connector persistence failed" }, 503, cors);
    }

    const { error: auditError } = await service.from("audit_log").insert({
      organization_id: body.organization_id,
      actor_id: user.id,
      actor_type: "user",
      action_type: `connector_${body.action}`,
      resource_type: "connector",
      resource_id: body.connector_config_id ?? null,
      payload: {
        connector_type: connectorType,
        success: !runtimeFailed,
        status_code: runtime.status,
      },
    });
    if (auditError) return json({ error: `Connector ${body.action} finished but audit logging failed` }, 503, cors);

    return json(runtime.body, runtime.status, cors);
  } catch (error) {
    console.error("db-connector error:", error instanceof Error ? error.message : String(error));
    return json({ error: "Database connector failed" }, 500, cors);
  }
});
