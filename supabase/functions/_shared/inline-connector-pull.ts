export interface InlineConnectorConfig {
  connector_id: string;
  connector_type: string;
  data_source_id: string;
  organization_id: string;
  dataset_id?: string;
  date_from?: string;
  date_to?: string;
}

export interface InlineConnectorResult {
  records: number;
  errors: string[];
}

type MetricRow = {
  organization_id: string;
  dataset_id: string | null;
  source_type: "connector";
  source_id: string;
  quality_score: number;
  region: string;
  segment: string;
  metric_type: string;
  value: number;
  date: string;
};

type DbResult = { data?: unknown; error?: { message?: string } | null };
type DbFilter = PromiseLike<DbResult> & { eq(column: string, value: string): DbFilter };
type DbTable = {
  upsert(rows: MetricRow[], options: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<DbResult>;
  update(values: Record<string, unknown>): DbFilter;
};
type DbClient = { from(table: string): DbTable };

const METRIC_CONFLICT = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
const FETCH_TIMEOUT_MS = 45_000;

function isDbClient(value: unknown): value is DbClient {
  return Boolean(value) && typeof value === "object" && typeof (value as { from?: unknown }).from === "function";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return String((error as { message: string }).message);
  }
  return String(error);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthStart(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function parseDate(value: string | undefined, label: string, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date`);
  return parsed;
}

function dateRange(config: InlineConnectorConfig, defaultFrom: Date): { from: Date; to: Date } {
  const to = parseDate(config.date_to, "date_to", new Date());
  const from = parseDate(config.date_from, "date_from", defaultFrom);
  if (from.getTime() > to.getTime()) throw new Error("date_from must be before or equal to date_to");
  return { from, to };
}

function baseFields(config: InlineConnectorConfig, quality: number) {
  return {
    organization_id: config.organization_id,
    dataset_id: config.dataset_id ?? null,
    source_type: "connector" as const,
    source_id: config.data_source_id,
    quality_score: quality,
    region: "",
    segment: "",
  };
}

async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  return await fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

async function persistMetrics(
  serviceClient: unknown,
  config: InlineConnectorConfig,
  metrics: MetricRow[],
  upstreamErrors: string[],
): Promise<InlineConnectorResult> {
  if (!isDbClient(serviceClient)) throw new Error("connector persistence client unavailable");

  let persisted = 0;
  if (metrics.length > 0) {
    const { error } = await serviceClient.from("metrics").upsert(metrics, {
      onConflict: METRIC_CONFLICT,
      ignoreDuplicates: false,
    });
    if (error) throw new Error(`metrics persistence failed: ${error.message ?? "unknown database error"}`);
    persisted = metrics.length;
  }

  // A source is fresh only when the full upstream read completed without errors.
  // Partial rows may still be useful and are persisted, but freshness must not advance.
  if (upstreamErrors.length === 0) {
    const { error } = await serviceClient
      .from("data_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", config.data_source_id)
      .eq("organization_id", config.organization_id);
    if (error) throw new Error(`data source freshness update failed: ${error.message ?? "unknown database error"}`);
  }

  return { records: persisted, errors: upstreamErrors };
}

async function stripeFetchAll(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ data: Array<Record<string, any>>; errors: string[] }> {
  const data: Array<Record<string, any>> = [];
  const errors: string[] = [];
  let startingAfter: string | null = null;

  for (let page = 0; page < 100; page += 1) {
    const qs = new URLSearchParams({ ...params, limit: "100" });
    if (startingAfter) qs.set("starting_after", startingAfter);
    const res = await fetchWithTimeout(`https://api.stripe.com/v1/${endpoint}?${qs}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      errors.push(`Stripe ${endpoint} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      break;
    }
    const body = await res.json() as { data?: Array<Record<string, any>>; has_more?: boolean };
    if (!Array.isArray(body.data)) {
      errors.push(`Stripe ${endpoint}: unexpected response shape`);
      break;
    }
    data.push(...body.data);
    if (body.has_more !== true) break;
    const lastId = body.data.at(-1)?.id;
    if (typeof lastId !== "string" || !lastId) {
      errors.push(`Stripe ${endpoint}: pagination cursor missing`);
      break;
    }
    startingAfter = lastId;
    if (page === 99) errors.push(`Stripe ${endpoint}: pagination limit reached`);
  }

  return { data, errors };
}

