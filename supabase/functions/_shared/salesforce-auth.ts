/**
 * Salesforce OAuth token lifecycle.
 *
 *  - Real refresh tokens live in Vault. This module reads/rotates via SECURITY DEFINER RPCs
 *    (get_connector_secret / upsert_vault_secret) and updates `connector_token_state` (metadata only).
 *  - On 5 consecutive refresh failures the token is quarantined; the connector must be
 *    reauthorized via the standard connector linking flow before further pulls.
 *  - Access tokens are cached in Vault under a per-connector name; we refresh proactively
 *    when expires_at < now() + 60s.
 *  - NEVER log tokens. Only status and safe OAuth error codes may enter failure metadata.
 */

const MAX_REFRESH_FAILURES = 5;
const PROACTIVE_REFRESH_WINDOW_MS = 60_000;
const DEFAULT_SALESFORCE_LOGIN_ORIGIN = "https://login.salesforce.com";

interface TokenRow {
  vendor: string;
  access_token_vault_name: string | null;
  refresh_token_vault_name: string | null;
  instance_url: string | null;
  expires_at: string | null;
  refresh_failure_count: number;
  quarantined: boolean;
  revoked: boolean;
  rotation_count: number;
}

export interface SfTokens {
  access_token: string;
  instance_url: string;
}

type DbResult = {
  data: unknown;
  error: unknown;
};

type DbWriteResult = {
  error: unknown;
};

type SelectFilterBuilder = {
  eq(column: string, value: string): SelectFilterBuilder;
  maybeSingle(): PromiseLike<DbResult>;
};

type WriteFilterBuilder = PromiseLike<DbWriteResult> & {
  eq(column: string, value: string): WriteFilterBuilder;
};

type TokenTableClient = {
  select(columns: string): SelectFilterBuilder;
  update(values: Record<string, unknown>): WriteFilterBuilder;
};

type TokenClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult>;
  from(table: string): TokenTableClient;
};

