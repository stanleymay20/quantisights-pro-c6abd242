/**
 * SAP OData $metadata discovery — caches entity types, key fields, fields,
 * navigation properties to sap_object_schemas so pull jobs can validate
 * field allowlists, drift-detect schema changes, and surface to operators.
 *
 * Read-only upstream; writes only discovery/drift metadata locally.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { shouldAllow, recordSuccess, recordFailure } from "../_shared/connector-isolation.ts";
import {
  buildMetadataUrl, buildSapAuthHeaders, parseMetadataXml,
  type SapConnectorConfig, type ODataVersion,
} from "../_shared/sap-odata.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";

type PriorSchema = {
  service_name: string;
  entity_set: string;
  entity_type: string;
  key_fields: unknown[] | null;
  fields: Array<Record<string, unknown>> | null;
  navigation_properties: Array<Record<string, unknown>> | null;
};

type DiscoveryError = {
  service?: string;
  stage?: string;
  status?: number;
  error: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return j({ error: "SAP discovery service unavailable" }, 503, cors);
  const svc = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const connectorId = typeof body.connector_id === "string" ? body.connector_id : undefined;
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
    if (!cfg.base_url || !cfg.auth || !cfg.services?.length) {
      return j({ error: "config must include base_url, auth, services[]" }, 412, cors);
    }

    const gate = await shouldAllow(svc, orgId, connectorId);
    if (!gate.allow) return j({ skipped: true, reason: gate.reason }, 200, cors);

    const t0 = Date.now();
    let headers: Record<string, string>;
    try {
      headers = await buildSapAuthHeaders(cfg.auth);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordFailure(svc, connectorId, msg);
      return j({ error: msg }, 412, cors);
    }

    const { data: priorRows, error: priorError } = await svc.from("sap_object_schemas")
      .select("service_name,entity_set,entity_type,key_fields,fields,navigation_properties")
      .eq("connector_id", connectorId);
    if (priorError) throw new Error(`Failed to load prior SAP schema snapshot: ${priorError.message}`);

    const prior = (priorRows ?? []) as PriorSchema[];
    const priorMap = new Map<string, PriorSchema>();
    for (const row of prior) priorMap.set(`${row.service_name}::${row.entity_set}`, row);

    const discovered: Record<string, unknown>[] = [];
    const driftAlerts: Record<string, unknown>[] = [];
    const errors: DiscoveryError[] = [];
    const seenKeys = new Set<string>();
    let successfulServices = 0;

    for (const service of cfg.services) {
      const url = buildMetadataUrl(cfg.base_url, version, service);
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
        if (!res.ok) {
          errors.push({ service, status: res.status, error: (await res.text()).slice(0, 200) });
          continue;
        }
        const xml = await res.text();
        const types = parseMetadataXml(xml);
        successfulServices++;

        for (const type of types) {
          for (const setName of type.entity_sets) {
            const key = `${service}::${setName}`;
            seenKeys.add(key);
            const row = {
              organization_id: orgId,
              connector_id: connectorId,
              service_name: service,
              entity_set: setName,
              entity_type: type.entity_type,
              odata_version: version,
              is_custom: /^(Y|Z)/.test(type.entity_type) || /^(Y|Z)/.test(setName),
              key_fields: type.key_fields,
              fields: type.fields,
              navigation_properties: type.navigation_properties,
              last_discovered_at: new Date().toISOString(),
            };
            discovered.push(row);

            const before = priorMap.get(key);
            if (!before) {
              driftAlerts.push({
                organization_id: orgId,
                connector_id: connectorId,
                service_name: service,
                entity_set: setName,
                entity_type: type.entity_type,
                drift_type: "entity_new",
                severity: "info",
                after_value: { entity_type: type.entity_type, fields_count: type.fields.length },
                operational_impact: "New entity discovered; available for canonical mapping.",
              });
              continue;
            }

            const beforeFields = new Map<string, Record<string, unknown>>(
              (before.fields ?? []).flatMap((field) => typeof field.name === "string" ? [[field.name, field]] : []),
            );
            const afterFields = new Map<string, Record<string, unknown>>(
              type.fields.flatMap((field: Record<string, unknown>) => typeof field.name === "string" ? [[field.name, field]] : []),
            );

            for (const [fieldName, fieldMeta] of afterFields) {
              if (!beforeFields.has(fieldName)) {
                driftAlerts.push({
                  organization_id: orgId,
                  connector_id: connectorId,
                  service_name: service,
                  entity_set: setName,
                  entity_type: type.entity_type,
                  drift_type: "field_added",
                  severity: "info",
                  field_name: fieldName,
                  after_value: fieldMeta,
                  operational_impact: "New field available; extend mapping to capture.",
                });
              } else if (JSON.stringify(beforeFields.get(fieldName)?.type) !== JSON.stringify(fieldMeta.type)) {
                driftAlerts.push({
                  organization_id: orgId,
                  connector_id: connectorId,
                  service_name: service,
                  entity_set: setName,
                  entity_type: type.entity_type,
                  drift_type: "field_type_changed",
                  severity: "critical",
                  field_name: fieldName,
                  before_value: beforeFields.get(fieldName),
                  after_value: fieldMeta,
                  operational_impact: "Field type changed; downstream parsers may fail.",
                });
              }
            }

            for (const fieldName of beforeFields.keys()) {
              if (!afterFields.has(fieldName)) {
                driftAlerts.push({
                  organization_id: orgId,
                  connector_id: connectorId,
                  service_name: service,
                  entity_set: setName,
                  entity_type: type.entity_type,
                  drift_type: "field_removed",
                  severity: "critical",
                  field_name: fieldName,
                  before_value: beforeFields.get(fieldName),
                  operational_impact: "Field removed upstream; mappings referencing it will break.",
                });
              }
            }

            if (JSON.stringify(before.key_fields ?? []) !== JSON.stringify(type.key_fields)) {
              driftAlerts.push({
                organization_id: orgId,
                connector_id: connectorId,
                service_name: service,
                entity_set: setName,
                entity_type: type.entity_type,
                drift_type: "key_changed",
                severity: "critical",
                before_value: before.key_fields,
                after_value: type.key_fields,
                operational_impact: "Entity key changed; external_id continuity at risk.",
              });
            }

            const beforeNav = new Set<string>(
              (before.navigation_properties ?? []).flatMap((nav) => typeof nav.name === "string" ? [nav.name] : []),
            );
            const afterNav = new Set<string>(
              type.navigation_properties.flatMap((nav: Record<string, unknown>) => typeof nav.name === "string" ? [nav.name] : []),
            );
            for (const name of afterNav) {
              if (!beforeNav.has(name)) driftAlerts.push({
                organization_id: orgId,
                connector_id: connectorId,
                service_name: service,
                entity_set: setName,
                entity_type: type.entity_type,
                drift_type: "nav_property_added",
                severity: "info",
                field_name: name,
              });
            }
            for (const name of beforeNav) {
              if (!afterNav.has(name)) driftAlerts.push({
                organization_id: orgId,
                connector_id: connectorId,
                service_name: service,
                entity_set: setName,
                entity_type: before.entity_type,
                drift_type: "nav_property_removed",
                severity: "warning",
                field_name: name,
                operational_impact: "Relationship traversal removed; relationship mappings may break.",
              });
            }
          }
        }
      } catch (e) {
        errors.push({ service, error: e instanceof Error ? e.message : String(e) });
      }
    }

    for (const [key, before] of priorMap) {
      if (!seenKeys.has(key) && cfg.services.includes(before.service_name)) {
        driftAlerts.push({
          organization_id: orgId,
          connector_id: connectorId,
          service_name: before.service_name,
          entity_set: before.entity_set,
          entity_type: before.entity_type,
          drift_type: "entity_missing",
          severity: "critical",
          before_value: { entity_type: before.entity_type },
          operational_impact: "Entity set no longer exposed by SAP service; pulls will fail.",
        });
      }
    }

    if (discovered.length > 0) {
      const { error } = await svc.from("sap_object_schemas").upsert(discovered, {
        onConflict: "connector_id,service_name,entity_set",
        ignoreDuplicates: false,
      });
      if (error) errors.push({ stage: "schema_upsert", error: error.message });
    }
    if (driftAlerts.length > 0) {
      const { error } = await svc.from("sap_schema_drift_alerts").insert(driftAlerts);
      if (error) errors.push({ stage: "drift_insert", error: error.message });
    }

    const persistenceFailed = errors.some((error) => error.stage === "schema_upsert" || error.stage === "drift_insert");
    const totalFailure = successfulServices === 0 || persistenceFailed;
    const partial = !totalFailure && errors.length > 0;

    if (totalFailure) {
      await recordFailure(svc, connectorId, errors[0]?.error ?? "SAP discovery failed");
    } else {
      await recordSuccess(svc, connectorId);
    }

    logConnectorEvent({
      connector_type: "sap_odata",
      connector_id: connectorId,
      organization_id: orgId,
      phase: totalFailure ? "error" : "complete",
      rows_inserted: persistenceFailed ? 0 : discovered.length,
      duration_ms: Date.now() - t0,
    });

    return j({
      success: !totalFailure,
      status: totalFailure ? "failed" : partial ? "partial" : "completed",
      discovered: persistenceFailed ? 0 : discovered.length,
      drift_alerts: persistenceFailed ? 0 : driftAlerts.length,
      services: cfg.services.length,
      successful_services: successfulServices,
      errors,
    }, totalFailure ? 502 : 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("connector-sap-discover error:", msg);
    return j({ error: msg }, 500, cors);
  }
});

function j(b: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
