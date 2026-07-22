// @ts-nocheck
/**
 * Salesforce OAuth token lifecycle.
 *
 *  - Real refresh tokens live in Vault. This module reads/rotates via SECURITY DEFINER RPCs
 *    (get_connector_secret / upsert_vault_secret) and updates `connector_token_state` (metadata only).
 *  - On 5 consecutive refresh failures the token is quarantined; the connector must be
 *    reauthorized via the standard connector linking flow before further pulls.
 *  - Access tokens are cached in Vault under a per-connector name; we refresh proactively
 *    when expires_at < now() + 60s.
 *  - NEVER log tokens. All header dumps go through redactHeaders().
 */

const MAX_REFRESH_FAILURES = 5;
const PROACTIVE_REFRESH_WINDOW_MS = 60_000;

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

async function vaultGet(svc: any, name: string): Promise<string | null> {
  const { data, error } = await svc.rpc("get_connector_secret", { _secret_name: name });
  if (error || !data) return null;
  return String(data);
}

async function vaultSet(svc: any, name: string, value: string): Promise<void> {
  const { error } = await svc.rpc("upsert_vault_secret", { _name: name, _value: value, _description: "Salesforce connector token" });
  if (error) throw new Error(`vault write failed: ${error.message}`);
}

async function loadState(svc: any, connectorId: string): Promise<TokenRow | null> {
  const { data } = await svc.from("connector_token_state")
    .select("vendor,access_token_vault_name,refresh_token_vault_name,instance_url,expires_at,refresh_failure_count,quarantined,revoked,rotation_count")
    .eq("connector_id", connectorId).maybeSingle();
  return (data as TokenRow) ?? null;
}

/** Returns a usable access token + instance URL, refreshing if needed. Throws if quarantined/revoked. */
export async function getSalesforceTokens(svc: any, params: { orgId: string; connectorId: string }): Promise<SfTokens> {
  const state = await loadState(svc, params.connectorId);
  if (!state) throw new Error("salesforce connector not linked (no token_state row)");
  if (state.revoked) throw new Error("salesforce token revoked — relink connector");
  if (state.quarantined) throw new Error("salesforce token quarantined — relink connector");
  if (!state.refresh_token_vault_name || !state.access_token_vault_name || !state.instance_url) {
    throw new Error("salesforce token_state incomplete — relink connector");
  }

  const needsRefresh = !state.expires_at || (new Date(state.expires_at).getTime() - Date.now()) < PROACTIVE_REFRESH_WINDOW_MS;
  if (!needsRefresh) {
    const access = await vaultGet(svc, state.access_token_vault_name);
    if (access) return { access_token: access, instance_url: state.instance_url };
  }
  return await refreshSalesforceToken(svc, params);
}

export async function refreshSalesforceToken(svc: any, params: { orgId: string; connectorId: string }): Promise<SfTokens> {
  const state = await loadState(svc, params.connectorId);
  if (!state || !state.refresh_token_vault_name) throw new Error("no refresh token to rotate");

  const clientId = Deno.env.get("SALESFORCE_CLIENT_ID");
  const clientSecret = Deno.env.get("SALESFORCE_CLIENT_SECRET");
  const refreshToken = await vaultGet(svc, state.refresh_token_vault_name);
  if (!clientId || !clientSecret || !refreshToken) {
    await markRefreshFailure(svc, params.connectorId, state.refresh_failure_count + 1, "missing oauth credentials");
    throw new Error("salesforce oauth credentials missing");
  }
  const tokenUrl = `${state.instance_url ?? "https://login.salesforce.com"}/services/oauth2/token`;

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
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    // Do NOT log token bodies — only status + error code.
    await markRefreshFailure(svc, params.connectorId, state.refresh_failure_count + 1, `refresh ${res.status} ${json.error ?? "unknown"}`);
    if (state.refresh_failure_count + 1 >= MAX_REFRESH_FAILURES) {
      throw new Error("salesforce token quarantined after repeated refresh failures");
    }
    throw new Error(`salesforce token refresh failed (${res.status})`);
  }

  const accessToken: string = json.access_token;
  const instanceUrl: string = json.instance_url ?? state.instance_url!;
  const expiresInSec: number = Number(json.expires_in ?? 3600);

  await vaultSet(svc, state.access_token_vault_name!, accessToken);
  // Optional refresh-token rotation (some flows return a new one)
  if (json.refresh_token) await vaultSet(svc, state.refresh_token_vault_name!, json.refresh_token);

  await svc.from("connector_token_state").update({
    instance_url: instanceUrl,
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    issued_at: new Date().toISOString(),
    last_rotated_at: new Date().toISOString(),
    rotation_count: state.rotation_count + 1,
    refresh_failure_count: 0,
    quarantined: false,
    quarantined_at: null,
    quarantine_reason: null,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", params.connectorId);

  return { access_token: accessToken, instance_url: instanceUrl };
}

async function markRefreshFailure(svc: any, connectorId: string, count: number, reasonSafe: string): Promise<void> {
  const quarantine = count >= MAX_REFRESH_FAILURES;
  await svc.from("connector_token_state").update({
    refresh_failure_count: count,
    quarantined: quarantine ? true : false,
    quarantined_at: quarantine ? new Date().toISOString() : null,
    quarantine_reason: quarantine ? reasonSafe.slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  }).eq("connector_id", connectorId);
}
