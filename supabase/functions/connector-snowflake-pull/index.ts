import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { authorizeConnectorInvocation } from "../_shared/connector-invocation-auth.ts";
import { upsertCanonicalMetrics } from "../_shared/canonical-mapper.ts";
import { enforceLimit, assertSelectOnly, logConnectorEvent, rowToCanonicalMetric, validateMapping, type SnowflakeConfig } from "../_shared/warehouse-config.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/snowflake";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Snowflake pull service unavailable" }, 503, cors);
  const svc = createClient(supabaseUrl, serviceRoleKey);

  try {
    const requestBody = await req.json().catch(() => ({} as Record<string, unknown>));
    const connectorId = typeof requestBody.connector_id === "string" ? requestBody.connector_id : null;
    if (!connectorId) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: connectorError } = await svc.from("data_connectors").select("*").eq("id", connectorId).single();
    if (connectorError || !connector) return json({ error: "connector not found" }, 404, cors);
    if (connector.connector_type !== "snowflake") return json({ error: "not a Snowflake connector" }, 400, cors);
    if (typeof connector.organization_id !== "string" || !connector.organization_id) return json({ error: "connector organization missing" }, 500, cors);

    const authHeader = req.headers.get("authorization");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const userClient = anonKey
      ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader ?? "" } } })
      : null;
    const invocation = await authorizeConnectorInvocation({
      authHeader,
      serviceRoleKey,
      organizationId: connector.organization_id,
      userClient,
      membershipClient: svc,
    });
    if (!invocation.allowed) {
      return json({ error: invocation.reason === "forbidden" ? "Forbidden" : "Unauthorized" }, invocation.status, cors);
    }

    const cfg = (connector.config ?? {}) as SnowflakeConfig;
    const mappingResult = validateMapping(cfg.mapping);
    if (!mappingResult.ok) return json({ error: `config invalid: ${mappingResult.reason}` }, 400, cors);
    if (!cfg.query) return json({ error: "config.query required" }, 400, cors);
    try {
      assertSelectOnly(cfg.query);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logConnectorEvent({ connector_type: "snowflake", connector_id: connectorId, organization_id: connector.organization_id, phase: "error", error: message });
      return json({ error: `query rejected: ${message}` }, 400, cors);
    }

    const gate = await shouldAllow(svc, connector.organization_id, connectorId);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "snowflake", connector_id: connectorId, organization_id: connector.organization_id, phase: "skipped", reason: gate.reason });
      return json({ skipped: true, reason: gate.reason }, 200, cors);
    }

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const snowflakeKey = Deno.env.get("SNOWFLAKE_API_KEY");
    if (!lovableKey || !snowflakeKey) {
      await recordFailure(svc, connectorId, "missing gateway secrets (LOVABLE_API_KEY/SNOWFLAKE_API_KEY)");
      return json({ error: "Snowflake connector not linked" }, 412, cors);
    }

    const statement = enforceLimit(cfg.query, cfg.limit_rows ?? 10_000);
    const startedAt = Date.now();
    const response = await fetch(`${GATEWAY}/v2/statements`, {
      method: "POST",
      signal: AbortSignal.timeout(70_000),
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": snowflakeKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statement,
        warehouse: cfg.warehouse,
        database: cfg.database,
        schema: cfg.schema,
        timeout: 60,
      }),
    });
    const responseBody = await response.json();
    if (!response.ok) {
      const message = `Snowflake gateway ${response.status}: ${JSON.stringify(responseBody).slice(0, 300)}`;
      await recordFailure(svc, connectorId, message);
      await deadLetter(svc, { orgId: connector.organization_id, connectorId, errorClass: "snowflake_query", payload: { statement }, errorMessage: message });
      return json({ error: message }, 502, cors);
    }

    const columns: string[] = Array.isArray(responseBody.resultSetMetaData?.rowType)
      ? responseBody.resultSetMetaData.rowType.map((column: { name?: unknown }) => String(column.name ?? "")).filter(Boolean)
      : [];
    const rows: unknown[][] = Array.isArray(responseBody.data) ? responseBody.data : [];
    const metrics = [];
    const errors: Array<{ row: number; reason: string }> = [];
    for (let i = 0; i < rows.length; i++) {
      const object: Record<string, unknown> = {};
      for (let j = 0; j < columns.length; j++) object[columns[j]] = rows[i]?.[j];
      try {
        metrics.push(rowToCanonicalMetric(object, mappingResult.mapping));
      } catch (error) {
        errors.push({ row: i, reason: error instanceof Error ? error.message : String(error) });
      }
    }

    const inserted = await upsertCanonicalMetrics(svc, {
      orgId: connector.organization_id,
      connectorId,
      sourceType: "snowflake",
      metrics,
    });

    if (rows.length > 0 && inserted === 0) {
      const message = `Snowflake returned ${rows.length} rows but none were valid for canonical persistence`;
      await recordFailure(svc, connectorId, message);
      return json({ error: message, rows_extracted: rows.length, rows_invalid: errors.length, sample_errors: errors.slice(0, 5) }, 422, cors);
    }

    await recordSuccess(svc, connectorId);
    const { error: healthError } = await svc.from("data_connectors").update({
      last_success_at: new Date().toISOString(),
      consecutive_failures: 0,
      health: errors.length ? "degraded" : "healthy",
    }).eq("id", connectorId);
    if (healthError) throw new Error(`Failed to persist Snowflake connector health: ${healthError.message}`);

    const durationMs = Date.now() - startedAt;
    logConnectorEvent({
      connector_type: "snowflake",
      connector_id: connectorId,
      organization_id: connector.organization_id,
      phase: "complete",
      rows_extracted: rows.length,
      rows_inserted: inserted,
      rows_failed: errors.length,
      duration_ms: durationMs,
    });
    return json({
      success: true,
      status: errors.length ? "partial" : "completed",
      rows_extracted: rows.length,
      rows_inserted: inserted,
      rows_invalid: errors.length,
      sample_errors: errors.slice(0, 5),
      duration_ms: durationMs,
    }, 200, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ ts: new Date().toISOString(), connector_type: "snowflake", phase: "error", error: message }));
    return json({ error: message }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
