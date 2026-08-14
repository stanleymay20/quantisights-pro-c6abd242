import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertOdataQuerySafe,
  buildOdataUrl,
  buildSapAuthHeaders,
  extractNextLink,
  extractRows,
  normalizeSapBaseUrl,
  normalizeSapTokenUrl,
  parseMetadataXml,
  type SapEntityPull,
  type SapGovernance,
} from "../../supabase/functions/_shared/sap-odata";

const entity = (overrides: Partial<SapEntityPull> = {}): SapEntityPull => ({
  service: "api_sales_order_srv",
  entity_set: "a_salesorder",
  select: ["SalesOrder", "TotalNetAmount"],
  canonical: {
    entity_type: "sales_order",
    external_id_field: "SalesOrder",
  },
  ...overrides,
});

const governance = (overrides: Partial<SapGovernance> = {}): SapGovernance => ({
  allowed_services: ["API_SALES_ORDER_SRV"],
  allowed_entities: { API_SALES_ORDER_SRV: ["A_SalesOrder"] },
  allowed_fields: {
    API_SALES_ORDER_SRV: {
      A_SalesOrder: ["SalesOrder", "TotalNetAmount"],
    },
  },
  ...overrides,
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SAP OData governance", () => {
  it("enforces entity and field allowlists case-insensitively", () => {
    expect(
      assertOdataQuerySafe("api_sales_order_srv", entity(), governance()),
    ).toEqual({ url_path: "api_sales_order_srv/a_salesorder", top: 5000 });

    expect(() =>
      assertOdataQuerySafe(
        "api_sales_order_srv",
        entity({ select: ["SalesOrder", "SecretField"] }),
        governance(),
      ),
    ).toThrow("field not in allowlist");
  });

  it("rejects path injection and service mismatches before URL construction", () => {
    expect(() =>
      assertOdataQuerySafe(
        "API_SALES_ORDER_SRV",
        entity({ service: "API_SALES_ORDER_SRV", entity_set: "A_SalesOrder/../../$metadata" }),
        governance(),
      ),
    ).toThrow("entity_set contains invalid OData identifier characters");

    expect(() =>
      assertOdataQuerySafe("API_SALES_ORDER_SRV", entity(), governance()),
    ).toThrow("entity service mismatch");
  });

  it("normalizes invalid numeric caps into safe positive bounds", () => {
    expect(
      assertOdataQuerySafe(
        "api_sales_order_srv",
        entity({ top: -20 }),
        governance({ max_top: Number.NaN, max_expand_depth: Number.NaN }),
      ).top,
    ).toBe(1);

    expect(
      assertOdataQuerySafe(
        "api_sales_order_srv",
        entity({ top: 999_999 }),
        governance({ max_top: 999_999 }),
      ).top,
    ).toBe(50_000);
  });

  it("requires HTTPS base/token URLs and rejects embedded credentials", () => {
    expect(() => normalizeSapBaseUrl("http://sap.example.com")).toThrow("must use HTTPS");
    expect(() => normalizeSapBaseUrl("https://user:pass@sap.example.com")).toThrow(
      "must not contain embedded credentials",
    );
    expect(() => normalizeSapTokenUrl("http://auth.example.com/token")).toThrow("must use HTTPS");
    expect(normalizeSapBaseUrl("https://sap.example.com/root/")).toBe("https://sap.example.com/root");
  });

  it("builds encoded, bounded OData URLs only after path validation", () => {
    const url = buildOdataUrl(
      "https://sap.example.com",
      "V2",
      "API_SALES_ORDER_SRV",
      entity({
        service: "API_SALES_ORDER_SRV",
        entity_set: "A_SalesOrder",
        filter: "SalesOrganization eq 'DE01'",
      }),
      999_999,
      "next token",
    );
    expect(url).toContain("%24top=50000");
    expect(url).toContain("%24filter=SalesOrganization+eq+%27DE01%27");
    expect(url).toContain("%24skiptoken=next+token");
  });
});

describe("SAP auth boundary", () => {
  it("never resolves arbitrary non-SAP runtime secrets from connector config", async () => {
    const get = vi.fn(() => "platform-secret");
    vi.stubGlobal("Deno", { env: { get } });

    await expect(
      buildSapAuthHeaders({
        kind: "basic",
        username: "sap-user",
        password_secret: "SUPABASE_SERVICE_ROLE_KEY",
      }),
    ).rejects.toThrow("SAP secret reference must use an SAP_* environment variable");
    expect(get).not.toHaveBeenCalled();
  });

  it("resolves SAP-namespaced secrets for basic auth", async () => {
    const get = vi.fn((name: string) => (name === "SAP_PASSWORD" ? "pw" : undefined));
    vi.stubGlobal("Deno", { env: { get } });

    const headers = await buildSapAuthHeaders({
      kind: "basic",
      username: "sap-user",
      password_secret: "SAP_PASSWORD",
    });
    expect(headers.Authorization).toBe(`Basic ${btoa("sap-user:pw")}`);
    expect(get).toHaveBeenCalledWith("SAP_PASSWORD");
  });

  it("does not echo OAuth response bodies into token-exchange errors", async () => {
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => (name === "SAP_CLIENT_SECRET" ? "client-secret" : undefined) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: "invalid_client", detail: "do-not-log-this-body" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      buildSapAuthHeaders({
        kind: "oauth2_cc",
        token_url: "https://auth.example.com/oauth/token",
        client_id: "client-id",
        client_secret_secret: "SAP_CLIENT_SECRET",
      }),
    ).rejects.toThrow("SAP token exchange failed [401] invalid_client");
  });
});

describe("SAP response parsing", () => {
  it("returns only object rows and extracts safe skip tokens", () => {
    expect(
      extractRows({ d: { results: [{ id: 1 }, null, "bad", { id: 2 }] } }, "V2"),
    ).toEqual([{ id: 1 }, { id: 2 }]);
    expect(extractRows({ value: [{ id: 3 }, 4] }, "V4")).toEqual([{ id: 3 }]);
    expect(
      extractNextLink({ "@odata.nextLink": "https://sap.example.com/x?$skiptoken=a%2Fb" }, "V4"),
    ).toBe("a/b");
  });

  it("parses metadata without untyped result objects", () => {
    const xml = `
      <Schema Namespace="Demo">
        <EntityType Name="SalesOrder">
          <Key><PropertyRef Name="SalesOrder" /></Key>
          <Property Name="SalesOrder" Type="Edm.String" Nullable="false" MaxLength="10" />
          <NavigationProperty Name="Items" Type="Collection(Demo.Item)" />
        </EntityType>
        <EntityContainer Name="Container">
          <EntitySet Name="A_SalesOrder" EntityType="Demo.SalesOrder" />
        </EntityContainer>
      </Schema>`;

    expect(parseMetadataXml(xml)).toEqual([
      {
        entity_type: "SalesOrder",
        entity_sets: ["A_SalesOrder"],
        key_fields: ["SalesOrder"],
        fields: [{ name: "SalesOrder", type: "Edm.String", nullable: false, max_length: 10 }],
        navigation_properties: [{ name: "Items", target: "Collection(Demo.Item)" }],
      },
    ]);
  });
});
