import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveConnectorCredentials } from "../../supabase/functions/_shared/connector-credentials";

type FakeConnector = Record<string, unknown>;

type FakeClientOptions = {
  connector: FakeConnector | null;
  connectorId?: string;
  secrets?: Record<string, string>;
  vaultErrors?: Set<string>;
};

function makeClient({
  connector,
  connectorId = "connector-1",
  secrets = {},
  vaultErrors = new Set<string>(),
}: FakeClientOptions) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    const secretName = String(args._secret_name ?? "");
    if (vaultErrors.has(secretName)) {
      return { data: null, error: { message: "vault unavailable" } };
    }
    return { data: secrets[secretName] ?? null, error: null };
  });

  const single = vi.fn(async () => ({ data: connector, error: connector ? null : { message: "missing" } }));
  const eq = vi.fn((_column: string, value: string) => ({
    single: value === connectorId
      ? single
      : vi.fn(async () => ({ data: null, error: { message: "missing" } })),
  }));
  const select = vi.fn((_columns: string) => ({ eq }));
  const from = vi.fn((_table: string) => ({ select }));

  return { client: { rpc, from }, rpc, from, select, eq, single };
}

describe("connector credential resolution", () => {
  it("keeps Vault values authoritative while filling missing fields from embedded credentials", async () => {
    const fake = makeClient({
      connector: {
        config: { credentials: { apiKey: "embedded", region: "eu" } },
        credential_vault_keys: { apiKey: "vault-api-key" },
        vault_secret_name: null,
      },
      secrets: { "vault-api-key": "vault-value" },
    });

    await expect(resolveConnectorCredentials(fake.client, "connector-1")).resolves.toEqual({
      apiKey: "vault-value",
      region: "eu",
    });
    expect(fake.rpc).toHaveBeenCalledWith("get_connector_secret", {
      _secret_name: "vault-api-key",
    });
  });

  it("supports the legacy config.vault_keys mapping when the dedicated column is absent", async () => {
    const fake = makeClient({
      connector: {
        config: {
          vault_keys: { token: "legacy-vault-token" },
          credentials: { token: "embedded-token", account: "acct-1" },
        },
        credential_vault_keys: null,
        vault_secret_name: null,
      },
      secrets: { "legacy-vault-token": "vault-token" },
    });

    await expect(resolveConnectorCredentials(fake.client, "connector-1")).resolves.toEqual({
      token: "vault-token",
      account: "acct-1",
    });
  });

  it("maps single Stripe vault secrets to stripeApiKey and does not let embedded data overwrite them", async () => {
    const fake = makeClient({
      connector: {
        config: {
          connector_type_detail: "stripe",
          credentials: { stripeApiKey: "embedded-stripe" },
        },
        credential_vault_keys: {},
        vault_secret_name: "stripe-primary",
      },
      secrets: { "stripe-primary": "vault-stripe" },
    });

    await expect(resolveConnectorCredentials(fake.client, "connector-1")).resolves.toEqual({
      stripeApiKey: "vault-stripe",
    });
  });

  it("falls back to embedded and credential_* fields when Vault lookup fails", async () => {
    const fake = makeClient({
      connector: {
        config: {
          credentials: { apiKey: "embedded-api" },
          credential_region: "eu-central",
        },
        credential_vault_keys: { apiKey: "broken-vault-key" },
        vault_secret_name: null,
      },
      vaultErrors: new Set(["broken-vault-key"]),
    });

    await expect(resolveConnectorCredentials(fake.client, "connector-1")).resolves.toEqual({
      apiKey: "embedded-api",
      region: "eu-central",
    });
  });

  it("never reads Vault when the requested connector cannot be resolved", async () => {
    const fake = makeClient({
      connector: {
        config: {},
        credential_vault_keys: { apiKey: "vault-api-key" },
      },
      connectorId: "connector-1",
      secrets: { "vault-api-key": "should-not-be-read" },
    });

    await expect(resolveConnectorCredentials(fake.client, "other-connector")).resolves.toEqual({});
    expect(fake.rpc).not.toHaveBeenCalled();
  });

  it("fails closed for malformed service clients", async () => {
    await expect(resolveConnectorCredentials(null, "connector-1")).resolves.toEqual({});
    await expect(resolveConnectorCredentials({}, "connector-1")).resolves.toEqual({});
  });

  it("keeps the credential helper free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/connector-credentials.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
  });
});
