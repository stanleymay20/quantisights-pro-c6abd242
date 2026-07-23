import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

interface ConnectorConfig {
  connector_type: string;
  data_source_id: string;
  organization_id: string;
  dataset_id?: string;
  date_from?: string;
  date_to?: string;
}

/* ──────────────────── STRIPE ──────────────────── */

async function stripeFetchAll(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ data: any[]; errors: string[] }> {
  const allData: any[] = [];
  const errors: string[] = [];
  let startingAfter: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const qs = new URLSearchParams({ ...params, limit: "100" });
    if (startingAfter) qs.set("starting_after", startingAfter);

    const res = await fetch(`https://api.stripe.com/v1/${endpoint}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      errors.push(`Stripe ${endpoint} HTTP ${res.status}: ${body.substring(0, 200)}`);
      break;
    }

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      errors.push(`Stripe ${endpoint}: unexpected response shape`);
      break;
    }

    allData.push(...json.data);
    hasMore = json.has_more === true;
    if (hasMore && json.data.length > 0) {
      startingAfter = json.data[json.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return { data: allData, errors };
}

async function pullStripe(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  // Vault credential first (per-org), fall back to global env var (dev/legacy)
  const STRIPE_KEY = creds.stripeApiKey ?? creds.apiKey ?? creds.api_key ?? Deno.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_KEY) return { records: 0, errors: ["Stripe API key not found. Enter your restricted API key in the Data Connectors page."] };

  const errors: string[] = [];
  const metrics: any[] = [];
  const now = new Date();
  const from = config.date_from ? new Date(config.date_from) : new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const to = config.date_to ? new Date(config.date_to) : now;

  const fromTs = Math.floor(from.getTime() / 1000).toString();
  const toTs = Math.floor(to.getTime() / 1000).toString();

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 95,
    region: "",
    segment: "",
  };

  try {
    // Charges → Revenue
    const chargesResult = await stripeFetchAll("charges", {
      "created[gte]": fromTs,
      "created[lte]": toTs,
    }, STRIPE_KEY);
    errors.push(...chargesResult.errors);

    if (chargesResult.data.length > 0) {
      const grossByMonth: Record<string, number> = {};
      const refundsByMonth: Record<string, number> = {};
      for (const c of chargesResult.data) {
        if (c.status !== "succeeded") continue;
        const d = new Date(c.created * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        grossByMonth[key] = (grossByMonth[key] || 0) + c.amount / 100;
        if (c.amount_refunded > 0) {
          refundsByMonth[key] = (refundsByMonth[key] || 0) + c.amount_refunded / 100;
        }
      }
      for (const [date, gross] of Object.entries(grossByMonth)) {
        const refunds = refundsByMonth[date] || 0;
        metrics.push(
          { ...baseMetricFields, metric_type: "revenue", value: gross - refunds, date },
          { ...baseMetricFields, metric_type: "gross_revenue", value: gross, date },
        );
        if (refunds > 0) {
          metrics.push({ ...baseMetricFields, metric_type: "refunds", value: refunds, date });
        }
      }
    }

    // Customers
    const custResult = await stripeFetchAll("customers", { "created[gte]": fromTs }, STRIPE_KEY);
    errors.push(...custResult.errors);

    if (custResult.data.length > 0) {
      const byMonth: Record<string, number> = {};
      for (const c of custResult.data) {
        const d = new Date(c.created * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        byMonth[key] = (byMonth[key] || 0) + 1;
      }
      for (const [date, value] of Object.entries(byMonth)) {
        metrics.push({ ...baseMetricFields, metric_type: "customers", value, date });
      }
    }

    // Subscriptions → MRR & Churn
    const subResult = await stripeFetchAll("subscriptions", { status: "all", "created[gte]": fromTs }, STRIPE_KEY);
    errors.push(...subResult.errors);

    if (subResult.data.length > 0) {
      const mrrByMonth: Record<string, number> = {};
      const churnByMonth: Record<string, number> = {};
      const activeByMonth: Record<string, number> = {};

      for (const s of subResult.data) {
        const created = new Date(s.created * 1000);
        const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-01`;

        if (s.status === "active" && s.items?.data?.[0]?.price) {
          const price = s.items.data[0].price;
          let monthly = (price.unit_amount || 0) / 100;
          if (price.recurring?.interval === "year") monthly /= 12;
          mrrByMonth[key] = (mrrByMonth[key] || 0) + monthly;
          activeByMonth[key] = (activeByMonth[key] || 0) + 1;
        }

        if (s.status === "canceled" && s.canceled_at) {
          const canceled = new Date(s.canceled_at * 1000);
          const cKey = `${canceled.getFullYear()}-${String(canceled.getMonth() + 1).padStart(2, "0")}-01`;
          churnByMonth[cKey] = (churnByMonth[cKey] || 0) + 1;
        }
      }

      for (const [date, value] of Object.entries(mrrByMonth)) {
        metrics.push({ ...baseMetricFields, metric_type: "mrr", value, date });
      }
      for (const [date, churned] of Object.entries(churnByMonth)) {
        const active = activeByMonth[date] || 1;
        const rate = (churned / (active + churned)) * 100;
        metrics.push({ ...baseMetricFields, metric_type: "churn_rate", value: Math.round(rate * 100) / 100, date });
      }
    }
  } catch (err: unknown) {
    errors.push(`Stripe fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);

  return { records: metrics.length, errors };
}

/* ──────────────────── GOOGLE ANALYTICS 4 ──────────────────── */

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const pemContent = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );

  const signatureInput = new TextEncoder().encode(`${header}.${claim}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, signatureInput);
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const jwt = `${header}.${claim}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    throw new Error(`Google token exchange failed [${tokenRes.status}]: ${body.substring(0, 300)}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function pullGA4(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  const saJson = creds.serviceAccountJson ?? creds.service_account_json ?? Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");
  const propertyId = creds.propertyId ?? creds.property_id ?? Deno.env.get("GA4_PROPERTY_ID");

  if (!saJson) return { records: 0, errors: ["GA4 Service Account JSON not found. Upload your service account JSON in the Data Connectors page."] };
  if (!propertyId) return { records: 0, errors: ["GA4 Property ID not configured."] };

  const errors: string[] = [];
  const metrics: any[] = [];

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 90,
    region: "",
    segment: "",
  };

  try {
    const accessToken = await getGoogleAccessToken(saJson);

    const now = new Date();
    const from = config.date_from ? config.date_from : (() => {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    })();
    const to = config.date_to || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const reportRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: "yearMonth" }],
          metrics: [
            { name: "sessions" }, { name: "totalUsers" },
            { name: "conversions" }, { name: "screenPageViews" },
            { name: "bounceRate" }, { name: "averageSessionDuration" },
          ],
        }),
      },
    );

    if (!reportRes.ok) {
      const body = await reportRes.text();
      errors.push(`GA4 API error [${reportRes.status}]: ${body.substring(0, 300)}`);
      return { records: 0, errors };
    }

    const report = await reportRes.json();

    if (report.rows) {
      for (const row of report.rows) {
        const ym = row.dimensionValues[0].value;
        const date = `${ym.substring(0, 4)}-${ym.substring(4, 6)}-01`;
        const metricValues = row.metricValues.map((v: any) => parseFloat(v.value) || 0);
        const [sessions, users, conversions, pageviews, bounceRate, avgDuration] = metricValues;

        metrics.push(
          { ...baseMetricFields, metric_type: "sessions", value: sessions, date },
          { ...baseMetricFields, metric_type: "users", value: users, date },
          { ...baseMetricFields, metric_type: "conversions", value: conversions, date },
          { ...baseMetricFields, metric_type: "pageviews", value: pageviews, date },
          { ...baseMetricFields, metric_type: "bounce_rate", value: Math.round(bounceRate * 100) / 100, date },
          { ...baseMetricFields, metric_type: "avg_session_duration", value: Math.round(avgDuration), date },
        );
      }
    }

    // Traffic source breakdown
    const sourceRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: from, endDate: to }],
          dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
        }),
      },
    );

    if (sourceRes.ok) {
      const sourceReport = await sourceRes.json();
      if (sourceReport.rows) {
        for (const row of sourceReport.rows) {
          const ym = row.dimensionValues[0].value;
          const channel = row.dimensionValues[1].value;
          const date = `${ym.substring(0, 4)}-${ym.substring(4, 6)}-01`;
          const [channelSessions] = row.metricValues.map((v: any) => parseFloat(v.value) || 0);

          metrics.push({
            ...baseMetricFields,
            metric_type: "sessions",
            value: channelSessions,
            date,
            segment: channel,
          });
        }
      }
    }
  } catch (err: unknown) {
    errors.push(`GA4 fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);

  return { records: metrics.length, errors };
}

/* ──────────────────── HUBSPOT ──────────────────── */

async function pullHubSpot(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  const HUBSPOT_KEY = creds.privateAppToken ?? creds.apiKey ?? creds.api_key ?? Deno.env.get("HUBSPOT_API_KEY");
  if (!HUBSPOT_KEY) return { records: 0, errors: ["HubSpot Private App Token not found. Enter it in the Data Connectors page."] };

  const errors: string[] = [];
  const metrics: any[] = [];
  const now = new Date();
  const fromMs = config.date_from
    ? new Date(config.date_from).getTime()
    : new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 85,
    region: "",
    segment: "",
  };

  try {
    let after: string | undefined;
    const allDeals: any[] = [];
    let pages = 0;

    while (pages < 20) {
      const params = new URLSearchParams({
        limit: "100",
        properties: "dealstage,amount,closedate,createdate,pipeline",
      });
      if (after) params.set("after", after);

      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals?${params}`, {
        headers: { Authorization: `Bearer ${HUBSPOT_KEY}` },
      });

      if (!res.ok) {
        const body = await res.text();
        errors.push(`HubSpot deals HTTP ${res.status}: ${body.substring(0, 200)}`);
        break;
      }

      const json = await res.json();
      allDeals.push(...(json.results || []));

      if (json.paging?.next?.after) {
        after = json.paging.next.after;
        pages++;
      } else {
        break;
      }
    }

    const pipelineByMonth: Record<string, number> = {};
    const closedWonByMonth: Record<string, number> = {};
    const dealCountByMonth: Record<string, number> = {};

    for (const deal of allDeals) {
      const props = deal.properties;
      const created = new Date(props.createdate);
      if (created.getTime() < fromMs) continue;

      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-01`;
      const amount = parseFloat(props.amount) || 0;

      pipelineByMonth[key] = (pipelineByMonth[key] || 0) + amount;
      dealCountByMonth[key] = (dealCountByMonth[key] || 0) + 1;

      if (props.dealstage === "closedwon" && props.closedate) {
        const closed = new Date(props.closedate);
        const cKey = `${closed.getFullYear()}-${String(closed.getMonth() + 1).padStart(2, "0")}-01`;
        closedWonByMonth[cKey] = (closedWonByMonth[cKey] || 0) + amount;
      }
    }

    for (const [date, value] of Object.entries(pipelineByMonth)) {
      metrics.push({ ...baseMetricFields, metric_type: "pipeline_value", value, date });
    }
    for (const [date, value] of Object.entries(closedWonByMonth)) {
      metrics.push({ ...baseMetricFields, metric_type: "closed_won_revenue", value, date });
    }
    for (const [date, value] of Object.entries(dealCountByMonth)) {
      metrics.push({ ...baseMetricFields, metric_type: "deals_created", value, date });
    }

    // Fetch contacts count
    const contactRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
      headers: { Authorization: `Bearer ${HUBSPOT_KEY}` },
    });
    if (contactRes.ok) {
      const contactData = await contactRes.json();
      if (contactData.total) {
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        metrics.push({ ...baseMetricFields, metric_type: "contacts", value: contactData.total, date: todayKey });
      }
    }
  } catch (err: unknown) {
    errors.push(`HubSpot fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);

  return { records: metrics.length, errors };
}

