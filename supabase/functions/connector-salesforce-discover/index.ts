/**
 * Salesforce schema discovery — populates `salesforce_object_schemas`.
 * One call per object via /sobjects/{Object}/describe — cached for 24h unless force=true.
 *
 * Input: { connector_id, objects?: string[] (default core CRM set), force?: boolean }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsPreflightResponse, getCorsHeaders } from "../_shared/cors.ts";
import { getSalesforceTokens } from "../_shared/salesforce-auth.ts";
import { preflightWait, observeResponse } from "../_shared/connector-throttle.ts";
import { logConnectorEvent } from "../_shared/warehouse-config.ts";
import {
  normalizeSalesforceDiscoveryObjects,
  parseSalesforceDescribe,
} from "../_shared/salesforce-discovery.ts";

const API_VERSION = "v60.0";
const VENDOR = "salesforce";
const CACHE_HOURS = 24;
const MAX_DISCOVERY_OBJECTS = 100;
const DESCRIBE_TIMEOUT_MS = 30_000;
const DEFAULT_OBJECTS = [
  "Account",
  "Contact",
  "Opportunity",
  "OpportunityStage",
  "OpportunityLineItem",
  "Case",
  "Task",
  "Event",
  "User",
  "ForecastingItem",
] as const;

type DiscoverySummary = {
  object_name: string;
  field_count: number;
  relationship_count: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const cors = getCorsHeaders(req);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return json({ error: "Salesforce discovery service unavailable" }, 503, cors);
  }
  const svc = createClient(supabaseUrl, serviceKey);

  try {
    const requestBody: unknown = await req.json().catch(() => null);
    if (!isRecord(requestBody)) return json({ error: "valid JSON object required" }, 400, cors);

    const connectorId = typeof requestBody.connector_id === "string"
      ? requestBody.connector_id.trim()
      : "";
    if (!connectorId) return json({ error: "connector_id required" }, 400, cors);
    if (requestBody.force !== undefined && typeof requestBody.force !== "boolean") {
      return json({ error: "force must be boolean" }, 400, cors);
    }
    const force = requestBody.force === true;

    let targets;
    try {
      targets = normalizeSalesforceDiscoveryObjects(
        requestBody.objects,
        DEFAULT_OBJECTS,
        MAX_DISCOVERY_OBJECTS,
      );
    } catch (error: unknown) {
      return json({ error: error instanceof Error ? error.message : String(error) }, 400, cors);
    }

    const { data: connector, error: connectorError } = await svc
      .from("data_connectors")
      .select("organization_id")
      .eq("id", connectorId)
      .single();
    if (connectorError || !connector || typeof connector.organization_id !== "string") {
      return json({ error: "connector not found" }, 404, cors);
    }
    const organizationId = connector.organization_id;

    const tokens = await getSalesforceTokens(svc, {
      orgId: organizationId,
      connectorId,
    });

    const discovered: DiscoverySummary[] = [];
    const skipped: string[] = [...targets.skipped];

    for (const objectName of targets.objects) {
      if (!force) {
        const { data: cached, error: cacheError } = await svc
          .from("salesforce_object_schemas")
          .select("last_discovered_at")
          .eq("connector_id", connectorId)
          .eq("organization_id", organizationId)
          .eq("object_name", objectName)
          .maybeSingle();
        if (cacheError) throw new Error(`unable to read Salesforce schema cache: ${cacheError.message}`);

        const cachedAt = cached && typeof cached.last_discovered_at === "string"
          ? Date.parse(cached.last_discovered_at)
          : Number.NaN;
        if (Number.isFinite(cachedAt) && Date.now() - cachedAt < CACHE_HOURS * 3_600_000) {
          skipped.push(`${objectName}(cached)`);
          continue;
        }
      }

      await preflightWait(svc, organizationId, connectorId, VENDOR);
      const response = await fetch(
        `${tokens.instance_url}/services/data/${API_VERSION}/sobjects/${encodeURIComponent(objectName)}/describe`,
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          signal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS),
        },
      );
      await observeResponse(svc, {
        orgId: organizationId,
        connectorId,
        vendor: VENDOR,
        res: response,
      });

      if (!response.ok) {
        logConnectorEvent({
          connector_type: "salesforce",
          connector_id: connectorId,
          organization_id: organizationId,
          phase: "error",
          error: `describe ${objectName} ${response.status}`,
        });
        skipped.push(`${objectName}(http_${response.status})`);
        continue;
      }

      const rawDescribe: unknown = await response.json().catch(() => null);
      const describe = parseSalesforceDescribe(rawDescribe);

      const { error: persistError } = await svc.from("salesforce_object_schemas").upsert({
        organization_id: organizationId,
        connector_id: connectorId,
        object_name: objectName,
        api_version: API_VERSION,
        is_custom: describe.custom,
        fields: describe.fields,
        relationships: describe.relationships,
        last_discovered_at: new Date().toISOString(),
      }, { onConflict: "connector_id,object_name" });
      if (persistError) {
        throw new Error(`unable to persist Salesforce schema for ${objectName}: ${persistError.message}`);
      }

      discovered.push({
        object_name: objectName,
        field_count: describe.fields.length,
        relationship_count: describe.relationships.length,
      });
    }

    logConnectorEvent({
      connector_type: "salesforce",
      connector_id: connectorId,
      organization_id: organizationId,
      phase: "complete",
      reason: "discover",
      rows_inserted: discovered.length,
    });
    return json({ success: true, api_version: API_VERSION, discovered, skipped }, 200, cors);
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500, cors);
  }
});
