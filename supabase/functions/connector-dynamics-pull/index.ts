// @ts-nocheck
/**
 * connector-dynamics-pull
 *
 * Microsoft Dynamics 365 Sales connector.
 * Authentication: Azure AD client credentials (service-to-service OAuth 2.0).
 *
 * Objects synced via Dataverse Web API:
 *   - opportunities (pipeline, closed won revenue)
 *   - accounts (customer count)
 *
 * NOT YET IMPLEMENTED (tracked as follow-up): leads, systemusers (owner
 * resolution). Do not assume these are synced until the corresponding
 * dynamicsGet() calls are actually added below.
 *
 * Canonical metrics:
 *   revenue (closed won), pipeline_value, opportunities, customers
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

function j(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

async function getAzureADToken(tenantId: string, clientId: string, clientSecret: string, resource: string): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: `${resource}/.default`,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Azure AD token error [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function dynamicsGet(
  instanceUrl: string,
  path: string,
  token: string,
): Promise<{ data: any; error?: string }> {
  const base = instanceUrl.replace(/\/$/, "");
  const url = `${base}/api/data/v9.2${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      Prefer: "odata.maxpagesize=1000",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { data: null, error: `Dynamics ${res.status}: ${txt.slice(0, 300)}` };
  }
  return { data: await res.json() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const { connector_id } = await req.json().catch(() => ({}));
    if (!connector_id) return j({ error: "connector_id required" }, 400, req);

    const { data: connector, error: cErr } = await svc
      .from("data_connectors").select("*").eq("id", connector_id).single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, req);

    const orgId = connector.organization_id;

    // Auth guard: this function writes directly to the metrics table using the
    // service role key, bypassing RLS. Without this check, anyone who learns or
    // guesses a connector_id could trigger a sync and have arbitrary Dynamics
    // data written into another org's metrics. Allows either the scheduler's
    // cron secret or a verified user who is a member of the connector's org.
    const guard = await requireCronOrOrgMember(req, orgId);
    if (!guard.ok) return guard.response;

    const creds = await resolveConnectorCredentials(svc, connector_id);
    const { tenantId, clientId, clientSecret, instanceUrl } = creds as Record<string, string>;

    if (!tenantId || !clientId || !clientSecret || !instanceUrl) {
      return j({ error: "Dynamics credentials incomplete: tenantId, clientId, clientSecret, instanceUrl required" }, 412, req);
    }

    const errors: string[] = [];
    const metrics: any[] = [];
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];

    const baseFields = {
      organization_id: orgId,
      dataset_id: connector.dataset_id ?? null,
      source_type: "connector",
      source_id: connector.data_source_id ?? connector_id,
      quality_score: 88,
      region: "",
      segment: "",
    };

    // Get Azure AD token for Dynamics resource
    let token: string;
    try {
      const resource = instanceUrl.replace(/\/$/, "");
      token = await getAzureADToken(tenantId, clientId, clientSecret, resource);
    } catch (e) {
      return j({ error: `Authentication failed: ${e instanceof Error ? e.message : String(e)}` }, 401, req);
    }

    // Opportunities — pipeline value and closed-won revenue
    const oppRes = await dynamicsGet(
      instanceUrl,
      `/opportunities?$select=name,estimatedvalue,actualvalue,statecode,statuscode,createdon,actualclosedate&$filter=createdon ge ${sixMonthsAgo}&$orderby=createdon desc&$top=5000`,
      token,
    );
    if (oppRes.error) errors.push(`Opportunities: ${oppRes.error}`);
    else if (oppRes.data?.value) {
      const pipelineByMonth: Record<string, number> = {};
      const wonByMonth: Record<string, number> = {};
      const oppCountByMonth: Record<string, number> = {};

      for (const opp of (oppRes.data.value as any[])) {
        const d = new Date(opp.createdon);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

        pipelineByMonth[key] = (pipelineByMonth[key] || 0) + (opp.estimatedvalue || 0);
        oppCountByMonth[key] = (oppCountByMonth[key] || 0) + 1;

        // statecode 1 = Won
        if (opp.statecode === 1 && opp.actualclosedate) {
          const cd = new Date(opp.actualclosedate);
          const cKey = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}-01`;
          wonByMonth[cKey] = (wonByMonth[cKey] || 0) + (opp.actualvalue || 0);
        }
      }
      for (const [date, val] of Object.entries(pipelineByMonth)) {
        metrics.push({ ...baseFields, metric_type: "pipeline_value", value: val, date });
        metrics.push({ ...baseFields, metric_type: "opportunities", value: oppCountByMonth[date] || 0, date });
      }
      for (const [date, val] of Object.entries(wonByMonth)) {
        metrics.push({ ...baseFields, metric_type: "revenue", value: val, date });
      }
    }

    // Accounts (customers)
    const accRes = await dynamicsGet(
      instanceUrl,
      `/accounts?$select=name,createdon&$filter=createdon ge ${sixMonthsAgo}&$top=2000`,
      token,
    );
    if (accRes.error) errors.push(`Accounts: ${accRes.error}`);
    else if (accRes.data?.value) {
      const byMonth: Record<string, number> = {};
      for (const acc of (accRes.data.value as any[])) {
        const d = new Date(acc.createdon);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }
      for (const [date, val] of Object.entries(byMonth)) {
        metrics.push({ ...baseFields, metric_type: "customers", value: val, date });
      }
    }

    if (metrics.length > 0) {
      const { error: uErr } = await svc.from("metrics").upsert(metrics, {
        onConflict: "organization_id,metric_type,date,region,segment,source_id",
        ignoreDuplicates: false,
      });
      if (uErr) errors.push(`DB upsert: ${uErr.message}`);
    }

    await svc.from("data_connectors").update({
      status: errors.length === 0 ? "active" : "error",
      last_synced_at: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq("id", connector_id);

    return j({ success: true, records: metrics.length, errors }, 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return j({ error: msg }, 500, req);
  }
});
