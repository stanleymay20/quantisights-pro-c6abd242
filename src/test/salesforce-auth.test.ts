import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getSalesforceTokens,
  normalizeSalesforceOrigin,
  refreshSalesforceToken,
  salesforceTokenEndpoint,
} from "../../supabase/functions/_shared/salesforce-auth";

type TokenState = {
  vendor: string;
  access_token_vault_name: string | null;
  refresh_token_vault_name: string | null;
  instance_url: string | null;
  expires_at: string | null;
  refresh_failure_count: number;
  quarantined: boolean;
  revoked: boolean;
  rotation_count: number;
};

const baseState = (overrides: Partial<TokenState> = {}): TokenState => ({
  vendor: "salesforce",
  access_token_vault_name: "sf-access",
  refresh_token_vault_name: "sf-refresh",
  instance_url: "https://acme.my.salesforce.com",
  expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
  refresh_failure_count: 0,
  quarantined: false,
  revoked: false,
  rotation_count: 2,
  ...overrides,
});

type FakeOptions = {
  state?: TokenState | null;
  stateReadError?: unknown;
  stateWriteError?: unknown;
  secrets?: Record<string, string | null>;
  vaultReadError?: unknown;
  vaultWriteError?: unknown;
};

function makeWriteBuilder(error: unknown) {
  const promise = Promise.resolve({ error });
  const builder = Object.assign(promise, { eq: vi.fn() });
  builder.eq.mockReturnValue(builder);
  return builder;
}

function makeClient({
  state = baseState(),
  stateReadError = null,
  stateWriteError = null,
  secrets = { "sf-access": "cached-access", "sf-refresh": "refresh-secret" },
  vaultReadError = null,
  vaultWriteError = null,
}: FakeOptions = {}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const vaultWrites: Array<{ name: string; value: string }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    if (name === "get_connector_secret") {
      if (vaultReadError) return { data: null, error: vaultReadError };
      return { data: secrets[String(args._secret_name)] ?? null, error: null };
    }
    if (name === "upsert_vault_secret") {
      if (vaultWriteError) return { data: null, error: vaultWriteError };
      vaultWrites.push({ name: String(args._name), value: String(args._value) });
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });

  const maybeSingle = vi.fn(async () => ({ data: state, error: stateReadError }));
  const selectBuilder = { eq: vi.fn(), maybeSingle };
  selectBuilder.eq.mockReturnValue(selectBuilder);

  const updates: Array<Record<string, unknown>> = [];
  const updateBuilders: ReturnType<typeof makeWriteBuilder>[] = [];
  const update = vi.fn((values: Record<string, unknown>) => {
    updates.push(values);
    const builder = makeWriteBuilder(stateWriteError);
    updateBuilders.push(builder);
    return builder;
  });
  const select = vi.fn(() => selectBuilder);
  const from = vi.fn(() => ({ select, update }));

  return {
    client: { rpc, from },
    rpc,
    rpcCalls,
    vaultWrites,
    from,
    selectBuilder,
    updates,
    updateBuilders,
  };
}

