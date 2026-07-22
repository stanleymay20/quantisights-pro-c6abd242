// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { upsertCanonicalMetrics } from "../_shared/canonical-mapper.ts";
import { enforceLimit, assertSelectOnly, logConnectorEvent, rowToCanonicalMetric, validateMapping, type BigQueryConfig } from "../_shared/warehouse-config.ts";

const GW = "https://connector-gateway.lovable.dev/bigquery/bigquery/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { connector_id } = await req.json();
    if (!connector_id) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector } = await svc.from("data_connectors").select("*").eq("id", connector_id).single();
    if (!connector) return json({ error: "connector not found" }, 404, cors);
    const cfg = (connector.config ?? {}) as BigQueryConfig;
    const m = validateMapping(cfg.mapping);
    if (!m.ok) return json({ error: `config invalid: ${m.reason}` }, 400, cors);
    if (!cfg.query || !cfg.project_id) return json({ error: "config.query and config.project_id required" }, 400, cors);
    try { assertSelectOnly(cfg.query); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logConnectorEvent({ connector_type: "bigquery", connector_id, organization_id: connector.organization_id, phase: "error", error: msg });
      return json({ error: `query rejected: ${msg}` }, 400, cors);
    }

    const gate = await shouldAllow(svc, connector.organization_id, connector_id);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "bigquery", connector_id, organization_id: connector.organization_id, phase: "skipped", reason: gate.reason });
      return json({ skipped: true, reason: gate.reason }, 200, cors);
    }

    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    const BQ = Deno.env.get("BIGQUERY_API_KEY");
    if (!LOVABLE || !BQ) {
      await recordFailure(svc, connector_id, "missing gateway secrets (LOVABLE_API_KEY/BIGQUERY_API_KEY)");
      return json({ error: "BigQuery connector not linked" }, 412, cors);
    }

    const baseHeaders = {
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": BQ,
      "Content-Type": "application/json",
    } as const;
    const queryText = enforceLimit(cfg.query, cfg.limit_rows ?? 10_000);
    const maxBytes = cfg.max_bytes_billed ?? "1073741824"; // 1 GB default

    // 1) Dry run — cost guard
    const dry = await fetch(`${GW}/projects/${cfg.project_id}/jobs`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ configuration: { query: { query: queryText, useLegacySql: false, dryRun: true } } }),
    });
    const dryBody = await dry.json();
    if (!dry.ok) {
      const msg = `BigQuery dry-run ${dry.status}: ${JSON.stringify(dryBody).slice(0, 300)}`;
      await recordFailure(svc, connector_id, msg);
      return json({ error: msg }, 502, cors);
    }
    const estBytes = Number(dryBody?.statistics?.totalBytesProcessed ?? 0);
    if (estBytes > Number(maxBytes)) {
      const msg = `dry-run estimate ${estBytes} bytes exceeds cap ${maxBytes}`;
      await recordFailure(svc, connector_id, msg);
      await deadLetter(svc, { orgId: connector.organization_id, connectorId: connector_id, errorClass: "bigquery_query", payload: { queryText, estBytes }, errorMessage: msg });
      logConnectorEvent({ connector_type: "bigquery", connector_id, organization_id: connector.organization_id, phase: "cost_block", bytes_processed: estBytes, bytes_cap: Number(maxBytes), error: msg });
      return json({ error: msg, est_bytes: estBytes, cap_bytes: Number(maxBytes) }, 413, cors);
    }

    // 2) Real run
    const t0 = Date.now();
    const res = await fetch(`${GW}/projects/${cfg.project_id}/queries`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        query: queryText, useLegacySql: false, maximumBytesBilled: maxBytes,
        location: cfg.location, timeoutMs: 60_000,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      const msg = `BigQuery ${res.status}: ${JSON.stringify(body).slice(0, 300)}`;
      await recordFailure(svc, connector_id, msg);
      await deadLetter(svc, { orgId: connector.organization_id, connectorId: connector_id, errorClass: "bigquery_query", payload: { queryText }, errorMessage: msg });
      return json({ error: msg }, 502, cors);
    }

    const fields: string[] = (body.schema?.fields ?? []).map((f: any) => f.name);
    const rows = body.rows ?? [];
    const metrics: any[] = [];
    const errors: { row: number; reason: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].f ?? [];
      const obj: Record<string, unknown> = {};
      for (let j = 0; j < fields.length; j++) obj[fields[j]] = cells[j]?.v;
      try { metrics.push(rowToCanonicalMetric(obj, m.mapping)); }
      catch (e) { errors.push({ row: i, reason: e instanceof Error ? e.message : String(e) }); }
    }

    const inserted = await upsertCanonicalMetrics(svc, {
      orgId: connector.organization_id, connectorId: connector_id, sourceType: "bigquery", metrics,
    });

    await recordSuccess(svc, connector_id);
    await svc.from("data_connectors").update({
      last_success_at: new Date().toISOString(), consecutive_failures: 0, health: errors.length ? "degraded" : "healthy",
    }).eq("id", connector_id);

    const duration_ms = Date.now() - t0;
    logConnectorEvent({
      connector_type: "bigquery", connector_id, organization_id: connector.organization_id, phase: "complete",
      rows_extracted: rows.length, rows_inserted: inserted, rows_failed: errors.length,
      bytes_processed: estBytes, bytes_cap: Number(maxBytes), duration_ms,
    });
    return json({ success: true, rows_extracted: rows.length, rows_inserted: inserted, rows_invalid: errors.length, bytes_processed: estBytes, sample_errors: errors.slice(0, 5), duration_ms }, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify({ ts: new Date().toISOString(), connector_type: "bigquery", phase: "error", error: msg }));
    return json({ error: msg }, 500, cors);
  }
});

function json(b: unknown, s: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}
