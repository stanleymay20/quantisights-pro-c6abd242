/**
 * connector-credentials.ts
 *
 * Per-connector credential resolution.
 * Priority: Vault → data_connectors.config.credentials → env var fallback.
 *
 * This allows the system to work with:
 *  a) Per-org Vault-backed credentials (production path)
 *  b) Credentials embedded in data_connectors.config.credentials (simple path)
 *  c) Global env vars (legacy / development)
 */

export interface ResolvedCredentials {
  [key: string]: string | undefined;
}

type QueryResult = {
  data: unknown;
  error: unknown;
};

type ConnectorCredentialClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<QueryResult>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        single(): PromiseLike<QueryResult>;
      };
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asCredentialClient(value: unknown): ConnectorCredentialClient | null {
  if (!isRecord(value)) return null;
  if (typeof value.rpc !== "function" || typeof value.from !== "function") return null;
  return value as ConnectorCredentialClient;
}

function toStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const mapped: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") mapped[key] = entry;
  }
  return mapped;
}

/**
 * Read a secret from Supabase Vault via RPC.
 * Returns null if the secret doesn't exist or the RPC fails.
 */
async function vaultGet(svc: ConnectorCredentialClient, name: string): Promise<string | null> {
  try {
    const { data, error } = await svc.rpc("get_connector_secret", { _secret_name: name });
    if (error || !data) return null;
    return String(data);
  } catch {
    return null;
  }
}

/**
 * Resolve all credentials for a connector.
 * Looks up the data_connectors record, reads vault_keys, resolves each from Vault.
 * Falls back to config.credentials for non-vaulted fields.
 */
export async function resolveConnectorCredentials(
  svc: unknown,
  connectorId: string,
): Promise<ResolvedCredentials> {
  const client = asCredentialClient(svc);
  if (!client) return {};

  const { data: connectorData, error } = await client
    .from("data_connectors")
    .select("config, credential_vault_keys, vault_secret_name")
    .eq("id", connectorId)
    .single();

  if (error || !isRecord(connectorData)) return {};

  const resolved: ResolvedCredentials = {};
  const cfg = isRecord(connectorData.config) ? connectorData.config : {};

  // Primary vault key mapping: credential_vault_keys (new column) OR config.vault_keys (fallback)
  const vaultKeys = toStringMap(connectorData.credential_vault_keys ?? cfg.vault_keys);

  // Read each field from Vault
  for (const [field, vaultKey] of Object.entries(vaultKeys)) {
    const value = await vaultGet(client, vaultKey);
    if (value) resolved[field] = value;
  }

  // Also try the single vault_secret_name (single-credential connectors like Stripe)
  const vaultSecretName =
    typeof connectorData.vault_secret_name === "string" ? connectorData.vault_secret_name : null;
  if (Object.keys(resolved).length === 0 && vaultSecretName) {
    const primary = await vaultGet(client, vaultSecretName);
    if (primary) {
      // Determine the field name from config.connector_type_detail
      const connType =
        typeof cfg.connector_type_detail === "string"
          ? cfg.connector_type_detail
          : typeof cfg.connector_type === "string"
            ? cfg.connector_type
            : "";
      const primaryFieldMap: Record<string, string> = {
        stripe: "stripeApiKey",
        hubspot: "privateAppToken",
        xero: "clientSecret",
      };
      const field = primaryFieldMap[connType] ?? "apiKey";
      resolved[field] = primary;
    }
  }

  // Embedded credentials in config (non-vaulted fallback)
  const embedded = isRecord(cfg.credentials) ? cfg.credentials : {};
  for (const [field, value] of Object.entries(embedded)) {
    if (!resolved[field] && value) resolved[field] = String(value);
  }

  // credential_* prefix pattern
  for (const [key, value] of Object.entries(cfg)) {
    if (key.startsWith("credential_") && value) {
      const field = key.replace("credential_", "");
      if (!resolved[field]) resolved[field] = String(value);
    }
  }

  return resolved;
}
