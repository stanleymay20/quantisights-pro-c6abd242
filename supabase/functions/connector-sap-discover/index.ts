// @ts-nocheck
/**
 * SAP OData $metadata discovery — caches entity types, key fields, fields,
 * navigation properties to sap_object_schemas so pull jobs can validate
 * field allowlists, drift-detect schema changes, and surface to operators.
 *
 * Read-only; never mutates SAP. Throttled by connector circuit breaker.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { shouldAllow, recordSuccess, recordFailure } from "../_shared/connector-isolation.ts";
import {
  buildMetadataUrl, buildSapAuthHeaders, parseMetadataXml,
  type SapConnectorConfig, type ODataVersion,
} from "../_shared/sap-odata.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { connector_id } = await req.json().catch(() => ({}));
    if (!connector_id) return j({ error: "connector_id required" }, 400, cors);

    const { data: connector, error: cErr } = await svc.from("data_connectors")
      .select("*").eq("id", connector_id).single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, cors);
    if (connector.connector_type !== "sap_odata") return j({ error: "not a SAP OData connector" }, 400, cors);

    const orgId = connector.organization_id;
    const cfg = (connector.config ?? {}) as SapConnectorConfig;
    const version: ODataVersion = cfg.odata_version ?? "V2";
    if (!cfg.base_url || !cfg.auth || !cfg.services?.length) {
      return j({ error: "config must include base_url, auth, services[]" }, 412, cors);
    }

    const gate = await shouldAllow(svc, orgId, connector_id);
    if (!gate.allow) return j({ skipped: true, reason: gate.reason }, 200, cors);

    const t0 = Date.now();
    let headers: Record<string, string>;
    try { headers = await buildSapAuthHeaders(cfg.auth); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connector_id, msg);
      return j({ error: msg }, 412, cors);
    }

    // Prior snapshot for drift detection
    const { data: prior } = await svc.from("sap_object_schemas")
      .select("service_name,entity_set,entity_type,key_fields,fields,navigation_properties")
      .eq("connector_id", connector_id);
    const priorMap = new Map<string, any>();
    for (const p of prior ?? []) priorMap.set(`${p.service_name}::${p.entity_set}`, p);

    const discovered: any[] = [];
    const driftAlerts: any[] = [];
    const errors: any[] = [];
    const seenKeys = new Set<string>();

    for (const service of cfg.services) {
      const url = buildMetadataUrl(cfg.base_url, version, service);
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) {
          errors.push({ service, status: res.status, error: (await res.text()).slice(0, 200) });
          continue;
        }
        const xml = await res.text();
        const types = parseMetadataXml(xml);
        for (const t of types) {
          for (const setName of t.entity_sets) {
            const key = `${service}::${setName}`;
            seenKeys.add(key);
            const row = {
              organization_id: orgId, connector_id,
              service_name: service, entity_set: setName, entity_type: t.entity_type,
              odata_version: version,
              is_custom: /^(Y|Z)/.test(t.entity_type) || /^(Y|Z)/.test(setName),
              key_fields: t.key_fields, fields: t.fields,
              navigation_properties: t.navigation_properties,
              last_discovered_at: new Date().toISOString(),
            };
            discovered.push(row);

            const before = priorMap.get(key);
            if (!before) {
              driftAlerts.push({
                organization_id: orgId, connector_id, service_name: service,
                entity_set: setName, entity_type: t.entity_type,
                drift_type: "entity_new", severity: "info",
                after_value: { entity_type: t.entity_type, fields_count: t.fields.length },
                operational_impact: "New entity discovered; available for canonical mapping.",
              });
              continue;
            }
            const beforeFields = new Map<string, any>((before.fields ?? []).map((f: any) => [f.name, f]));
            const afterFields = new Map<string, any>(t.fields.map((f: any) => [f.name, f]));
            for (const [fname, fmeta] of afterFields) {
              if (!beforeFields.has(fname)) {
                driftAlerts.push({
                  organization_id: orgId, connector_id, service_name: service,
                  entity_set: setName, entity_type: t.entity_type,
                  drift_type: "field_added", severity: "info", field_name: fname,
                  after_value: fmeta,
                  operational_impact: "New field available; extend mapping to capture.",
                });
              } else if (JSON.stringify(beforeFields.get(fname).type) !== JSON.stringify(fmeta.type)) {
                driftAlerts.push({
                  organization_id: orgId, connector_id, service_name: service,
                  entity_set: setName, entity_type: t.entity_type,
                  drift_type: "field_type_changed", severity: "critical", field_name: fname,
                  before_value: beforeFields.get(fname), after_value: fmeta,
                  operational_impact: "Field type changed; downstream parsers may fail.",
                });
              }
            }
            for (const fname of beforeFields.keys()) {
              if (!afterFields.has(fname)) {
                driftAlerts.push({
                  organization_id: orgId, connector_id, service_name: service,
                  entity_set: setName, entity_type: t.entity_type,
                  drift_type: "field_removed", severity: "critical", field_name: fname,
                  before_value: beforeFields.get(fname),
                  operational_impact: "Field removed upstream; mappings referencing it will break.",
                });
              }
            }
            if (JSON.stringify(before.key_fields ?? []) !== JSON.stringify(t.key_fields)) {
              driftAlerts.push({
                organization_id: orgId, connector_id, service_name: service,
                entity_set: setName, entity_type: t.entity_type,
                drift_type: "key_changed", severity: "critical",
                before_value: before.key_fields, after_value: t.key_fields,
                operational_impact: "Entity key changed; external_id continuity at risk.",
              });
            }
            const beforeNav = new Set<string>((before.navigation_properties ?? []).map((n: any) => n.name));
            const afterNav = new Set<string>(t.navigation_properties.map((n: any) => n.name));
            for (const n of afterNav) if (!beforeNav.has(n)) driftAlerts.push({
              organization_id: orgId, connector_id, service_name: service,
              entity_set: setName, entity_type: t.entity_type,
              drift_type: "nav_property_added", severity: "info", field_name: n,
            });
            for (const n of beforeNav) if (!afterNav.has(n)) driftAlerts.push({
              organization_id: orgId, connector_id, service_name: service,
              entity_set: setName, entity_type: t.entity_type,
              drift_type: "nav_property_removed", severity: "warning", field_name: n,
              operational_impact: "Relationship traversal removed; relationship mappings may break.",
            });
          }
        }
      } catch (e) {
        errors.push({ service, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // Entities previously cached but no longer returned
    for (const [key, before] of priorMap) {
      if (!seenKeys.has(key) && cfg.services.includes(before.service_name)) {
        driftAlerts.push({
          organization_id: orgId, connector_id, service_name: before.service_name,
          entity_set: before.entity_set, entity_type: before.entity_type,
          drift_type: "entity_missing", severity: "critical",
          before_value: { entity_type: before.entity_type },
          operational_impact: "Entity set no longer exposed by SAP service; pulls will fail.",
        });
      }
    }

    if (discovered.length) {
      const { error } = await svc.from("sap_object_schemas").upsert(discovered, {
        onConflict: "connector_id,service_name,entity_set",
        ignoreDuplicates: false,
      });
      if (error) errors.push({ stage: "upsert", error: error.message });
    }
    if (driftAlerts.length) {
      const { error } = await svc.from("sap_schema_drift_alerts").insert(driftAlerts);
      if (error) errors.push({ stage: "drift_insert", error: error.message });
    }

    await recordSuccess(svc, connector_id);
    logConnectorEvent({
      connector_type: "sap_odata", connector_id, organization_id: orgId,
      phase: "complete", rows_inserted: discovered.length, duration_ms: Date.now() - t0,
    });
    return j({
      success: true, discovered: discovered.length, drift_alerts: driftAlerts.length,
      services: cfg.services.length, errors,
    }, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("connector-sap-discover error:", msg);
    return j({ error: msg }, 500, cors);
  }
});

function j(b: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
