// @ts-nocheck
/**
 * SAP OData pull connector — Phase 5 scaffold.
 *
 * Modes:
 *   - historical_backfill : full $top-paginated read of allowed entity sets
 *   - incremental_sync    : appends $filter on cursor_field > checkpoint
 *
 * Canonical mapping (Operational Ontology for SAP/S/4HANA):
 *   - canonical_entities      : account (BusinessPartner/Customer), sales_order, material, supplier, contact
 *   - canonical_events        : sales_order.created, sales_order.status_changed
 *   - canonical_relationships : order_of (order → account), item_of (item → order), supplier_of (supplier → material)
 *   - canonical_metrics       : sales.order_value (per day × distribution channel),
 *                                sales.order_count, inventory.on_hand, etc.
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
import { shouldAllow, recordSuccess, recordFailure, deadLetter } from "../_shared/connector-isolation.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import {
  upsertCanonicalEntities, upsertCanonicalEvents,
  upsertCanonicalMetrics, upsertCanonicalRelationships,
} from "../_shared/canonical-mapper.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";
import {
  assertOdataQuerySafe, buildOdataUrl, buildSapAuthHeaders,
  extractRows, extractNextLink,
  type SapConnectorConfig, type SapGovernance, type SapEntityPull, type ODataVersion,
} from "../_shared/sap-odata.ts";

const VENDOR = "sap";
const SOURCE = "sap" as const;

const DEFAULT_GOV: SapGovernance = {
  allowed_services: ["API_BUSINESS_PARTNER", "API_SALES_ORDER_SRV", "API_MATERIAL_DOCUMENT_SRV", "API_PRODUCT_SRV"],
  max_top: 5_000,
  max_expand_depth: 1,
  query_timeout_seconds: 60,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const t0 = Date.now();
  try {
    const { connector_id, mode: requestedMode } = await req.json().catch(() => ({}));
    if (!connector_id) return j({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: cErr } = await svc.from("data_connectors")
      .select("*").eq("id", connector_id).single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, cors);
    if (connector.connector_type !== "sap_odata") return j({ error: "not a SAP OData connector" }, 400, cors);

    const orgId = connector.organization_id;
    const cfg = (connector.config ?? {}) as SapConnectorConfig;
    const version: ODataVersion = cfg.odata_version ?? "V2";
    const mode = (requestedMode as any) || cfg.mode || "incremental_sync";
    const gov: SapGovernance = { ...DEFAULT_GOV, ...(cfg.governance ?? {}) };

    if (!cfg.base_url || !cfg.auth || !cfg.entity_pulls?.length) {
      logConnectorEvent({ connector_type: "sap_odata", connector_id, organization_id: orgId, phase: "error", reason: "missing config" });
      return j({ error: "config requires base_url, auth, entity_pulls[]" }, 412, cors);
    }

    const gate = await shouldAllow(svc, orgId, connector_id);
    if (!gate.allow) {
      logConnectorEvent({ connector_type: "sap_odata", connector_id, organization_id: orgId, phase: "skipped", reason: gate.reason });
      return j({ skipped: true, reason: gate.reason }, 200, cors);
    }

    // Sync run header
    const { data: run } = await svc.from("connector_sync_runs").insert({
      connector_id, organization_id: orgId, status: "running",
      started_at: new Date().toISOString(), mode, source_type: SOURCE,
    }).select().single().catch(() => ({ data: null } as any));
    const runId = run?.id ?? null;

    let headers: Record<string, string>;
    try { headers = await buildSapAuthHeaders(cfg.auth); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connector_id, msg);
      logConnectorEvent({ connector_type: "sap_odata", connector_id, organization_id: orgId, phase: "error", error: msg });
      return j({ error: msg }, 412, cors);
    }

    let totalRows = 0;
    let totalInserted = 0;
    const failures: any[] = [];

    for (const ep of cfg.entity_pulls) {
      try {
        const { url_path, top } = assertOdataQuerySafe(ep.service, ep, gov);

        // Incremental: append cursor filter
        const effective: SapEntityPull = { ...ep, top };
        if (mode === "incremental_sync" && ep.cursor_field) {
          const { data: ck } = await svc.from("connector_sync_checkpoints")
            .select("cursor_value, high_watermark")
            .eq("connector_id", connector_id)
            .eq("cursor_field", `${ep.service}.${ep.entity_set}.${ep.cursor_field}`)
            .maybeSingle();
          const since = (ck?.high_watermark ?? ck?.cursor_value) as string | undefined;
          if (since) {
            const op = version === "V2" ? "gt" : "gt";
            const lit = version === "V2"
              ? `datetime'${new Date(since).toISOString().replace("Z", "")}'`
              : `${new Date(since).toISOString()}`;
            const extra = `${ep.cursor_field} ${op} ${lit}`;
            effective.filter = effective.filter ? `(${effective.filter}) and (${extra})` : extra;
          }
        }

        // Paginate
        let skipToken: string | undefined;
        let pages = 0;
        const entitiesAccum: any[] = [];
        const eventsAccum: any[] = [];
        const metricsAccum: any[] = [];
        const relsAccum: any[] = [];
        let maxCursor: string | undefined;

        do {
          await preflightWait(svc, connector_id, VENDOR);
          const url = buildOdataUrl(cfg.base_url, version, ep.service, effective, top, skipToken);
          const res = await fetch(url, { headers, signal: AbortSignal.timeout((gov.query_timeout_seconds ?? 60) * 1000) });
          await observeResponse(svc, connector_id, VENDOR, {
            status: res.status,
            remaining: Number(res.headers.get("x-ratelimit-remaining") ?? NaN),
            reset_after_ms: Number(res.headers.get("retry-after") ?? NaN) * 1000,
          });

          if (!res.ok) {
            const body = await res.text();
            throw new Error(`OData ${res.status} ${ep.service}/${ep.entity_set}: ${body.slice(0, 200)}`);
          }
          const payload = await res.json();
          const rows = extractRows(payload, version);
          totalRows += rows.length;

          // Map to canonical
          for (const r of rows) {
            const extId = String(r[ep.canonical.external_id_field] ?? "");
            if (!extId) continue;
            entitiesAccum.push({
              entity_type: ep.canonical.entity_type,
              external_id: extId,
              display_name: ep.canonical.display_name_field ? r[ep.canonical.display_name_field] : undefined,
              attributes: { ...r, _service: ep.service, _entity_set: ep.entity_set },
            });
            if (ep.cursor_field && r[ep.cursor_field]) {
              const v = String(r[ep.cursor_field]);
              if (!maxCursor || v > maxCursor) maxCursor = v;
            }
            for (const m of ep.canonical.metric_emitters ?? []) {
              const value = Number(r[m.value_field]);
              const period = r[m.period_field];
              if (!Number.isFinite(value) || !period) continue;
              metricsAccum.push({
                metric_key: m.metric_key,
                period_start: new Date(period).toISOString().slice(0, 10),
                period_grain: m.period_grain ?? "day",
                value,
                unit: m.unit,
                dimensions: m.group_by ? { [m.group_by]: r[m.group_by] } : {},
                entity_external_id: extId,
                entity_type: ep.canonical.entity_type,
              });
            }
          }

          skipToken = extractNextLink(payload, version);
          pages++;
        } while (skipToken && pages < 50);

        // Upsert canonical
        const idMap = await upsertCanonicalEntities(svc, {
          orgId, connectorId: connector_id, sourceType: SOURCE, entities: entitiesAccum,
        });
        const evIns = await upsertCanonicalEvents(svc, {
          orgId, connectorId: connector_id, sourceType: SOURCE, events: eventsAccum, entityIdMap: idMap,
        });
        const mIns = await upsertCanonicalMetrics(svc, {
          orgId, connectorId: connector_id, sourceType: SOURCE, metrics: metricsAccum, entityIdMap: idMap,
        });
        const rIns = await upsertCanonicalRelationships(svc, {
          orgId, connectorId: connector_id, sourceType: SOURCE, relationships: relsAccum, entityIdMap: idMap,
        });
        totalInserted += entitiesAccum.length + evIns + mIns + rIns;

        // Checkpoint
        if (ep.cursor_field && maxCursor) {
          await svc.from("connector_sync_checkpoints").upsert({
            connector_id, organization_id: orgId,
            cursor_field: `${ep.service}.${ep.entity_set}.${ep.cursor_field}`,
            cursor_value: maxCursor,
            high_watermark: maxCursor,
            change_event_ready: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: "connector_id,cursor_field" });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ service: ep.service, entity_set: ep.entity_set, reason: msg });
        await deadLetter(svc, connector_id, orgId, { service: ep.service, entity_set: ep.entity_set, reason: msg });
      }
    }

    const finalStatus = failures.length === 0 ? "completed" : (totalInserted > 0 ? "partial" : "failed");
    if (finalStatus === "failed") await recordFailure(svc, connector_id, failures[0]?.reason ?? "all entity pulls failed");
    else await recordSuccess(svc, connector_id);

    if (runId) {
      await svc.from("connector_sync_runs").update({
        status: finalStatus,
        rows_extracted: totalRows,
        rows_inserted: totalInserted,
        rows_failed: failures.length,
        completed_at: new Date().toISOString(),
      }).eq("id", runId);
    }

    logConnectorEvent({
      connector_type: "sap_odata", connector_id, organization_id: orgId,
      phase: finalStatus === "failed" ? "error" : "complete",
      rows_extracted: totalRows, rows_inserted: totalInserted, rows_failed: failures.length,
      duration_ms: Date.now() - t0,
    });

    return j({
      success: finalStatus !== "failed", run_id: runId, mode, version,
      rows_extracted: totalRows, rows_inserted: totalInserted,
      sample_errors: failures.slice(0, 5),
    }, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("connector-sap-pull error:", msg);
    return j({ error: msg }, 500, cors);
  }
});

function j(b: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
