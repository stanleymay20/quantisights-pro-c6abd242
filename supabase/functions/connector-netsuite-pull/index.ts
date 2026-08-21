/**
 * connector-netsuite-pull
 * NetSuite REST API connector using Token-Based Authentication (OAuth 1.0a).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveConnectorCredentials } from "../_shared/connector-credentials.ts";
import { requireCronOrOrgMember } from "../_shared/cron-or-user.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const METRIC_CONFLICT_KEY = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
const BATCH_SIZE = 500;

type NetSuiteCredentials = {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
};

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

async function buildNetSuiteOAuthHeader(params: {
  method: string;
  url: string;
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}): Promise<string> {
  const { method, url, accountId, consumerKey, consumerSecret, tokenId, tokenSecret } = params;
  const nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA256",
    oauth_timestamp: timestamp,
    oauth_token: tokenId,
    oauth_version: "1.0",
  };
  const sortedParams = Object.entries(oauthParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(signatureBase),
  );
  oauthParams.oauth_signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
  const headerValue = Object.entries(oauthParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");
  return `OAuth realm="${accountId.toUpperCase()}", ${headerValue}`;
}

async function netsuiteGet(
  path: string,
  credentials: NetSuiteCredentials,
): Promise<{ data: Record<string, unknown> | null; ok: boolean; status: number; error?: string }> {
  const accountNorm = credentials.accountId.replace("_", "-").toLowerCase();
  const baseUrl = `https://${accountNorm}.suitetalk.api.netsuite.com/services/rest/record/v1`;
  const url = `${baseUrl}${path}`;
  const authHeader = await buildNetSuiteOAuthHeader({ method: "GET", url, ...credentials });
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Prefer: "transient",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    return { data: null, ok: false, status: res.status, error: `NetSuite ${res.status}: ${txt.slice(0, 300)}` };
  }
  return { data: await res.json() as Record<string, unknown>, ok: true, status: res.status };
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
    const credentials: NetSuiteCredentials = {
      accountId: creds.accountId ?? creds.account_id ?? "",
      consumerKey: creds.consumerKey ?? creds.consumer_key ?? "",
      consumerSecret: creds.consumerSecret ?? creds.consumer_secret ?? "",
      tokenId: creds.tokenId ?? creds.token_id ?? "",
      tokenSecret: creds.tokenSecret ?? creds.token_secret ?? "",
    };
    if (Object.values(credentials).some((value) => !value)) {
      return j({ error: "NetSuite credentials incomplete. Required: accountId, consumerKey, consumerSecret, tokenId, tokenSecret" }, 412, req);
    }

    const errors: string[] = [];
    const candidates: MetricRow[] = [];
    const now = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const baseFields = {
      organization_id: orgId,
      dataset_id: datasetId,
      source_type: "connector",
      source_id: (connector.data_source_id ?? connectorId) as string,
      quality_score: 90,
      region: "",
      segment: "",
    };

    const incomeRes = await netsuiteGet(
      "/account?type=income&limit=200&fields=id,number,generalRate,accountType",
      credentials,
    );
    if (incomeRes.error) errors.push(incomeRes.error);
    else if (Array.isArray(incomeRes.data?.items)) {
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const totalRevenue = incomeRes.data.items.reduce((sum: number, raw) => {
        const account = raw as Record<string, unknown>;
        return sum + (Number.parseFloat(String(account.generalRate ?? "")) || 0);
      }, 0);
      if (totalRevenue > 0) candidates.push({ ...baseFields, metric_type: "revenue", value: totalRevenue, date: monthKey });
    }

    const ordersRes = await netsuiteGet(
      "/salesOrder?limit=200&fields=id,total,status,tranDate&orderBy=tranDate desc",
      credentials,
    );
    if (ordersRes.error) errors.push(ordersRes.error);
    else if (Array.isArray(ordersRes.data?.items)) {
      const ordersByMonth: Record<string, number> = {};
      const countByMonth: Record<string, number> = {};
      for (const raw of ordersRes.data.items) {
        const order = raw as Record<string, unknown>;
        const d = new Date(String(order.tranDate ?? now.toISOString()));
        if (Number.isNaN(d.getTime()) || d < fromDate) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        ordersByMonth[key] = (ordersByMonth[key] || 0) + (Number.parseFloat(String(order.total ?? "")) || 0);
        countByMonth[key] = (countByMonth[key] || 0) + 1;
      }
      for (const [date, value] of Object.entries(ordersByMonth)) {
        candidates.push({ ...baseFields, metric_type: "orders_value", value, date });
        candidates.push({ ...baseFields, metric_type: "orders", value: countByMonth[date] || 0, date });
      }
    }

    const custRes = await netsuiteGet(
      "/customer?limit=100&fields=id,dateCreated&orderBy=dateCreated desc",
      credentials,
    );
    if (custRes.error) errors.push(custRes.error);
    else if (Array.isArray(custRes.data?.items)) {
      const byMonth: Record<string, number> = {};
      for (const raw of custRes.data.items) {
        const customer = raw as Record<string, unknown>;
        const d = new Date(String(customer.dateCreated ?? now.toISOString()));
        if (Number.isNaN(d.getTime()) || d < fromDate) continue;
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
    const connectorPatch: Record<string, unknown> = { status, updated_at: now.toISOString() };
    if (persisted > 0) connectorPatch.last_synced_at = now.toISOString();
    const { error: connectorStateError } = await svc
      .from("data_connectors")
      .update(connectorPatch)
      .eq("id", connectorId)
      .eq("organization_id", orgId);
    if (connectorStateError) errors.push(`Connector state update: ${connectorStateError.message}`);

    if (connector.data_source_id && persisted > 0) {
      const { error: sourceStateError } = await svc
        .from("data_sources")
        .update({ last_synced_at: now.toISOString() })
        .eq("id", connector.data_source_id)
        .eq("organization_id", orgId);
      if (sourceStateError) errors.push(`Data source freshness update: ${sourceStateError.message}`);
    }

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