/* ──────────────────── XERO ──────────────────── */

async function pullXero(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  const XERO_TOKEN = creds.accessToken ?? creds.clientSecret ?? creds.access_token ?? Deno.env.get("XERO_ACCESS_TOKEN");
  const XERO_TENANT = creds.tenantId ?? creds.tenant_id ?? Deno.env.get("XERO_TENANT_ID");
  if (!XERO_TOKEN) return { records: 0, errors: ["Xero access token not found. Enter your credentials in the Data Connectors page."] };
  if (!XERO_TENANT) return { records: 0, errors: ["Xero Tenant ID not configured."] };

  const errors: string[] = [];
  const metrics: any[] = [];

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 92,
    region: "",
    segment: "",
  };

  try {
    const now = new Date();
    const from = config.date_from || `${now.getFullYear() - 1}-01-01`;
    const to = config.date_to || now.toISOString().split("T")[0];

    const plRes = await fetch(
      `https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${from}&toDate=${to}`,
      {
        headers: {
          Authorization: `Bearer ${XERO_TOKEN}`,
          "Xero-Tenant-Id": XERO_TENANT,
          Accept: "application/json",
        },
      },
    );

    if (plRes.ok) {
      const plData = await plRes.json();
      const report = plData.Reports?.[0];
      if (report?.Rows) {
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        for (const section of report.Rows) {
          if (section.RowType === "Section" && section.Title) {
            const total = section.Rows?.find((r: any) => r.RowType === "SummaryRow");
            if (total?.Cells?.[1]?.Value) {
              const value = parseFloat(total.Cells[1].Value) || 0;
              const type = section.Title.toLowerCase().includes("income") ? "revenue"
                : section.Title.toLowerCase().includes("expense") ? "operating_costs"
                : null;
              if (type) {
                metrics.push({ ...baseMetricFields, metric_type: type, value: Math.abs(value), date: todayKey });
              }
            }
          }
        }
      }
    } else {
      const body = await plRes.text();
      errors.push(`Xero P&L HTTP ${plRes.status}: ${body.substring(0, 200)}`);
    }

    // Bank balances
    const bankRes = await fetch("https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%22BANK%22", {
      headers: {
        Authorization: `Bearer ${XERO_TOKEN}`,
        "Xero-Tenant-Id": XERO_TENANT,
        Accept: "application/json",
      },
    });

    if (bankRes.ok) {
      const bankData = await bankRes.json();
      if (bankData.Accounts) {
        let totalBalance = 0;
        for (const acc of bankData.Accounts) {
          totalBalance += acc.BankBalance || 0;
        }
        const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
        metrics.push({ ...baseMetricFields, metric_type: "cash_balance", value: totalBalance, date: todayKey, quality_score: 95 });
      }
    }
  } catch (err: unknown) {
    errors.push(`Xero fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);
  return { records: metrics.length, errors };
}

/* ──────────────────── QUICKBOOKS ──────────────────── */

async function pullQuickBooks(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  const QB_TOKEN = creds.accessToken ?? creds.access_token ?? Deno.env.get("QUICKBOOKS_ACCESS_TOKEN");
  const QB_REALM = creds.realmId ?? creds.realm_id ?? Deno.env.get("QUICKBOOKS_REALM_ID");
  const QB_ENV = creds.environment ?? Deno.env.get("QUICKBOOKS_ENVIRONMENT") ?? "production";
  if (!QB_TOKEN) return { records: 0, errors: ["QuickBooks access token not found. Enter your credentials in the Data Connectors page."] };
  if (!QB_REALM) return { records: 0, errors: ["QuickBooks Realm ID not configured."] };

  const baseUrl = QB_ENV === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

  const errors: string[] = [];
  const metrics: any[] = [];

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 92,
    region: "",
    segment: "",
  };

  try {
    const now = new Date();
    const from = config.date_from || `${now.getFullYear() - 1}-01-01`;
    const to = config.date_to || now.toISOString().split("T")[0];

    const plRes = await fetch(
      `${baseUrl}/v3/company/${QB_REALM}/reports/ProfitAndLoss?start_date=${from}&end_date=${to}&summarize_column_by=Month&minorversion=65`,
      { headers: { Authorization: `Bearer ${QB_TOKEN}`, Accept: "application/json" } },
    );

    if (plRes.ok) {
      const plData = await plRes.json();
      const columns = plData.Columns?.Column || [];
      const rows = plData.Rows?.Row || [];
      const monthHeaders = columns.filter((c: any) => c.ColType === "Money").map((c: any) => c.ColTitle);

      const parseQBRow = (row: any, metricType: string) => {
        if (!row?.Summary?.ColData) return;
        const cols = row.Summary.ColData;
        for (let i = 1; i < cols.length && i - 1 < monthHeaders.length; i++) {
          const value = parseFloat(cols[i].value) || 0;
          if (value === 0) continue;
          const monthStr = monthHeaders[i - 1];
          try {
            const parsed = new Date(`${monthStr} 1`);
            if (!isNaN(parsed.getTime())) {
              const date = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-01`;
              metrics.push({ ...baseMetricFields, metric_type: metricType, value: Math.abs(value), date });
            }
          } catch { /* skip */ }
        }
      };

      for (const row of rows) {
        const group = row.group;
        if (group === "Income") parseQBRow(row, "revenue");
        if (group === "Expenses") parseQBRow(row, "operating_costs");
        if (group === "NetIncome") parseQBRow(row, "net_income");
      }
    } else {
      const body = await plRes.text();
      errors.push(`QuickBooks P&L HTTP ${plRes.status}: ${body.substring(0, 200)}`);
    }

    // Cash flow
    const now2 = new Date();
    const cfRes = await fetch(
      `${baseUrl}/v3/company/${QB_REALM}/reports/CashFlow?start_date=${from}&end_date=${to}&minorversion=65`,
      { headers: { Authorization: `Bearer ${QB_TOKEN}`, Accept: "application/json" } },
    );

    if (cfRes.ok) {
      const cfData = await cfRes.json();
      const netCashRow = cfData.Rows?.Row?.find((r: any) => r.group === "NetCash");
      if (netCashRow?.Summary?.ColData?.[1]) {
        const value = parseFloat(netCashRow.Summary.ColData[1].value) || 0;
        const todayKey = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-01`;
        metrics.push({ ...baseMetricFields, metric_type: "net_cash_flow", value, date: todayKey });
      }
    }
  } catch (err: unknown) {
    errors.push(`QuickBooks fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);
  return { records: metrics.length, errors };
}

