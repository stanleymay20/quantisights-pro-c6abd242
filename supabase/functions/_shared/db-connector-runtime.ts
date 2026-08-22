export interface MetricMapping {
  source_table: string;
  source_column: string;
  metric_type: string;
  date_column: string;
  aggregation?: string;
}

export interface DbConnectorRequest {
  action: "test" | "discover" | "preview" | "sync";
  connector_type?: string;
  connector_config_id?: string;
  organization_id: string;
  host?: string;
  port?: number;
  database_name?: string;
  schema_name?: string;
  username?: string;
  password?: string;
  ssl_mode?: string;
  account?: string;
  warehouse?: string;
  role?: string;
  project_id?: string;
  dataset_id?: string;
  service_account_json?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
  workspace_id?: string;
  redshift_database?: string;
  redshift_schema?: string;
  redshift_user?: string;
  redshift_password?: string;
  redshift_host?: string;
  redshift_port?: number;
  data_source_id?: string;
  selected_tables?: string[];
  metric_mappings?: MetricMapping[];
}

export interface RuntimeResult {
  status: number;
  body: Record<string, unknown>;
}

type MetricRow = {
  organization_id: string;
  dataset_id: null;
  metric_type: string;
  value: number;
  date: string;
  source_type: "connector";
  source_id: string;
  quality_score: number;
  region: string;
  segment: string;
};

type DbResult = { data?: unknown; error?: { message?: string } | null };
type DbFilter = PromiseLike<DbResult> & { eq(column: string, value: string): DbFilter };
type DbTable = {
  upsert(rows: MetricRow[], options: { onConflict: string; ignoreDuplicates?: boolean }): PromiseLike<DbResult>;
  update(values: Record<string, unknown>): DbFilter;
};
type DbClient = { from(table: string): DbTable };

const METRIC_CONFLICT = "organization_id,dataset_id,metric_type,date,region,segment,source_id";
const FETCH_TIMEOUT_MS = 45_000;
const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function result(status: number, body: Record<string, unknown>): RuntimeResult {
  return { status, body };
}

function asDbClient(value: unknown): DbClient {
  if (!value || typeof value !== "object" || typeof (value as { from?: unknown }).from !== "function") {
    throw new Error("database persistence client unavailable");
  }
  return value as DbClient;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} required`);
  return value.trim();
}

function identifier(value: unknown, label: string): string {
  const id = requireString(value, label);
  if (!SIMPLE_IDENTIFIER.test(id)) throw new Error(`${label} contains unsupported characters`);
  return id;
}

function aggregation(value: unknown): string {
  const upper = String(value ?? "sum").toUpperCase();
  if (!["SUM", "AVG", "COUNT", "MIN", "MAX"].includes(upper)) {
    throw new Error(`unsupported aggregation: ${String(value)}`);
  }
  return upper;
}

function isoDate(value: unknown, label: string): string {
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date`);
  return parsed.toISOString().slice(0, 10);
}

function fetchTimed(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

function metricRow(orgId: string, sourceId: string, mapping: MetricMapping, date: unknown, value: unknown, quality = 90): MetricRow | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return {
    organization_id: orgId,
    dataset_id: null,
    metric_type: requireString(mapping.metric_type, "metric_type"),
    value: numeric,
    date: isoDate(date, "metric date"),
    source_type: "connector",
    source_id: sourceId,
    quality_score: quality,
    region: "",
    segment: "",
  };
}

async function persistMetrics(
  clientValue: unknown,
  orgId: string,
  sourceId: string,
  rows: MetricRow[],
  errors: string[],
): Promise<{ records: number; errors: string[] }> {
  const client = asDbClient(clientValue);
  let records = 0;
  for (let index = 0; index < rows.length; index += 500) {
    const batch = rows.slice(index, index + 500);
    const { error } = await client.from("metrics").upsert(batch, {
      onConflict: METRIC_CONFLICT,
      ignoreDuplicates: false,
    });
    if (error) {
      errors.push(`metrics batch ${index} persistence failed: ${error.message ?? "unknown database error"}`);
      break;
    }
    records += batch.length;
  }

  // Never advertise freshness for a partial upstream read or partial persistence.
  if (errors.length === 0 && records === rows.length) {
    const { error } = await client
      .from("data_sources")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", sourceId)
      .eq("organization_id", orgId);
    if (error) errors.push(`data source freshness update failed: ${error.message ?? "unknown database error"}`);
  }

  return { records, errors };
}