async function pullStripe(
  config: InlineConnectorConfig,
  serviceClient: unknown,
  creds: Record<string, string | undefined>,
): Promise<InlineConnectorResult> {
  const apiKey = creds.stripeApiKey ?? creds.apiKey ?? creds.api_key ?? Deno.env.get("STRIPE_SECRET_KEY");
  if (!apiKey) return { records: 0, errors: ["Stripe API key not configured"] };

  const defaultFrom = new Date();
  defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 3, 1);
  const { from, to } = dateRange(config, defaultFrom);
  const fromTs = String(Math.floor(from.getTime() / 1000));
  const toTs = String(Math.floor(to.getTime() / 1000));
  const base = baseFields(config, 95);
  const errors: string[] = [];
  const metrics: MetricRow[] = [];

  try {
    const charges = await stripeFetchAll("charges", { "created[gte]": fromTs, "created[lte]": toTs }, apiKey);
    errors.push(...charges.errors);
    const grossByMonth = new Map<string, number>();
    const refundsByMonth = new Map<string, number>();
    for (const charge of charges.data) {
      if (charge.status !== "succeeded" || !Number.isFinite(Number(charge.created))) continue;
      const date = monthStart(new Date(Number(charge.created) * 1000));
      grossByMonth.set(date, (grossByMonth.get(date) ?? 0) + Number(charge.amount ?? 0) / 100);
      refundsByMonth.set(date, (refundsByMonth.get(date) ?? 0) + Number(charge.amount_refunded ?? 0) / 100);
    }
    for (const [date, gross] of grossByMonth) {
      const refunds = refundsByMonth.get(date) ?? 0;
      metrics.push({ ...base, metric_type: "revenue", value: gross - refunds, date });
      metrics.push({ ...base, metric_type: "gross_revenue", value: gross, date });
      if (refunds > 0) metrics.push({ ...base, metric_type: "refunds", value: refunds, date });
    }

    const customers = await stripeFetchAll("customers", { "created[gte]": fromTs, "created[lte]": toTs }, apiKey);
    errors.push(...customers.errors);
    const customersByMonth = new Map<string, number>();
    for (const customer of customers.data) {
      if (!Number.isFinite(Number(customer.created))) continue;
      const date = monthStart(new Date(Number(customer.created) * 1000));
      customersByMonth.set(date, (customersByMonth.get(date) ?? 0) + 1);
    }
    for (const [date, value] of customersByMonth) metrics.push({ ...base, metric_type: "customers", value, date });

    const subscriptions = await stripeFetchAll("subscriptions", { status: "all", "created[gte]": fromTs }, apiKey);
    errors.push(...subscriptions.errors);
    const mrrByMonth = new Map<string, number>();
    const churnByMonth = new Map<string, number>();
    const activeByMonth = new Map<string, number>();
    for (const subscription of subscriptions.data) {
      if (!Number.isFinite(Number(subscription.created))) continue;
      const createdMonth = monthStart(new Date(Number(subscription.created) * 1000));
      if (subscription.status === "active") {
        const price = subscription.items?.data?.[0]?.price;
        if (price) {
          let monthly = Number(price.unit_amount ?? 0) / 100;
          if (price.recurring?.interval === "year") monthly /= 12;
          if (Number.isFinite(monthly)) mrrByMonth.set(createdMonth, (mrrByMonth.get(createdMonth) ?? 0) + monthly);
        }
        activeByMonth.set(createdMonth, (activeByMonth.get(createdMonth) ?? 0) + 1);
      }
      if (subscription.status === "canceled" && Number.isFinite(Number(subscription.canceled_at))) {
        const date = monthStart(new Date(Number(subscription.canceled_at) * 1000));
        churnByMonth.set(date, (churnByMonth.get(date) ?? 0) + 1);
      }
    }
    for (const [date, value] of mrrByMonth) metrics.push({ ...base, metric_type: "mrr", value, date });
    for (const [date, churned] of churnByMonth) {
      const active = activeByMonth.get(date) ?? 0;
      const denominator = active + churned;
      metrics.push({ ...base, metric_type: "churn_rate", value: denominator > 0 ? Math.round((churned / denominator) * 10_000) / 100 : 0, date });
    }
  } catch (error) {
    errors.push(`Stripe fetch error: ${errorMessage(error)}`);
  }

  return await persistMetrics(serviceClient, config, metrics, errors);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email?: string; private_key?: string };
  if (!sa.client_email || !sa.private_key) throw new Error("GA4 service account JSON missing client_email/private_key");
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = base64Url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64Url(enc.encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Google token exchange returned no access_token");
  return body.access_token;
}

