/**
 * connector-dynamics-pull
 * Microsoft Dynamics 365 Sales connector using Azure AD client credentials.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
const BATCH_SIZE = 500;

type MetricRow = {
  organization_id: string;
  dataset_id: string | null;
  source_type: string;
  source_id: string;
  quality_score: number;
  region: string;
  segment: string;
  metric_type: string;
  value: number;
  date: string;
};

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
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Azure AD token response missing access_token");
  return data.access_token;
}

async function dynamicsGet(
  instanceUrl: string,
  path: string,
  token: string,
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  const base = instanceUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/data/v9.2${path}`, {
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
  return { data: await res.json() as Record<string, unknown> };
}

function metricIdentity(row: MetricRow): string {
  return [
    row.organization_id,
    row.dataset_id ?? "",
    row.metric_type.trim().toLowerCase(),
    row.date,
    row.region.trim(),
    row.segment.trim(),
    row.source_id,
  ].join("\u001f");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return j({ error: "Connector service unavailable" }, 503, req);
  const svc = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    const payload = await req.json().catch(() => ({})) as { connector_id?: string };
    const connectorId = payload.connector_id;
    if (!connectorId) return j({ error: "connector_id required" }, 400, req);

    const { data: connector, error: cErr } = await svc
      .from("data_connectors")
      .select("id,organization_id,dataset_id,data_source_id,config,status")
      .eq("id", connectorId)
      .single();
    if (cErr || !connector) return j({ error: "connector not found" }, 404, req);

    const orgId = connector.organization_id as string;
    const guard = await requireCronOrOrgMember(req, orgId);
    if (!guard.ok) return guard.response;

    let datasetId: string | null = connector.dataset_id ?? null;
    if (datasetId) {
      const { data: ownedDataset, error: datasetError } = await svc
        .from("datasets")
        .select("id")
        .eq("id", datasetId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (datasetError) return j({ error: "Dataset scope validation failed" }, 500, req);
      if (!ownedDataset?.id) return j({ error: "Connector dataset does not belong to this organization" }, 400, req);
      datasetId = ownedDataset.id;
    }

    const creds = await resolveConnectorCredentials(svc, connectorId) as Record<string, string | undefined>;
    const tenantId = creds.tenantId ?? creds.tenant_id;
    const clientId = creds.clientId ?? creds.client_id;
    const clientSecret = creds.clientSecret ?? creds.client_secret;
    const instanceUrl = creds.instanceUrl ?? creds.instance_url;
    if (!tenantId || !clientId || !clientSecret || !instanceUrl) {
      return j({ error: "Dynamics credentials incomplete: tenantId, clientId, clientSecret, instanceUrl required" }, 412, req);
    }

    let token: string;
    try {
      token = await getAzureADToken(tenantId, clientId, clientSecret, instanceUrl.replace(/\/$/, ""));
    } catch (e) {
      return j({ error: `Authentication failed: ${e instanceof Error ? e.message : String(e)}` }, 401, req);
    }

    const errors: string[] = [];
    const candidates: MetricRow[] = [];
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0];
    const baseFields = {
      organization_id: orgId,
      dataset_id: datasetId,
      source_type: "connector",
      source_id: (connector.data_source_id ?? connectorId) as string,
      quality_score: 88,
      region: "",
      segment: "",
    };

    const oppRes = await dynamicsGet(
      instanceUrl,
      `/opportunities?$select=name,estimatedvalue,actualvalue,statecode,statuscode,createdon,actualclosedate&$filter=createdon ge ${sixMonthsAgo}&$orderby=createdon desc&$top=5000`,
      token,
    );
    if (oppRes.error) errors.push(`Opportunities: ${oppRes.error}`);
    else if (Array.isArray(oppRes.data?.value)) {
      const pipelineByMonth: Record<string, number> = {};
      const wonByMonth: Record<string, number> = {};
      const oppCountByMonth: Record<string, number> = {};
      for (const raw of oppRes.data.value) {
        const opp = raw as Record<string, unknown>;
        const d = new Date(String(opp.createdon ?? ""));
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        pipelineByMonth[key] = (pipelineByMonth[key] || 0) + Number(opp.estimatedvalue ?? 0);
        oppCountByMonth[key] = (oppCountByMonth[key] || 0) + 1;
        if (Number(opp.statecode) === 1 && opp.actualclosedate) {
          const cd = new Date(String(opp.actualclosedate));
          if (!Number.isNaN(cd.getTime())) {
            const cKey = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, "0")}-01`;
            wonByMonth[cKey] = (wonByMonth[cKey] || 0) + Number(opp.actualvalue ?? 0);
          }
        }
      }
      for (const [date, value] of Object.entries(pipelineByMonth)) {
        candidates.push({ ...baseFields, metric_type: "pipeline_value", value, date });
        candidates.push({ ...baseFields, metric_type: "opportunities", value: oppCountByMonth[date] || 0, date });
      }
      for (const [date, value] of Object.entries(wonByMonth)) {
        candidates.push({ ...baseFields, metric_type: "revenue", value, date });
      }
    }

    const accRes = await dynamicsGet(
      instanceUrl,
      `/accounts?$select=name,createdon&$filter=createdon ge ${sixMonthsAgo}&$top=2000`,
      token,
    );
    if (accRes.error) errors.push(`Accounts: ${accRes.error}`);
    else if (Array.isArray(accRes.data?.value)) {
      const byMonth: Record<string, number> = {};
      for (const raw of accRes.data.value) {
        const acc = raw as Record<string, unknown>;
        const d = new Date(String(acc.createdon ?? ""));
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }
      for (const [date, value] of Object.entries(byMonth)) {
        candidates.push({ ...baseFields, metric_type: "customers", value, date });
      }
    }

    const deduped = new Map<string, MetricRow>();
    for (const row of candidates) deduped.set(metricIdentity(row), row);
    const metrics = Array.from(deduped.values());
    let persisted = 0;

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      const { error } = await svc.from("metrics").upsert(batch, {
        onConflict: METRIC_CONFLICT_KEY,
        ignoreDuplicates: false,
      });
      if (!error) {
        persisted += batch.length;
        continue;
      }
      for (const row of batch) {
        const { error: rowError } = await svc.from("metrics").upsert(row, { onConflict: METRIC_CONFLICT_KEY });
        if (rowError) errors.push(`DB upsert: ${rowError.message}`);
        else persisted++;
      }
    }

    const status = persisted === 0 && candidates.length > 0
      ? "error"
      : errors.length > 0
        ? "partial"
        : "active";
    const patch: Record<string, unknown> = { status, updated_at: now.toISOString() };
    if (persisted > 0) patch.last_synced_at = now.toISOString();
    const { error: stateError } = await svc
      .from("data_connectors")
      .update(patch)
      .eq("id", connectorId)
      .eq("organization_id", orgId);
    if (stateError) errors.push(`Connector state update: ${stateError.message}`);

    const success = persisted > 0 || (candidates.length === 0 && errors.length === 0);
    return j({
      success,
      status,
      records: persisted,
      generated_records: candidates.length,
      unique_records: metrics.length,
      duplicates_collapsed: candidates.length - metrics.length,
      errors,
    }, !success && candidates.length > 0 ? 500 : 200, req);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return j({ error: msg }, 500, req);
  }
});