function postgresConfig(body: DbConnectorRequest, redshift = false) {
  return {
    host: requireString(redshift ? body.redshift_host ?? body.host : body.host, "host"),
    port: Number(redshift ? body.redshift_port ?? body.port ?? 5439 : body.port ?? 5432),
    database: requireString(redshift ? body.redshift_database ?? body.database_name : body.database_name, "database_name"),
    username: requireString(redshift ? body.redshift_user ?? body.username : body.username, "username"),
    password: requireString(redshift ? body.redshift_password ?? body.password : body.password, "password"),
    schema: identifier(redshift ? body.redshift_schema ?? body.schema_name ?? "public" : body.schema_name ?? "public", "schema_name"),
    ssl: redshift || (body.ssl_mode ?? "require") !== "disable",
  };
}

async function openPostgres(body: DbConnectorRequest, redshift = false) {
  const cfg = postgresConfig(body, redshift);
  const { default: postgres } = await import("https://deno.land/x/postgresjs@v3.4.5/mod.js");
  const sql = postgres({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    username: cfg.username,
    password: cfg.password,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
    max: 1,
    idle_timeout: 15,
    connect_timeout: 15,
  });
  return { sql, cfg };
}

async function testPostgres(body: DbConnectorRequest, redshift = false): Promise<RuntimeResult> {
  let sql: any;
  try {
    const opened = await openPostgres(body, redshift);
    sql = opened.sql;
    const rows = await sql`SELECT version()`;
    const version = String(rows[0]?.version ?? "Connected");
    await sql.end();
    if (redshift && !version.toLowerCase().includes("redshift")) {
      return result(409, { success: false, message: "Endpoint responded but is not Amazon Redshift", version });
    }
    return result(200, { success: true, message: `${redshift ? "Redshift" : "PostgreSQL"} connection successful`, version });
  } catch (error) {
    try { if (sql) await sql.end(); } catch { /* no-op */ }
    return result(502, { success: false, message: `${redshift ? "Redshift" : "PostgreSQL"} connection failed: ${message(error)}` });
  }
}

async function discoverPostgres(body: DbConnectorRequest, redshift = false): Promise<RuntimeResult> {
  let sql: any;
  try {
    const opened = await openPostgres(body, redshift);
    sql = opened.sql;
    const schema = opened.cfg.schema;
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ${schema} AND table_type = 'BASE TABLE'
      ORDER BY table_name
      LIMIT 100
    `;
    const output: Array<Record<string, unknown>> = [];
    for (const table of tables) {
      const tableName = String(table.table_name);
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = ${schema} AND table_name = ${tableName}
        ORDER BY ordinal_position
      `;
      output.push({
        table_name: tableName,
        columns: columns.map((column: any) => ({
          column_name: column.column_name,
          data_type: column.data_type,
          is_nullable: column.is_nullable,
        })),
        row_count: null,
      });
    }
    await sql.end();
    return result(200, { tables: output, schema, engine: redshift ? "redshift" : "postgresql" });
  } catch (error) {
    try { if (sql) await sql.end(); } catch { /* no-op */ }
    return result(502, { tables: [], error: `${redshift ? "Redshift" : "PostgreSQL"} discovery failed: ${message(error)}` });
  }
}

async function previewPostgres(body: DbConnectorRequest, redshift = false): Promise<RuntimeResult> {
  const tableName = identifier(body.selected_tables?.[0], "selected_tables[0]");
  let sql: any;
  try {
    const opened = await openPostgres(body, redshift);
    sql = opened.sql;
    const schema = opened.cfg.schema;
    const rows = await sql.unsafe(`SELECT * FROM "${schema}"."${tableName}" LIMIT 25`);
    await sql.end();
    return result(200, { rows: Array.from(rows), count: rows.length, count_is_preview_only: true });
  } catch (error) {
    try { if (sql) await sql.end(); } catch { /* no-op */ }
    return result(502, { error: `Preview failed: ${message(error)}` });
  }
}

