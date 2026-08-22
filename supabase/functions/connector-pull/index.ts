import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { authorizeConnectorInvocation } from "../_shared/connector-invocation-auth.ts";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import {
  assertDispatchIdentityMatches,
  deriveStoredConnectorIdentity,
  parseConnectorDispatchRequest,
} from "../_shared/connector-dispatch-guard.ts";
import {
  runInlineConnectorPull,
  type InlineConnectorConfig,
  type InlineConnectorResult,
} from "../_shared/inline-connector-pull.ts";

const DELEGATED_CONNECTORS: Record<string, string> = {
  snowflake: "connector-snowflake-pull",
  bigquery: "connector-bigquery-pull",
  s3: "connector-s3-pull",
  hubspot: "connector-hubspot-pull",
  salesforce: "connector-salesforce-pull",
  sap_odata: "connector-sap-pull",
  sap: "connector-sap-pull",
  netsuite: "connector-netsuite-pull",
  dynamics: "connector-dynamics-pull",
  googlesheets: "connector-sheets-pull",
  google_sheets: "connector-sheets-pull",
};

function responseJson(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function sanitizeErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((entry) => {
    if (typeof entry === "string") return entry.slice(0, 300);
    if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      if (typeof record.reason === "string") return record.reason.slice(0, 300);
      if (typeof record.error === "string") return record.error.slice(0, 300);
      if (typeof record.message === "string") return record.message.slice(0, 300);
    }
    return "delegated connector error";
  });
}

function nonNegativeCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function runDelegatedConnector(
  supabaseUrl: string,
  serviceKey: string,
  functionName: string,
  connectorId: string,
): Promise<InlineConnectorResult> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ connector_id: connectorId }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (error) {
    return {
      records: 0,
      errors: [`Delegated connector invocation failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const rawBody: unknown = await response.json().catch(() => null);
  const body = rawBody && typeof rawBody === "object" ? rawBody as Record<string, unknown> : {};
  const records = nonNegativeCount(body.rows_inserted ?? body.records);
  const sampleErrors = sanitizeErrors(body.sample_errors ?? body.errors);
  const explicitError = typeof body.error === "string" ? body.error.slice(0, 300) : null;
  const explicitlyFailed = body.success === false;

  if (!response.ok || explicitlyFailed || explicitError) {
    return {
      records,
      errors: [explicitError ?? `Connector sync failed (${response.status})`, ...sampleErrors],
    };
  }

  return { records, errors: sampleErrors };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceKey || !supabaseUrl) {
      return responseJson({ error: "Connector dispatcher unavailable" }, 503, corsHeaders);
    }

    let dispatchRequest;
    try {
      dispatchRequest = parseConnectorDispatchRequest(await req.json().catch(() => null));
    } catch (error) {
      return responseJson({ error: error instanceof Error ? error.message : String(error) }, 400, corsHeaders);
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: storedConnector, error: connectorError } = await serviceClient
      .from("data_connectors")
      .select("id,organization_id,connector_type,config,data_source_id")
      .eq("id", dispatchRequest.connectorId)
      .single();
    if (connectorError || !storedConnector) {
      return responseJson({ error: "Connector not found" }, 404, corsHeaders);
    }

    let identity;
    try {
      identity = deriveStoredConnectorIdentity(storedConnector);
      assertDispatchIdentityMatches(dispatchRequest, identity);
    } catch (error) {
      return responseJson(
        { error: error instanceof Error ? error.message : "Connector identity invalid" },
        400,
        corsHeaders,
      );
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const userClient = anonKey
      ? createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader ?? "" } } })
      : null;
    const invocation = await authorizeConnectorInvocation({
      authHeader,
      serviceRoleKey: serviceKey,
      organizationId: identity.organizationId,
      userClient,
      membershipClient: serviceClient,
    });
    if (!invocation.allowed) {
      return responseJson(
        { error: invocation.reason === "forbidden" ? "Forbidden" : "Unauthorized" },
        invocation.status,
        corsHeaders,
      );
    }

    if (!identity.dataSourceId) {
      return responseJson({ error: "Connector is not linked to a data source" }, 409, corsHeaders);
    }

    const config: InlineConnectorConfig = {
      connector_id: identity.id,
      connector_type: identity.connectorType,
      data_source_id: identity.dataSourceId,
      organization_id: identity.organizationId,
      ...(dispatchRequest.datasetId ? { dataset_id: dispatchRequest.datasetId } : {}),
      ...(dispatchRequest.dateFrom ? { date_from: dispatchRequest.dateFrom } : {}),
      ...(dispatchRequest.dateTo ? { date_to: dispatchRequest.dateTo } : {}),
    };

    const { data: job, error: jobError } = await serviceClient
      .from("data_sync_jobs")
      .insert({
        data_source_id: identity.dataSourceId,
        organization_id: identity.organizationId,
        status: "running",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (jobError || !job?.id) {
      return responseJson({ error: "Unable to create connector sync job" }, 503, corsHeaders);
    }

    let result: InlineConnectorResult;
    const delegatedFunction = DELEGATED_CONNECTORS[identity.connectorType];

    if (delegatedFunction) {
      result = await runDelegatedConnector(
        supabaseUrl,
        serviceKey,
        delegatedFunction,
        identity.id,
      );
    } else {
      const credentials = await resolveConnectorCredentials(serviceClient, identity.id);
      result = await runInlineConnectorPull(
        identity.connectorType,
        config,
        serviceClient,
        credentials,
      );
    }

    const finalStatus = result.errors.length > 0 && result.records === 0
      ? "failed"
      : result.errors.length > 0
        ? "partial"
        : "completed";

    const { error: jobUpdateError } = await serviceClient
      .from("data_sync_jobs")
      .update({
        status: finalStatus,
        records_synced: result.records,
        error_message: result.errors.length > 0 ? result.errors.join("; ").slice(0, 2_000) : null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("organization_id", identity.organizationId);
    if (jobUpdateError) {
      return responseJson({ error: "Connector finished but sync bookkeeping failed" }, 503, corsHeaders);
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
      organization_id: identity.organizationId,
      actor_type: invocation.actor === "service_role" ? "system" : "user",
      actor_id: invocation.userId,
      action_type: "connector_pull",
      resource_type: "data_connector",
      resource_id: identity.id,
      payload: {
        connector_type: identity.connectorType,
        data_source_id: identity.dataSourceId,
        records: result.records,
        errors: result.errors.length,
        status: finalStatus,
        dataset_id: config.dataset_id ?? null,
      },
    });
    if (auditError) {
      return responseJson({ error: "Connector finished but audit logging failed" }, 503, corsHeaders);
    }

    return responseJson(
      { success: finalStatus !== "failed", status: finalStatus, ...result },
      finalStatus === "failed" ? 502 : 200,
      corsHeaders,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("connector-pull error:", message);
    return responseJson({ error: "Connector dispatcher failed" }, 500, corsHeaders);
  }
});