/* ──────────────────── SALESFORCE ──────────────────── */

async function pullSalesforce(
  config: ConnectorConfig,
  serviceClient: any,
  creds: Record<string, string | undefined> = {},
): Promise<{ records: number; errors: string[] }> {
  const SF_TOKEN = creds.accessToken ?? creds.access_token ?? creds.clientSecret ?? Deno.env.get("SALESFORCE_ACCESS_TOKEN");
  const SF_INSTANCE = creds.instanceUrl ?? creds.instance_url ?? Deno.env.get("SALESFORCE_INSTANCE_URL");
  if (!SF_TOKEN) return { records: 0, errors: ["Salesforce access token not found. Enter your Connected App credentials in the Data Connectors page."] };
  if (!SF_INSTANCE) return { records: 0, errors: ["Salesforce instance URL not configured."] };

  const errors: string[] = [];
  const metrics: any[] = [];

  const baseMetricFields = {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id || null,
    source_type: "connector",
    source_id: config.data_source_id,
    quality_score: 88,
    region: "",
    segment: "",
  };

  try {
    const now = new Date();
    const from = config.date_from || `${now.getFullYear() - 1}-01-01T00:00:00Z`;

    // Opportunities (won)
    const oppQuery = encodeURIComponent(
      `SELECT CloseDate, Amount, StageName FROM Opportunity WHERE CloseDate >= ${from.split("T")[0]} AND StageName = 'Closed Won' ORDER BY CloseDate ASC`
    );
    const oppRes = await fetch(`${SF_INSTANCE}/services/data/v59.0/query?q=${oppQuery}`, {
      headers: { Authorization: `Bearer ${SF_TOKEN}` },
    });

    if (oppRes.ok) {
      const oppData = await oppRes.json();
      const byMonth: Record<string, { revenue: number; count: number }> = {};

      for (const opp of oppData.records || []) {
        if (!opp.CloseDate || !opp.Amount) continue;
        const d = new Date(opp.CloseDate);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        if (!byMonth[key]) byMonth[key] = { revenue: 0, count: 0 };
        byMonth[key].revenue += opp.Amount;
        byMonth[key].count += 1;
      }

      for (const [date, data] of Object.entries(byMonth)) {
        metrics.push(
          { ...baseMetricFields, metric_type: "closed_won_revenue", value: data.revenue, date },
          { ...baseMetricFields, metric_type: "deals_won", value: data.count, date },
        );
      }
    } else {
      const body = await oppRes.text();
      errors.push(`Salesforce opportunities HTTP ${oppRes.status}: ${body.substring(0, 200)}`);
    }

    // Pipeline (open opps)
    const pipeQuery = encodeURIComponent(
      `SELECT SUM(Amount) total, COUNT(Id) cnt FROM Opportunity WHERE IsClosed = false AND Amount != null`
    );
    const pipeRes = await fetch(`${SF_INSTANCE}/services/data/v59.0/query?q=${pipeQuery}`, {
      headers: { Authorization: `Bearer ${SF_TOKEN}` },
    });

    if (pipeRes.ok) {
      const pipeData = await pipeRes.json();
      if (pipeData.records?.[0]) {
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        metrics.push(
          { ...baseMetricFields, metric_type: "pipeline_value", value: pipeData.records[0].total || 0, date: todayKey },
          { ...baseMetricFields, metric_type: "open_deals", value: pipeData.records[0].cnt || 0, date: todayKey },
        );
      }
    }

    // Lead count
    const leadQuery = encodeURIComponent(`SELECT COUNT(Id) cnt FROM Lead WHERE CreatedDate >= ${from}`);
    const leadRes = await fetch(`${SF_INSTANCE}/services/data/v59.0/query?q=${leadQuery}`, {
      headers: { Authorization: `Bearer ${SF_TOKEN}` },
    });

    if (leadRes.ok) {
      const leadData = await leadRes.json();
      if (leadData.records?.[0]) {
        const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        metrics.push({ ...baseMetricFields, metric_type: "leads", value: leadData.records[0].cnt || 0, date: todayKey });
      }
    }
  } catch (err: unknown) {
    errors.push(`Salesforce fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: "organization_id,metric_type,date,region,segment,source_id",
      ignoreDuplicates: false,
    });
    if (error) errors.push(`DB upsert: ${error.message}`);
  }

  await serviceClient.from("data_sources").update({ last_synced_at: new Date().toISOString() }).eq("id", config.data_source_id);
  return { records: metrics.length, errors };
}

/* ──────────────────── MAIN HANDLER ──────────────────── */

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("authorization");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Allow both service role (from orchestrator) and user JWT
    const token = authHeader?.replace("Bearer ", "") || "";
    const isServiceCall = token === serviceKey;

    const serviceClient = createClient(supabaseUrl, serviceKey);

    if (!isServiceCall) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing authorization" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const config: ConnectorConfig = await req.json();
    const { connector_type, data_source_id, organization_id } = config;

    if (!connector_type || !data_source_id || !organization_id) {
      return new Response(JSON.stringify({ error: "connector_type, data_source_id, organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create sync job
    const { data: job } = await serviceClient.from("data_sync_jobs").insert({
      data_source_id,
      organization_id,
      status: "running",
      started_at: new Date().toISOString(),
    }).select().single();

    let result: { records: number; errors: string[] };

    // Resolve per-connector credentials if connector_id is in the config
    // This enables multi-tenant credential isolation
    let perConnectorCreds: Record<string, string | undefined> = {};
    const connectorId = config.connector_id ?? data_source_id;
    if (connectorId) {
      try {
        const credModule = await import("../_shared/connector-credentials.ts");
        perConnectorCreds = await credModule.resolveConnectorCredentials(serviceClient, connectorId);
      } catch { /* fall through to env vars */ }
    }

    // Warehouse / lake connectors delegate to dedicated functions (canonical-mapper + circuit breaker)
    const delegated: Record<string, string> = {
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

    if (delegated[connector_type]) {
      const dRes = await fetch(`${supabaseUrl}/functions/v1/${delegated[connector_type]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ connector_id: data_source_id }),
      });
      const dBody = await dRes.json();
      result = {
        records: dBody.rows_inserted ?? 0,
        errors: dBody.error ? [dBody.error] : (dBody.sample_errors ?? []).map((e: any) => e.reason ?? JSON.stringify(e)),
      };
    } else {
      switch (connector_type) {
        case "stripe":     result = await pullStripe(config, serviceClient, perConnectorCreds); break;
        case "ga4":
        case "google_analytics": result = await pullGA4(config, serviceClient, perConnectorCreds); break;
        case "hubspot":    result = await pullHubSpot(config, serviceClient, perConnectorCreds); break;
        case "xero":       result = await pullXero(config, serviceClient, perConnectorCreds); break;
        case "quickbooks": result = await pullQuickBooks(config, serviceClient, perConnectorCreds); break;
        case "salesforce": result = await pullSalesforce(config, serviceClient, perConnectorCreds); break;
        default:
          result = { records: 0, errors: [`Unknown connector type: ${connector_type}`] };
      }
    }

    // Update sync job
    if (job) {
      await serviceClient.from("data_sync_jobs").update({
        status: result.errors.length > 0 && result.records === 0 ? "failed" : result.errors.length > 0 ? "partial" : "completed",
        records_synced: result.records,
        error_message: result.errors.length > 0 ? result.errors.join("; ") : null,
        completed_at: new Date().toISOString(),
      }).eq("id", job.id);
    }

    // Audit log
    await serviceClient.from("audit_log").insert({
      organization_id,
      actor_type: isServiceCall ? "system" : "user",
      action_type: "connector_pull",
      resource_type: "data_source",
      resource_id: data_source_id,
      payload: { connector_type, records: result.records, errors: result.errors.length, dataset_id: config.dataset_id },
    });

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("connector-pull error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