type DenoRuntime = {
  env: {
    get(name: string): string | undefined;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asTokenClient(value: unknown): TokenClient | null {
  if (!isRecord(value) || typeof value.rpc !== "function" || typeof value.from !== "function") {
    return null;
  }
  return value as TokenClient;
}

function requireClient(value: unknown): TokenClient {
  const client = asTokenClient(value);
  if (!client) throw new Error("invalid Salesforce token client");
  return client;
}

function envGet(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & { Deno?: DenoRuntime };
  return runtime.Deno?.env.get(name);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

function assertWriteSucceeded(error: unknown, operation: string): void {
  if (error) throw new Error(`${operation}: ${errorMessage(error)}`);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTokenRow(value: unknown): TokenRow | null {
  if (!isRecord(value)) return null;
  const vendor = value.vendor;
  const accessVault = value.access_token_vault_name;
  const refreshVault = value.refresh_token_vault_name;
  const instanceUrl = value.instance_url;
  const expiresAt = value.expires_at;
  const refreshFailures = finiteNumber(value.refresh_failure_count);
  const quarantined = value.quarantined;
  const revoked = value.revoked;
  const rotationCount = finiteNumber(value.rotation_count);

  if (
    typeof vendor !== "string" ||
    (accessVault !== null && typeof accessVault !== "string") ||
    (refreshVault !== null && typeof refreshVault !== "string") ||
    (instanceUrl !== null && typeof instanceUrl !== "string") ||
    (expiresAt !== null && (typeof expiresAt !== "string" || !Number.isFinite(Date.parse(expiresAt)))) ||
    refreshFailures == null || refreshFailures < 0 ||
    typeof quarantined !== "boolean" ||
    typeof revoked !== "boolean" ||
    rotationCount == null || rotationCount < 0
  ) {
    return null;
  }

  return {
    vendor,
    access_token_vault_name: typeof accessVault === "string" ? accessVault : null,
    refresh_token_vault_name: typeof refreshVault === "string" ? refreshVault : null,
    instance_url: typeof instanceUrl === "string" ? instanceUrl : null,
    expires_at: typeof expiresAt === "string" ? expiresAt : null,
    refresh_failure_count: refreshFailures,
    quarantined,
    revoked,
    rotation_count: rotationCount,
  };
}

/** Normalize and validate a Salesforce-controlled HTTPS origin before it is used for OAuth or API calls. */
export function normalizeSalesforceOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid Salesforce instance URL");
  }

  const hostname = url.hostname.toLowerCase();
  const isSalesforceHost = hostname === "salesforce.com" || hostname.endsWith(".salesforce.com");
  if (
    url.protocol !== "https:" ||
    !isSalesforceHost ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== ""
  ) {
    throw new Error("untrusted Salesforce instance URL");
  }
  return url.origin;
}

export function salesforceTokenEndpoint(instanceUrl: string | null): string {
  const origin = normalizeSalesforceOrigin(instanceUrl ?? DEFAULT_SALESFORCE_LOGIN_ORIGIN);
  return `${origin}/services/oauth2/token`;
}

async function vaultGet(svc: TokenClient, name: string): Promise<string | null> {
  const { data, error } = await svc.rpc("get_connector_secret", { _secret_name: name });
  if (error) throw new Error(`vault read failed: ${errorMessage(error)}`);
  return data ? String(data) : null;
}

async function vaultSet(svc: TokenClient, name: string, value: string): Promise<void> {
  const { error } = await svc.rpc("upsert_vault_secret", {
    _name: name,
    _value: value,
    _description: "Salesforce connector token",
  });
  assertWriteSucceeded(error, "vault write failed");
}

async function loadState(svc: TokenClient, orgId: string, connectorId: string): Promise<TokenRow | null> {
  const { data, error } = await svc
    .from("connector_token_state")
    .select("vendor,access_token_vault_name,refresh_token_vault_name,instance_url,expires_at,refresh_failure_count,quarantined,revoked,rotation_count")
    .eq("connector_id", connectorId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`unable to read Salesforce token state: ${errorMessage(error)}`);
  if (data == null) return null;
  const parsed = parseTokenRow(data);
  if (!parsed) throw new Error("Salesforce token state is malformed");
  if (parsed.vendor.toLowerCase() !== "salesforce") {
    throw new Error("connector token state vendor mismatch");
  }
  return parsed;
}

function assertUsableState(state: TokenRow): void {
  if (state.revoked) throw new Error("salesforce token revoked — relink connector");
  if (state.quarantined) throw new Error("salesforce token quarantined — relink connector");
}

/** Returns a usable access token + instance URL, refreshing if needed. Throws if quarantined/revoked. */
export async function getSalesforceTokens(
  svc: unknown,
  params: { orgId: string; connectorId: string },
): Promise<SfTokens> {
  const client = requireClient(svc);
  const state = await loadState(client, params.orgId, params.connectorId);
  if (!state) throw new Error("salesforce connector not linked (no token_state row)");
  assertUsableState(state);
  if (!state.refresh_token_vault_name || !state.access_token_vault_name || !state.instance_url) {
    throw new Error("salesforce token_state incomplete — relink connector");
  }
  const instanceUrl = normalizeSalesforceOrigin(state.instance_url);

  const needsRefresh =
    !state.expires_at ||
    new Date(state.expires_at).getTime() - Date.now() < PROACTIVE_REFRESH_WINDOW_MS;
  if (!needsRefresh) {
    const access = await vaultGet(client, state.access_token_vault_name);
    if (access) return { access_token: access, instance_url: instanceUrl };
  }
  return refreshSalesforceToken(client, params);
}

export async function refreshSalesforceToken(
  svc: unknown,
  params: { orgId: string; connectorId: string },
): Promise<SfTokens> {
  const client = requireClient(svc);
  const state = await loadState(client, params.orgId, params.connectorId);
  if (!state || !state.refresh_token_vault_name) throw new Error("no refresh token to rotate");
  assertUsableState(state);

  const clientId = envGet("SALESFORCE_CLIENT_ID");
  const clientSecret = envGet("SALESFORCE_CLIENT_SECRET");
  const refreshToken = await vaultGet(client, state.refresh_token_vault_name);
  if (!clientId || !clientSecret || !refreshToken) {
    await markRefreshFailure(
      client,
      params.orgId,
      params.connectorId,
      state.refresh_failure_count + 1,
      "missing oauth credentials",
    );
    throw new Error("salesforce oauth credentials missing");
  }

  const tokenUrl = salesforceTokenEndpoint(state.instance_url);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const rawPayload: unknown = await res.json().catch(() => null);
  const payload = isRecord(rawPayload) ? rawPayload : {};
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  const safeError = typeof payload.error === "string" ? payload.error.slice(0, 80) : "unknown";

  if (!res.ok || !accessToken) {
    // Do NOT persist token bodies — only HTTP status + bounded OAuth error code.
    const nextFailureCount = state.refresh_failure_count + 1;
    await markRefreshFailure(
      client,
      params.orgId,
      params.connectorId,
      nextFailureCount,
      `refresh ${res.status} ${safeError}`,
    );
    if (nextFailureCount >= MAX_REFRESH_FAILURES) {
      throw new Error("salesforce token quarantined after repeated refresh failures");
    }
    throw new Error(`salesforce token refresh failed (${res.status})`);
  }

  const responseInstance = typeof payload.instance_url === "string" ? payload.instance_url : state.instance_url;
  const instanceUrl = normalizeSalesforceOrigin(responseInstance ?? DEFAULT_SALESFORCE_LOGIN_ORIGIN);
  const rawExpiresIn = Number(payload.expires_in ?? 3600);
  const expiresInSec = Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? rawExpiresIn : 3600;

  if (!state.access_token_vault_name) {
    throw new Error("salesforce access token vault name missing — relink connector");
  }
  await vaultSet(client, state.access_token_vault_name, accessToken);

  // Optional refresh-token rotation (some flows return a new one).
  if (typeof payload.refresh_token === "string" && payload.refresh_token) {
    await vaultSet(client, state.refresh_token_vault_name, payload.refresh_token);
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await client
    .from("connector_token_state")
    .update({
      instance_url: instanceUrl,
      expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
      issued_at: nowIso,
      last_rotated_at: nowIso,
      rotation_count: state.rotation_count + 1,
      refresh_failure_count: 0,
      quarantined: false,
      quarantined_at: null,
      quarantine_reason: null,
      updated_at: nowIso,
    })
    .eq("connector_id", params.connectorId)
    .eq("organization_id", params.orgId);
  assertWriteSucceeded(updateError, "unable to persist Salesforce token state");

  return { access_token: accessToken, instance_url: instanceUrl };
}

async function markRefreshFailure(
  svc: TokenClient,
  orgId: string,
  connectorId: string,
  count: number,
  reasonSafe: string,
): Promise<void> {
  const quarantine = count >= MAX_REFRESH_FAILURES;
  const { error } = await svc
    .from("connector_token_state")
    .update({
      refresh_failure_count: count,
      quarantined: quarantine,
      quarantined_at: quarantine ? new Date().toISOString() : null,
      quarantine_reason: quarantine ? reasonSafe.slice(0, 200) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("connector_id", connectorId)
    .eq("organization_id", orgId);
  assertWriteSucceeded(error, "unable to persist Salesforce refresh failure");
}
