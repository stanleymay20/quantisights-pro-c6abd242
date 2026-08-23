/**
 * SAP OData pull connector — Phase 5 scaffold.
 *
 * Modes:
 *   - historical_backfill : full $top-paginated read of allowed entity sets
 *   - incremental_sync    : appends $filter on cursor_field > checkpoint
 *
 * Governance:
 *   - $select required; $expand depth capped; $top capped; $apply-like patterns blocked
 *   - service+entity allowlist from connector.config.governance
 *   - read-only HTTP (GET); never issues POST/PATCH/DELETE to SAP
 *   - circuit breaker + throttle + dead-letter on failure
 *   - structured telemetry per service with connector_type / run_id / rows / cost
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import {
  upsertCanonicalEntities, upsertCanonicalEvents,
  upsertCanonicalMetrics, upsertCanonicalRelationships,
  type CanonicalEntityInput, type CanonicalEventInput,
  type CanonicalMetricInput, type CanonicalRelationshipInput,
} from "../_shared/canonical-mapper.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";
import {
  assertOdataQuerySafe, buildOdataUrl, buildSapAuthHeaders,
  extractRows, extractNextLink,
  type SapConnectorConfig, type SapGovernance, type SapEntityPull, type ODataVersion,
} from "../_shared/sap-odata.ts";

const VENDOR = "sap";
const SOURCE = "sap" as const;
const VALID_MODES = new Set(["historical_backfill", "incremental_sync"]);
type ServiceClient = ReturnType<typeof createClient<any>>;

const DEFAULT_GOV: SapGovernance = {
  allowed_services: ["API_BUSINESS_PARTNER", "API_SALES_ORDER_SRV", "API_MATERIAL_DOCUMENT_SRV", "API_PRODUCT_SRV"],
  max_top: 5_000,
  max_expand_depth: 1,
  query_timeout_seconds: 60,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return j({ error: "SAP connector service unavailable" }, 503, cors);
  const svc = createClient(supabaseUrl, serviceKey);

  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const connectorId = typeof body.connector_id === "string" ? body.connector_id : undefined;
    const requestedMode = typeof body.mode === "string" ? body.mode : undefined;
    if (!connectorId) return j({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: cErr } = await svc.from("data_connectors")
      .select("*").eq("id", connectorId).single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, cors);
    if (connector.connector_type !== "sap_odata") return j({ error: "not a SAP OData connector" }, 400, cors);

    const orgId = connector.organization_id as string;
    const guard = await requireCronOrOrgMember(req, orgId);
    if ("response" in guard) return guard.response;

    const cfg = (connector.config ?? {}) as SapConnectorConfig;
    const version: ODataVersion = cfg.odata_version ?? "V2";
    const mode = requestedMode ?? cfg.mode ?? "incremental_sync";
    if (!VALID_MODES.has(mode)) return j({ error: "mode must be historical_backfill or incremental_sync" }, 400, cors);
    const gov: SapGovernance = { ...DEFAULT_GOV, ...(cfg.governance ?? {}) };

    if (!cfg.base_url || !cfg.auth || !cfg.entity_pulls?.length) {
      logConnectorEvent({ connector_type: "sap_odata", connector_id: connectorId, organization_id: orgId, phase: "error", reason: "missing config" });
      return j({ error: "config requires base_url, auth, entity_pulls[]" }, 412, cors);
    }

    const gate = await shouldAllow(svc, orgId, connectorId);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "sap_odata", connector_id: connectorId, organization_id: orgId, phase: "skipped", reason: gate.reason });
      return j({ skipped: true, reason: gate.reason }, 200, cors);
    }

    const { data: run, error: runError } = await svc.from("connector_sync_runs").insert({
      connector_id: connectorId,
      organization_id: orgId,
      status: "running",
      started_at: new Date().toISOString(),
      mode,
      source_type: SOURCE,
    }).select("id").single();
    if (runError || !run?.id) {
      throw new Error(`Failed to create SAP sync run: ${runError?.message ?? "missing run id"}`);
    }
    const runId = run.id as string;

    let headers: Record<string, string>;
    try {
      headers = await buildSapAuthHeaders(cfg.auth);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connectorId, msg);
      await finalizeRun(svc, runId, "failed", 0, 0, 1, msg);
      logConnectorEvent({ connector_type: "sap_odata", connector_id: connectorId, organization_id: orgId, phase: "error", error: msg });
      return j({ error: msg, run_id: runId }, 412, cors);
    }

    let totalRows = 0;
    let totalInserted = 0;
    const failures: Array<{ service: string; entity_set: string; reason: string }> = [];

    for (const ep of cfg.entity_pulls) {
      try {
        const { top } = assertOdataQuerySafe(ep.service, ep, gov);
        const effective: SapEntityPull = { ...ep, top };

        if (mode === "incremental_sync" && ep.cursor_field) {
          const { data: ck, error: checkpointReadError } = await svc.from("connector_sync_checkpoints")
            .select("cursor_value, high_watermark")
            .eq("connector_id", connectorId)
            .eq("cursor_field", `${ep.service}.${ep.entity_set}.${ep.cursor_field}`)
            .maybeSingle();
          if (checkpointReadError) throw new Error(`Checkpoint read failed: ${checkpointReadError.message}`);
          const since = (ck?.high_watermark ?? ck?.cursor_value) as string | undefined;
          if (since) {
            const parsed = new Date(since);
            if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid SAP checkpoint value: ${since}`);
            const lit = version === "V2"
              ? `datetime'${parsed.toISOString().replace("Z", "")}'`
              : parsed.toISOString();
            const extra = `${ep.cursor_field} gt ${lit}`;
            effective.filter = effective.filter ? `(${effective.filter}) and (${extra})` : extra;
          }
        }

        let skipToken: string | undefined;
        let pages = 0;
        const entitiesAccum: CanonicalEntityInput[] = [];
        const eventsAccum: CanonicalEventInput[] = [];
        const metricsAccum: CanonicalMetricInput[] = [];
        const relsAccum: CanonicalRelationshipInput[] = [];
        let maxCursor: string | undefined;

        do {
          await preflightWait(svc, orgId, connectorId, VENDOR);
          const url = buildOdataUrl(cfg.base_url, version, ep.service, effective, top, skipToken);
          const res = await fetch(url, { headers, signal: AbortSignal.timeout((gov.query_timeout_seconds ?? 60) * 1000) });
          await observeResponse(svc, { orgId, connectorId, vendor: VENDOR, res });

          if (!res.ok) {
            const responseBody = await res.text();
            throw new Error(`OData ${res.status} ${ep.service}/${ep.entity_set}: ${responseBody.slice(0, 200)}`);
          }
          const payload = await res.json();
          const rows = extractRows(payload, version) as Record<string, unknown>[];
          totalRows += rows.length;

          for (const row of rows) {
            const extId = String(row[ep.canonical.external_id_field] ?? "");
            if (!extId) continue;
            const rawDisplayName = ep.canonical.display_name_field
              ? row[ep.canonical.display_name_field]
              : undefined;
            entitiesAccum.push({
              entity_type: ep.canonical.entity_type,
              external_id: extId,
              display_name: rawDisplayName == null ? undefined : String(rawDisplayName),
              attributes: { ...row, _service: ep.service, _entity_set: ep.entity_set },
            });
            if (ep.cursor_field && row[ep.cursor_field]) {
              const value = String(row[ep.cursor_field]);
              if (!maxCursor || value > maxCursor) maxCursor = value;
            }
            for (const emitter of ep.canonical.metric_emitters ?? []) {
              const value = Number(row[emitter.value_field]);
              const period = row[emitter.period_field];
              if (!Number.isFinite(value) || !period) continue;
              const date = new Date(String(period));
              if (Number.isNaN(date.getTime())) continue;
              metricsAccum.push({
                metric_key: emitter.metric_key,
                period_start: date.toISOString().slice(0, 10),
                period_grain: emitter.period_grain ?? "day",
                value,
                unit: emitter.unit,
                dimensions: emitter.group_by ? { [emitter.group_by]: row[emitter.group_by] } : {},
                entity_external_id: extId,
                entity_type: ep.canonical.entity_type,
              });
            }
          }

          skipToken = extractNextLink(payload, version);
          pages++;
        } while (skipToken && pages < 50);

        if (skipToken && pages >= 50) throw new Error(`SAP pagination safety cap reached for ${ep.service}/${ep.entity_set}`);

        const idMap = await upsertCanonicalEntities(svc, {
          orgId, connectorId, sourceType: SOURCE, entities: entitiesAccum,
        });
        const evIns = await upsertCanonicalEvents(svc, {
          orgId, connectorId, sourceType: SOURCE, events: eventsAccum, entityIdMap: idMap,
        });
        const mIns = await upsertCanonicalMetrics(svc, {
          orgId, connectorId, sourceType: SOURCE, metrics: metricsAccum, entityIdMap: idMap,
        });
        const rIns = await upsertCanonicalRelationships(svc, {
          orgId, connectorId, sourceType: SOURCE, relationships: relsAccum, entityIdMap: idMap,
        });
        totalInserted += entitiesAccum.length + evIns + mIns + rIns;

        if (ep.cursor_field && maxCursor) {
          const { error: checkpointWriteError } = await svc.from("connector_sync_checkpoints").upsert({
            connector_id: connectorId,
            organization_id: orgId,
            cursor_field: `${ep.service}.${ep.entity_set}.${ep.cursor_field}`,
            cursor_value: maxCursor,
            high_watermark: maxCursor,
            change_event_ready: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "connector_id,cursor_field" });
          if (checkpointWriteError) throw new Error(`Checkpoint write failed: ${checkpointWriteError.message}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ service: ep.service, entity_set: ep.entity_set, reason: msg });
        await deadLetter(svc, {
          orgId,
          connectorId,
          syncRunId: runId,
          payload: { service: ep.service, entity_set: ep.entity_set },
          errorMessage: msg,
        });
      }
    }

    const finalStatus = failures.length === 0 ? "completed" : (totalInserted > 0 ? "partial" : "failed");
    if (finalStatus === "failed") await recordFailure(svc, connectorId, failures[0]?.reason ?? "all entity pulls failed");
    else await recordSuccess(svc, connectorId);

    await finalizeRun(
      svc,
      runId,
      finalStatus,
      totalRows,
      totalInserted,
      failures.length,
      failures[0]?.reason ?? null,
    );

    logConnectorEvent({
      connector_type: "sap_odata",
      connector_id: connectorId,
      organization_id: orgId,
      phase: finalStatus === "failed" ? "error" : "complete",
      rows_extracted: totalRows,
      rows_inserted: totalInserted,
      rows_failed: failures.length,
      duration_ms: Date.now() - t0,
    });

    return j({
      success: finalStatus !== "failed",
      status: finalStatus,
      run_id: runId,
      mode,
      version,
      rows_extracted: totalRows,
      rows_inserted: totalInserted,
      sample_errors: failures.slice(0, 5),
    }, finalStatus === "failed" ? 502 : 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("connector-sap-pull error:", msg);
    return j({ error: msg }, 500, cors);
  }
});

async function finalizeRun(
  svc: ServiceClient,
  runId: string,
  status: string,
  rowsExtracted: number,
  rowsInserted: number,
  rowsFailed: number,
  errorMessage: string | null,
) {
  const { error } = await svc.from("connector_sync_runs").update({
    status,
    rows_extracted: rowsExtracted,
    rows_inserted: rowsInserted,
    rows_failed: rowsFailed,
    completed_at: new Date().toISOString(),
    error_message: errorMessage,
  }).eq("id", runId);
  if (error) throw new Error(`Failed to finalize SAP sync run: ${error.message}`);
}

function j(b: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