function installDenoEnv(values: Record<string, string | undefined>) {
  vi.stubGlobal("Deno", {
    env: {
      get: (name: string) => values[name],
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Salesforce OAuth token isolation", () => {
  it("accepts Salesforce HTTPS origins and strips paths", () => {
    expect(normalizeSalesforceOrigin("https://login.salesforce.com")).toBe(
      "https://login.salesforce.com",
    );
    expect(normalizeSalesforceOrigin("https://test.salesforce.com/services/data")).toBe(
      "https://test.salesforce.com",
    );
    expect(normalizeSalesforceOrigin("https://acme.my.salesforce.com/path?q=1")).toBe(
      "https://acme.my.salesforce.com",
    );
    expect(salesforceTokenEndpoint(null)).toBe(
      "https://login.salesforce.com/services/oauth2/token",
    );
  });

  it.each([
    "http://login.salesforce.com",
    "https://salesforce.com.evil.example",
    "https://login.salesforce.com@evil.example",
    "https://localhost",
    "https://127.0.0.1",
    "https://login.salesforce.com:8443",
  ])("rejects untrusted Salesforce origins: %s", (url) => {
    expect(() => normalizeSalesforceOrigin(url)).toThrow("Salesforce instance URL");
  });

  it("returns a cached token only after tenant-scoped state lookup and origin validation", async () => {
    const fake = makeClient();

    await expect(
      getSalesforceTokens(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
    ).resolves.toEqual({
      access_token: "cached-access",
      instance_url: "https://acme.my.salesforce.com",
    });

    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(fake.selectBuilder.eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
    expect(fake.rpc).toHaveBeenCalledWith("get_connector_secret", {
      _secret_name: "sf-access",
    });
  });

  it("rejects vendor mismatch, revoked, and quarantined rows before reading Vault", async () => {
    for (const state of [
      baseState({ vendor: "hubspot" }),
      baseState({ revoked: true }),
      baseState({ quarantined: true }),
    ]) {
      const fake = makeClient({ state });
      await expect(
        getSalesforceTokens(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
      ).rejects.toThrow();
      expect(fake.rpc).not.toHaveBeenCalled();
    }
  });

  it("surfaces Vault read failures without incrementing refresh failures or quarantining", async () => {
    const fake = makeClient({ vaultReadError: { message: "vault unavailable" } });

    await expect(
      getSalesforceTokens(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
    ).rejects.toThrow("vault read failed: vault unavailable");
    expect(fake.updates).toHaveLength(0);
  });

  it("quarantines on the fifth failed refresh with organization-scoped persistence", async () => {
    installDenoEnv({
      SALESFORCE_CLIENT_ID: "client-id",
      SALESFORCE_CLIENT_SECRET: "client-secret",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_grant", error_description: "do not persist me" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })),
    );
    const fake = makeClient({ state: baseState({ refresh_failure_count: 4 }) });

    await expect(
      refreshSalesforceToken(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
    ).rejects.toThrow("salesforce token quarantined after repeated refresh failures");

    expect(fake.updates[0]).toMatchObject({
      refresh_failure_count: 5,
      quarantined: true,
      quarantine_reason: "refresh 400 invalid_grant",
    });
    expect(String(fake.updates[0]?.quarantine_reason)).not.toContain("do not persist me");
    const eq = fake.updateBuilders[0]?.eq;
    expect(eq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
  });

  it("rotates tokens, validates the returned instance URL, and persists state in the same tenant", async () => {
    installDenoEnv({
      SALESFORCE_CLIENT_ID: "client-id",
      SALESFORCE_CLIENT_SECRET: "client-secret",
    });
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          instance_url: "https://acme.my.salesforce.com/services/data",
          expires_in: 1800,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fake = makeClient();

    await expect(
      refreshSalesforceToken(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
    ).resolves.toEqual({
      access_token: "new-access",
      instance_url: "https://acme.my.salesforce.com",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://acme.my.salesforce.com/services/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fake.vaultWrites).toEqual([
      { name: "sf-access", value: "new-access" },
      { name: "sf-refresh", value: "new-refresh" },
    ]);
    expect(fake.updates[0]).toMatchObject({
      instance_url: "https://acme.my.salesforce.com",
      rotation_count: 3,
      refresh_failure_count: 0,
      quarantined: false,
    });
    const eq = fake.updateBuilders[0]?.eq;
    expect(eq).toHaveBeenNthCalledWith(1, "connector_id", "connector-1");
    expect(eq).toHaveBeenNthCalledWith(2, "organization_id", "org-1");
  });

  it("rejects an untrusted instance URL returned by Salesforce before writing any token or state", async () => {
    installDenoEnv({
      SALESFORCE_CLIENT_ID: "client-id",
      SALESFORCE_CLIENT_SECRET: "client-secret",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "new-access", instance_url: "https://attacker.example" }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )),
    );
    const fake = makeClient();

    await expect(
      refreshSalesforceToken(fake.client, { orgId: "org-1", connectorId: "connector-1" }),
    ).rejects.toThrow("untrusted Salesforce instance URL");
    expect(fake.vaultWrites).toHaveLength(0);
    expect(fake.updates).toHaveLength(0);
  });

  it("keeps the helper free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/salesforce-auth.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
    expect(source).toContain('.eq("organization_id", orgId)');
    expect(source).toContain("normalizeSalesforceOrigin");
  });
});
