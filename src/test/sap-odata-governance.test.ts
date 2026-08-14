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

  it("rejects path injection and genuine service mismatches before URL construction", () => {
    expect(() =>
      assertOdataQuerySafe(
        "API_SALES_ORDER_SRV",
        entity({ service: "API_SALES_ORDER_SRV", entity_set: "A_SalesOrder/../../$metadata" }),
        governance(),
      ),
    ).toThrow("entity_set contains invalid OData identifier characters");

    expect(() =>
      assertOdataQuerySafe(
        "API_SALES_ORDER_SRV",
        entity({ service: "API_BUSINESS_PARTNER" }),
        governance(),
      ),
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
      "https://sap.example.com/root/",
      "V2",
      "API_SALES_ORDER_SRV",
      entity({
        service: "API_SALES_ORDER_SRV",
        entity_set: "A_SalesOrder",
        filter: "SalesOrganization eq '1000'",
        expand: "to_Item",
        order_by: "SalesOrder desc",
      }),
      250,
      "cursor+/=",
    );

    expect(url.startsWith("https://sap.example.com/root/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?")).toBe(true);
    expect(url).toContain("%24top=250");
    expect(url).toContain("%24select=SalesOrder%2CTotalNetAmount");
    expect(url).toContain("%24skiptoken=cursor%2B%2F%3D");
  });

  it("never resolves arbitrary non-SAP runtime secrets from connector config", async () => {
    const get = vi.fn((name: string) => (name === "SUPABASE_SERVICE_ROLE_KEY" ? "platform-secret" : undefined));
    vi.stubGlobal("Deno", { env: { get } });

    await expect(
      buildSapAuthHeaders({
        kind: "api_key",
        header_name: "x-api-key",
        value_secret: "SUPABASE_SERVICE_ROLE_KEY",
      }),
    ).rejects.toThrow("SAP secret reference must use an SAP_* environment variable");
    expect(get).not.toHaveBeenCalled();
  });

  it("resolves SAP-namespaced secrets for basic auth", async () => {
    const get = vi.fn((name: string) => (name === "SAP_PASSWORD" ? "p@ss" : undefined));
    vi.stubGlobal("Deno", { env: { get } });

    await expect(
      buildSapAuthHeaders({ kind: "basic", username: "svc-user", password_secret: "SAP_PASSWORD" }),
    ).resolves.toMatchObject({ Accept: "application/json" });
    expect(get).toHaveBeenCalledWith("SAP_PASSWORD");
  });

  it("does not echo OAuth response bodies into token-exchange errors", async () => {
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => (name === "SAP_CLIENT_SECRET" ? "client-secret" : undefined) },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "invalid_client",
            error_description: "sensitive backend details must not be surfaced",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    await expect(
      buildSapAuthHeaders({
        kind: "oauth2_cc",
        token_url: "https://auth.sap.example.com/oauth/token",
        client_id: "client-id",
        client_secret_secret: "SAP_CLIENT_SECRET",
      }),
    ).rejects.toThrow("SAP token exchange failed [401] invalid_client");
  });

  it("returns only object rows and extracts safe skip tokens", () => {
    expect(extractRows({ d: { results: [{ id: 1 }, null, "x"] } }, "V2")).toEqual([{ id: 1 }]);
    expect(extractRows({ value: [{ id: 2 }, 3] }, "V4")).toEqual([{ id: 2 }]);
    expect(
      extractNextLink(
        { d: { __next: "https://sap.example.com/path?$skiptoken=abc%2B123&$top=10" } },
        "V2",
      ),
    ).toBe("abc+123");
  });

  it("parses metadata without untyped result objects", () => {
    const metadata = parseMetadataXml(`
      <Schema>
        <EntityType Name="A_SalesOrderType">
          <Key><PropertyRef Name="SalesOrder" /></Key>
          <Property Name="SalesOrder" Type="Edm.String" Nullable="false" MaxLength="10" />
          <NavigationProperty Name="to_Item" Type="Collection(API_SALES_ORDER_SRV.A_SalesOrderItemType)" />
        </EntityType>
        <EntityContainer>
          <EntitySet Name="A_SalesOrder" EntityType="API_SALES_ORDER_SRV.A_SalesOrderType" />
        </EntityContainer>
      </Schema>
    `);

    expect(metadata).toHaveLength(1);
    expect(metadata[0]).toMatchObject({
      entity_type: "A_SalesOrderType",
      entity_sets: ["A_SalesOrder"],
      key_fields: ["SalesOrder"],
      fields: [{ name: "SalesOrder", type: "Edm.String", nullable: false, max_length: 10 }],
      navigation_properties: [{ name: "to_Item", target: "A_SalesOrderItemType" }],
    });
  });
});