async function pullGA4(
  config: InlineConnectorConfig,
  serviceClient: unknown,
  creds: Record<string, string | undefined>,
): Promise<InlineConnectorResult> {
  const serviceAccountJson = creds.serviceAccountJson ?? creds.service_account_json ?? Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");
  const propertyId = creds.propertyId ?? creds.property_id ?? Deno.env.get("GA4_PROPERTY_ID");
  if (!serviceAccountJson) return { records: 0, errors: ["GA4 service account JSON not configured"] };
  if (!propertyId) return { records: 0, errors: ["GA4 property ID not configured"] };

  const defaultFrom = new Date();
  defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 3, 1);
  const { from, to } = dateRange(config, defaultFrom);
  const base = baseFields(config, 90);
  const errors: string[] = [];
  const metrics: MetricRow[] = [];

  try {
    const token = await getGoogleAccessToken(serviceAccountJson);
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`;
    const reportRes = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: isoDate(from), endDate: isoDate(to) }],
        dimensions: [{ name: "yearMonth" }],
        metrics: [
          { name: "sessions" }, { name: "totalUsers" }, { name: "conversions" },
          { name: "screenPageViews" }, { name: "bounceRate" }, { name: "averageSessionDuration" },
        ],
      }),
    });
    if (!reportRes.ok) throw new Error(`GA4 report HTTP ${reportRes.status}: ${(await reportRes.text()).slice(0, 300)}`);
    const report = await reportRes.json() as { rows?: Array<any> };
    for (const row of report.rows ?? []) {
      const ym = String(row.dimensionValues?.[0]?.value ?? "");
      if (!/^\d{6}$/.test(ym)) continue;
      const date = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
      const values = (row.metricValues ?? []).map((value: { value?: string }) => Number(value.value ?? 0));
      const names = ["sessions", "users", "conversions", "pageviews", "bounce_rate", "avg_session_duration"];
      names.forEach((metric_type, index) => {
        const value = values[index];
        if (Number.isFinite(value)) metrics.push({ ...base, metric_type, value, date });
      });
    }

    const sourceRes = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        dateRanges: [{ startDate: isoDate(from), endDate: isoDate(to) }],
        dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "sessions" }],
      }),
    });
    if (!sourceRes.ok) {
      errors.push(`GA4 traffic-source report HTTP ${sourceRes.status}: ${(await sourceRes.text()).slice(0, 300)}`);
    } else {
      const sourceReport = await sourceRes.json() as { rows?: Array<any> };
      for (const row of sourceReport.rows ?? []) {
        const ym = String(row.dimensionValues?.[0]?.value ?? "");
        const channel = String(row.dimensionValues?.[1]?.value ?? "unknown");
        const value = Number(row.metricValues?.[0]?.value ?? 0);
        if (/^\d{6}$/.test(ym) && Number.isFinite(value)) {
          metrics.push({ ...base, metric_type: "sessions", value, date: `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`, segment: channel });
        }
      }
    }
  } catch (error) {
    errors.push(`GA4 fetch error: ${errorMessage(error)}`);
  }

  return await persistMetrics(serviceClient, config, metrics, errors);
}

async function pullXero(
  config: InlineConnectorConfig,
  serviceClient: unknown,
  creds: Record<string, string | undefined>,
): Promise<InlineConnectorResult> {
  const accessToken = creds.accessToken ?? creds.access_token ?? Deno.env.get("XERO_ACCESS_TOKEN");
  const tenantId = creds.tenantId ?? creds.tenant_id ?? Deno.env.get("XERO_TENANT_ID");
  if (!accessToken) return { records: 0, errors: ["Xero access token not configured"] };
  if (!tenantId) return { records: 0, errors: ["Xero tenant ID not configured"] };

  const defaultFrom = new Date();
  defaultFrom.setUTCFullYear(defaultFrom.getUTCFullYear() - 1, 0, 1);
  const { from, to } = dateRange(config, defaultFrom);
  const base = baseFields(config, 92);
  const errors: string[] = [];
  const metrics: MetricRow[] = [];
  const headers = { Authorization: `Bearer ${accessToken}`, "Xero-Tenant-Id": tenantId, Accept: "application/json" };

  try {
    const plRes = await fetchWithTimeout(`https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?fromDate=${isoDate(from)}&toDate=${isoDate(to)}`, { headers });
    if (!plRes.ok) {
      errors.push(`Xero P&L HTTP ${plRes.status}: ${(await plRes.text()).slice(0, 200)}`);
    } else {
      const body = await plRes.json() as any;
      const date = monthStart(to);
      for (const section of body.Reports?.[0]?.Rows ?? []) {
        if (section.RowType !== "Section" || typeof section.Title !== "string") continue;
        const summary = section.Rows?.find((row: any) => row.RowType === "SummaryRow");
        const value = Number(summary?.Cells?.[1]?.Value);
        if (!Number.isFinite(value)) continue;
        const title = section.Title.toLowerCase();
        const metric_type = title.includes("income") ? "revenue" : title.includes("expense") ? "operating_costs" : null;
        if (metric_type) metrics.push({ ...base, metric_type, value: Math.abs(value), date });
      }
    }

    const bankRes = await fetchWithTimeout("https://api.xero.com/api.xro/2.0/Accounts?where=Type%3D%22BANK%22", { headers });
    if (!bankRes.ok) {
      errors.push(`Xero accounts HTTP ${bankRes.status}: ${(await bankRes.text()).slice(0, 200)}`);
    } else {
      const body = await bankRes.json() as any;
      const accounts = Array.isArray(body.Accounts) ? body.Accounts : [];
      const total = accounts.reduce((sum: number, account: any) => sum + Number(account.BankBalance ?? 0), 0);
      if (Number.isFinite(total)) metrics.push({ ...base, metric_type: "cash_balance", value: total, date: monthStart(to), quality_score: 95 });
    }
  } catch (error) {
    errors.push(`Xero fetch error: ${errorMessage(error)}`);
  }

  return await persistMetrics(serviceClient, config, metrics, errors);
}

async function pullQuickBooks(
  config: InlineConnectorConfig,
  serviceClient: unknown,
  creds: Record<string, string | undefined>,
): Promise<InlineConnectorResult> {
  const accessToken = creds.accessToken ?? creds.access_token ?? Deno.env.get("QUICKBOOKS_ACCESS_TOKEN");
  const realmId = creds.realmId ?? creds.realm_id ?? Deno.env.get("QUICKBOOKS_REALM_ID");
  const environment = creds.environment ?? Deno.env.get("QUICKBOOKS_ENVIRONMENT") ?? "production";
  if (!accessToken) return { records: 0, errors: ["QuickBooks access token not configured"] };
  if (!realmId) return { records: 0, errors: ["QuickBooks realm ID not configured"] };

  const defaultFrom = new Date();
  defaultFrom.setUTCFullYear(defaultFrom.getUTCFullYear() - 1, 0, 1);
  const { from, to } = dateRange(config, defaultFrom);
  const base = baseFields(config, 92);
  const errors: string[] = [];
  const metrics: MetricRow[] = [];
  const origin = environment === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  try {
    const plRes = await fetchWithTimeout(
      `${origin}/v3/company/${encodeURIComponent(realmId)}/reports/ProfitAndLoss?start_date=${isoDate(from)}&end_date=${isoDate(to)}&summarize_column_by=Month&minorversion=65`,
      { headers },
    );
    if (!plRes.ok) {
      errors.push(`QuickBooks P&L HTTP ${plRes.status}: ${(await plRes.text()).slice(0, 200)}`);
    } else {
      const body = await plRes.json() as any;
      const columns = body.Columns?.Column ?? [];
      const monthHeaders = columns.filter((column: any) => column.ColType === "Money").map((column: any) => String(column.ColTitle ?? ""));
      const parseSummary = (row: any, metric_type: string) => {
        const cols = row?.Summary?.ColData;
        if (!Array.isArray(cols)) return;
        for (let index = 1; index < cols.length && index - 1 < monthHeaders.length; index += 1) {
          const value = Number(cols[index]?.value);
          const parsed = new Date(`${monthHeaders[index - 1]} 1 UTC`);
          if (!Number.isFinite(value) || !Number.isFinite(parsed.getTime()) || value === 0) continue;
          metrics.push({ ...base, metric_type, value: Math.abs(value), date: monthStart(parsed) });
        }
      };
      for (const row of body.Rows?.Row ?? []) {
        if (row.group === "Income") parseSummary(row, "revenue");
        if (row.group === "Expenses") parseSummary(row, "operating_costs");
        if (row.group === "NetIncome") parseSummary(row, "net_income");
      }
    }

    const cashRes = await fetchWithTimeout(
      `${origin}/v3/company/${encodeURIComponent(realmId)}/reports/CashFlow?start_date=${isoDate(from)}&end_date=${isoDate(to)}&minorversion=65`,
      { headers },
    );
    if (!cashRes.ok) {
      errors.push(`QuickBooks cash-flow HTTP ${cashRes.status}: ${(await cashRes.text()).slice(0, 200)}`);
    } else {
      const body = await cashRes.json() as any;
      const netCash = (body.Rows?.Row ?? []).find((row: any) => row.group === "NetCash");
      const value = Number(netCash?.Summary?.ColData?.[1]?.value);
      if (Number.isFinite(value)) metrics.push({ ...base, metric_type: "net_cash_flow", value, date: monthStart(to) });
    }
  } catch (error) {
    errors.push(`QuickBooks fetch error: ${errorMessage(error)}`);
  }

  return await persistMetrics(serviceClient, config, metrics, errors);
}

export async function runInlineConnectorPull(
  connectorType: string,
  config: InlineConnectorConfig,
  serviceClient: unknown,
  credentials: Record<string, string | undefined>,
): Promise<InlineConnectorResult> {
  switch (connectorType) {
    case "stripe":
      return await pullStripe(config, serviceClient, credentials);
    case "ga4":
    case "google_analytics":
      return await pullGA4(config, serviceClient, credentials);
    case "xero":
      return await pullXero(config, serviceClient, credentials);
    case "quickbooks":
      return await pullQuickBooks(config, serviceClient, credentials);
    default:
      return { records: 0, errors: [`Unknown connector type: ${connectorType}`] };
  }
}
