// @ts-nocheck
/**
 * Salesforce schema discovery — populates `salesforce_object_schemas`.
 * One call per object via /sobjects/{Object}/describe — cached for 24h unless ?force=true.
 *
 * Input: { connector_id, objects?: string[] (default core CRM set), force?: boolean }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { getSalesforceTokens } from "../_shared/salesforce-auth.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";

const API_VERSION = "v60.0";
const VENDOR = "salesforce";
const CACHE_HOURS = 24;
const DEFAULT_OBJECTS = ["Account", "Contact", "Opportunity", "OpportunityStage", "OpportunityLineItem",
                         "Case", "Task", "Event", "User", "ForecastingItem"];

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const { connector_id, objects, force } = await req.json().catch(() => ({}));
    if (!connector_id) return json({ error: "connector_id required" }, 400, cors);

    const { data: connector } = await svc.from("data_connectors").select("organization_id").eq("id", connector_id).single();
    if (!connector) return json({ error: "connector not found" }, 404, cors);

    const tokens = await getSalesforceTokens(svc, { orgId: connector.organization_id, connectorId: connector_id });
    const targetObjects: string[] = Array.isArray(objects) && objects.length ? objects : DEFAULT_OBJECTS;

    const discovered: any[] = [];
    const skipped: string[] = [];
    for (const obj of targetObjects) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(obj)) { skipped.push(obj); continue; }

      if (!force) {
        const { data: cached } = await svc.from("salesforce_object_schemas")
          .select("last_discovered_at").eq("connector_id", connector_id).eq("object_name", obj).maybeSingle();
        if (cached && (Date.now() - new Date(cached.last_discovered_at).getTime()) < CACHE_HOURS * 3600_000) {
          skipped.push(`${obj}(cached)`); continue;
        }
      }

      await preflightWait(svc, connector.organization_id, connector_id, VENDOR);
      const res = await fetch(`${tokens.instance_url}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(obj)}/describe`, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      await observeResponse(svc, { orgId: connector.organization_id, connectorId: connector_id, vendor: VENDOR, res });
      if (!res.ok) {
        logConnectorEvent({ connector_type: "salesforce", connector_id, organization_id: connector.organization_id, phase: "error", error: `describe ${obj} ${res.status}` });
        skipped.push(`${obj}(http_${res.status})`); continue;
      }
      const body: any = await res.json();
      const fields = (body.fields ?? []).map((f: any) => ({
        name: f.name, type: f.type, nillable: f.nillable, length: f.length, custom: f.custom,
        referenceTo: f.referenceTo ?? [], relationshipName: f.relationshipName ?? null,
      }));
      const relationships = (body.childRelationships ?? []).map((r: any) => ({
        relationshipName: r.relationshipName, childSObject: r.childSObject, field: r.field, cascadeDelete: r.cascadeDelete,
      }));

      await svc.from("salesforce_object_schemas").upsert({
        organization_id: connector.organization_id,
        connector_id,
        object_name: obj,
        api_version: API_VERSION,
        is_custom: !!body.custom,
        fields, relationships,
        last_discovered_at: new Date().toISOString(),
      }, { onConflict: "connector_id,object_name" });

      discovered.push({ object_name: obj, field_count: fields.length, relationship_count: relationships.length });
    }

    logConnectorEvent({ connector_type: "salesforce", connector_id, organization_id: connector.organization_id, phase: "complete", reason: "discover", rows_inserted: discovered.length });
    return json({ success: true, api_version: API_VERSION, discovered, skipped }, 200, cors);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500, cors);
  }
});

function json(body: any, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