async function syncPostgres(
  body: DbConnectorRequest,
  orgId: string,
  sourceId: string,
  client: unknown,
  redshift = false,
): Promise<RuntimeResult> {
  const mappings = body.metric_mappings ?? [];
  const errors: string[] = [];
  const metrics: MetricRow[] = [];
  let sql: any;
  try {
    const opened = await openPostgres(body, redshift);
    sql = opened.sql;
    const schema = opened.cfg.schema;
    for (const mapping of mappings) {
      try {
        const table = identifier(mapping.source_table, "source_table");
        const column = identifier(mapping.source_column, "source_column");
        const dateColumn = identifier(mapping.date_column, "date_column");
        const agg = aggregation(mapping.aggregation);
        const rows = await sql.unsafe(`
          SELECT DATE_TRUNC('month', "${dateColumn}"::timestamp)::date AS period,
                 ${agg}("${column}"::numeric) AS value
          FROM "${schema}"."${table}"
          WHERE "${dateColumn}" IS NOT NULL AND "${column}" IS NOT NULL
          GROUP BY DATE_TRUNC('month', "${dateColumn}"::timestamp)
          ORDER BY period
          LIMIT 10000
        `);
        for (const row of rows) {
          if (row.period == null || row.value == null) continue;
          const metric = metricRow(orgId, sourceId, mapping, row.period, row.value, redshift ? 90 : 92);
          if (metric) metrics.push(metric);
        }
      } catch (error) {
        errors.push(`${mapping.source_table}.${mapping.source_column}: ${message(error)}`);
      }
    }
    await sql.end();
  } catch (error) {
    try { if (sql) await sql.end(); } catch { /* no-op */ }
    errors.push(`${redshift ? "Redshift" : "PostgreSQL"} connection: ${message(error)}`);
  }

  const persisted = await persistMetrics(client, orgId, sourceId, metrics, errors);
  const status = persisted.errors.length === 0 ? 200 : persisted.records > 0 ? 207 : 502;
  return result(status, persisted);
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function googleAccessToken(serviceAccountJson: string, scope: string): Promise<{ token: string; projectId?: string }> {
  const sa = JSON.parse(serviceAccountJson) as { client_email?: string; private_key?: string; project_id?: string };
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON missing client_email/private_key");
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = base64Url(enc.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = base64Url(enc.encode(JSON.stringify({
    iss: sa.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const keyBytes = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(`${header}.${claim}`));
  const jwt = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const tokenRes = await fetchTimed("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed (${tokenRes.status}): ${(await tokenRes.text()).slice(0, 200)}`);
  const tokenBody = await tokenRes.json() as { access_token?: string };
  if (!tokenBody.access_token) throw new Error("Google token exchange returned no access_token");
  return { token: tokenBody.access_token, projectId: sa.project_id };
}

async function bigQueryContext(body: DbConnectorRequest) {
  const serviceJson = requireString(body.service_account_json, "service_account_json");
  const auth = await googleAccessToken(serviceJson, "https://www.googleapis.com/auth/bigquery.readonly");
  const projectId = requireString(body.project_id ?? auth.projectId, "project_id");
  const datasetId = identifier(body.dataset_id, "dataset_id");
  return { token: auth.token, projectId, datasetId };
}

async function testBigQuery(body: DbConnectorRequest): Promise<RuntimeResult> {
  try {
    const ctx = await bigQueryContext(body);
    const res = await fetchTimed(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ctx.projectId)}/datasets/${encodeURIComponent(ctx.datasetId)}`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!res.ok) return result(502, { success: false, message: `BigQuery API validation failed (${res.status}): ${(await res.text()).slice(0, 200)}` });
    return result(200, { success: true, message: "BigQuery connection successful", version: `${ctx.projectId}.${ctx.datasetId}` });
  } catch (error) {
    return result(502, { success: false, message: `BigQuery connection failed: ${message(error)}` });
  }
}

async function discoverBigQuery(body: DbConnectorRequest): Promise<RuntimeResult> {
  try {
    const ctx = await bigQueryContext(body);
    const list = await fetchTimed(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ctx.projectId)}/datasets/${encodeURIComponent(ctx.datasetId)}/tables?maxResults=100`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!list.ok) return result(502, { tables: [], error: `BigQuery table discovery failed (${list.status}): ${(await list.text()).slice(0, 200)}` });
    const listBody = await list.json() as any;
    const tables: Array<Record<string, unknown>> = [];
    for (const entry of listBody.tables ?? []) {
      const tableId = entry.tableReference?.tableId;
      if (typeof tableId !== "string") continue;
      const schemaRes = await fetchTimed(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ctx.projectId)}/datasets/${encodeURIComponent(ctx.datasetId)}/tables/${encodeURIComponent(tableId)}`, {
        headers: { Authorization: `Bearer ${ctx.token}` },
      });
      if (!schemaRes.ok) return result(502, { tables: [], error: `BigQuery schema read failed for ${tableId} (${schemaRes.status})` });
      const schemaBody = await schemaRes.json() as any;
      tables.push({
        table_name: tableId,
        columns: (schemaBody.schema?.fields ?? []).map((field: any) => ({
          column_name: field.name,
          data_type: field.type,
          is_nullable: field.mode === "REQUIRED" ? "NO" : "YES",
        })),
        row_count: Number(schemaBody.numRows ?? 0),
      });
    }
    return result(200, { tables, project_id: ctx.projectId, dataset_id: ctx.datasetId });
  } catch (error) {
    return result(502, { tables: [], error: `BigQuery discovery failed: ${message(error)}` });
  }
}

async function syncBigQuery(body: DbConnectorRequest, orgId: string, sourceId: string, client: unknown): Promise<RuntimeResult> {
  const errors: string[] = [];
  const metrics: MetricRow[] = [];
  try {
    const ctx = await bigQueryContext(body);
    for (const mapping of body.metric_mappings ?? []) {
      try {
        const table = identifier(mapping.source_table, "source_table");
        const column = identifier(mapping.source_column, "source_column");
        const dateColumn = identifier(mapping.date_column, "date_column");
        const agg = aggregation(mapping.aggregation);
        const query = `SELECT DATE_TRUNC(CAST(\`${dateColumn}\` AS TIMESTAMP), MONTH) AS period, ${agg}(\`${column}\`) AS value FROM \`${ctx.projectId}.${ctx.datasetId}.${table}\` WHERE \`${dateColumn}\` IS NOT NULL AND \`${column}\` IS NOT NULL GROUP BY period ORDER BY period LIMIT 10000`;
        const res = await fetchTimed(`https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ctx.projectId)}/queries`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query, useLegacySql: false, maxResults: 10000, timeoutMs: 60_000 }),
        });
        if (!res.ok) {
          errors.push(`${mapping.source_table}.${mapping.source_column}: BigQuery HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
          continue;
        }
        const queryBody = await res.json() as any;
        if (queryBody.jobComplete === false) {
          errors.push(`${mapping.source_table}.${mapping.source_column}: BigQuery job did not complete within synchronous timeout`);
          continue;
        }
        for (const row of queryBody.rows ?? []) {
          const metric = metricRow(orgId, sourceId, mapping, row.f?.[0]?.v, row.f?.[1]?.v, 92);
          if (metric) metrics.push(metric);
        }
      } catch (error) {
        errors.push(`${mapping.source_table}.${mapping.source_column}: ${message(error)}`);
      }
    }
  } catch (error) {
    errors.push(`BigQuery connection: ${message(error)}`);
  }
  const persisted = await persistMetrics(client, orgId, sourceId, metrics, errors);
  const status = persisted.errors.length === 0 ? 200 : persisted.records > 0 ? 207 : 502;
  return result(status, persisted);
}

async function powerBiToken(body: DbConnectorRequest): Promise<string> {
  const tenantId = requireString(body.tenant_id, "tenant_id");
  const clientId = requireString(body.client_id, "client_id");
  const clientSecret = requireString(body.client_secret, "client_secret");
  const tokenRes = await fetchTimed(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://analysis.windows.net/powerbi/api/.default",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Azure AD authentication failed (${tokenRes.status}): ${(await tokenRes.text()).slice(0, 200)}`);
  const bodyJson = await tokenRes.json() as { access_token?: string };
  if (!bodyJson.access_token) throw new Error("Azure AD returned no access token");
  return bodyJson.access_token;
}

async function testPowerBI(body: DbConnectorRequest): Promise<RuntimeResult> {
  try {
    const token = await powerBiToken(body);
    const res = await fetchTimed("https://api.powerbi.com/v1.0/myorg/groups", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return result(502, { success: false, message: `Power BI API validation failed (${res.status}): ${(await res.text()).slice(0, 200)}` });
    const data = await res.json() as any;
    return result(200, { success: true, message: "Power BI connection successful", version: `Found ${Array.isArray(data.value) ? data.value.length : 0} accessible workspace(s)` });
  } catch (error) {
    return result(502, { success: false, message: `Power BI connection failed: ${message(error)}` });
  }
}

async function discoverPowerBI(body: DbConnectorRequest): Promise<RuntimeResult> {
  try {
    const token = await powerBiToken(body);
    const url = body.workspace_id
      ? `https://api.powerbi.com/v1.0/myorg/groups/${encodeURIComponent(body.workspace_id)}/datasets`
      : "https://api.powerbi.com/v1.0/myorg/datasets";
    const res = await fetchTimed(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return result(502, { tables: [], error: `Power BI dataset discovery failed (${res.status}): ${(await res.text()).slice(0, 200)}` });
    const data = await res.json() as any;
    return result(200, {
      tables: (data.value ?? []).map((dataset: any) => ({
        table_name: dataset.name ?? dataset.id,
        dataset_id: dataset.id,
        columns: [],
        row_count: null,
        metadata_only: true,
      })),
    });
  } catch (error) {
    return result(502, { tables: [], error: `Power BI discovery failed: ${message(error)}` });
  }
}

function unsupported(connectorType: string, action: string, guidance?: string): RuntimeResult {
  return result(501, {
    error: `${action} is not production-supported for ${connectorType}`,
    connector_type: connectorType,
    supported: false,
    ...(guidance ? { guidance } : {}),
  });
}

export function resolveConnectorType(body: DbConnectorRequest): string {
  const explicit = body.connector_type;
  if (explicit === "postgres") return "postgresql";
  if (explicit) return explicit;
  if (body.service_account_json || body.project_id) return "bigquery";
  if (body.tenant_id && body.client_id) return "powerbi";
  if (body.redshift_host || body.redshift_port === 5439 || body.port === 5439) return "redshift";
  if (body.port === 3306) return "mysql";
  if (body.port === 1433) return "sqlserver";
  return "postgresql";
}

export async function runDbConnectorAction(
  connectorType: string,
  body: DbConnectorRequest,
  orgId: string,
  serviceClient: unknown,
): Promise<RuntimeResult> {
  switch (body.action) {
    case "test":
      if (connectorType === "postgresql") return await testPostgres(body);
      if (connectorType === "redshift") return await testPostgres(body, true);
      if (connectorType === "bigquery") return await testBigQuery(body);
      if (connectorType === "powerbi") return await testPowerBI(body);
      if (connectorType === "snowflake") return unsupported(connectorType, "Direct credential test", "Use the managed Snowflake connector, which enforces query cost/authorization controls.");
      if (connectorType === "mysql" || connectorType === "sqlserver") return unsupported(connectorType, "Authenticated connection test", "A TCP socket alone is not treated as a successful database login.");
      return unsupported(connectorType, "Connection test");

    case "discover":
      if (connectorType === "postgresql") return await discoverPostgres(body);
      if (connectorType === "redshift") return await discoverPostgres(body, true);
      if (connectorType === "bigquery") return await discoverBigQuery(body);
      if (connectorType === "powerbi") return await discoverPowerBI(body);
      return unsupported(connectorType, "Schema discovery");

    case "preview":
      if (connectorType === "postgresql") return await previewPostgres(body);
      if (connectorType === "redshift") return await previewPostgres(body, true);
      return unsupported(connectorType, "Data preview");

    case "sync": {
      const sourceId = requireString(body.data_source_id, "data_source_id");
      if (!body.metric_mappings?.length) return result(400, { error: "metric_mappings required" });
      if (connectorType === "postgresql") return await syncPostgres(body, orgId, sourceId, serviceClient);
      if (connectorType === "redshift") return await syncPostgres(body, orgId, sourceId, serviceClient, true);
      if (connectorType === "bigquery") return await syncBigQuery(body, orgId, sourceId, serviceClient);
      return unsupported(connectorType, "Metric sync");
    }
  }
}
