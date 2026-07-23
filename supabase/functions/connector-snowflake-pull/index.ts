// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { upsertCanonicalMetrics } from "../_shared/canonical-mapper.ts";
import { enforceLimit, assertSelectOnly, logConnectorEvent, rowToCanonicalMetric, validateMapping, type SnowflakeConfig } from "../_shared/warehouse-config.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/snowflake";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { connector_id } = await req.json();
    if (!connector_id) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: cErr } = await svc.from("data_connectors").select("*").eq("id", connector_id).single();
    if (cErr || !connector) return json({ error: "connector not found" }, 404, cors);
    const cfg = (connector.config ?? {}) as SnowflakeConfig;
    const m = validateMapping(cfg.mapping);
    if (!m.ok) return json({ error: `config invalid: ${m.reason}` }, 400, cors);
    if (!cfg.query) return json({ error: "config.query required" }, 400, cors);
    try { assertSelectOnly(cfg.query); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logConnectorEvent({ connector_type: "snowflake", connector_id, organization_id: connector.organization_id, phase: "error", error: msg });
      return json({ error: `query rejected: ${msg}` }, 400, cors);
    }

    const gate = await shouldAllow(svc, connector.organization_id, connector_id);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "snowflake", connector_id, organization_id: connector.organization_id, phase: "skipped", reason: gate.reason });
      return json({ skipped: true, reason: gate.reason }, 200, cors);
    }

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const SF = Deno.env.get("SNOWFLAKE_API_KEY");
    if (!LOVABLE || !SF) {
      await recordFailure(svc, connector_id, "missing gateway secrets (LOVABLE_API_KEY/SNOWFLAKE_API_KEY)");
      return json({ error: "Snowflake connector not linked" }, 412, cors);
    }

    const stmt = enforceLimit(cfg.query, cfg.limit_rows ?? 10_000);
    const t0 = Date.now();
    const res = await fetch(`${GATEWAY}/v2/statements`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE}`,
        "X-Connection-Api-Key": SF,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        statement: stmt,
        warehouse: cfg.warehouse,
        database: cfg.database,
        schema: cfg.schema,
        timeout: 60,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = `Snowflake gateway ${res.status}: ${JSON.stringify(body).slice(0, 300)}`;
      await recordFailure(svc, connector_id, msg);
      await deadLetter(svc, { orgId: connector.organization_id, connectorId: connector_id, errorClass: "snowflake_query", payload: { stmt }, errorMessage: msg });
      return json({ error: msg }, 502, cors);
    }

    const cols: string[] = (body.resultSetMetaData?.rowType ?? []).map((c: any) => c.name);
    const rows: string[][] = body.data ?? [];
    const metrics: any[] = [];
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const obj: Record<string, unknown> = {};
      for (let j = 0; j < cols.length; j++) obj[cols[j]] = rows[i][j];
      try { metrics.push(rowToCanonicalMetric(obj, m.mapping)); }
      catch (e) { errors.push({ row: i, reason: e instanceof Error ? e.message : String(e) }); }
    }

    const inserted = await upsertCanonicalMetrics(svc, {
      orgId: connector.organization_id, connectorId: connector_id, sourceType: "snowflake", metrics,
    });

    await recordSuccess(svc, connector_id);
    await svc.from("data_connectors").update({
      last_success_at: new Date().toISOString(), consecutive_failures: 0, health: errors.length ? "degraded" : "healthy",
    }).eq("id", connector_id);

    const duration_ms = Date.now() - t0;
    logConnectorEvent({
      connector_type: "snowflake", connector_id, organization_id: connector.organization_id,
      phase: "complete", rows_extracted: rows.length, rows_inserted: inserted, rows_failed: errors.length, duration_ms,
    });
    return json({ success: true, rows_extracted: rows.length, rows_inserted: inserted, rows_invalid: errors.length, sample_errors: errors.slice(0, 5), duration_ms }, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ ts: new Date().toISOString(), connector_type: "snowflake", phase: "error", error: msg }));
    return json({ error: msg }, 500, cors);
  }
});

function json(b: unknown, s: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
