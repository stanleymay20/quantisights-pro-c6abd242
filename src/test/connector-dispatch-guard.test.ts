import { describe, expect, it } from "vitest";

import {
  assertDispatchIdentityMatches,
  deriveStoredConnectorIdentity,
  parseConnectorDispatchRequest,
} from "../../supabase/functions/_shared/connector-dispatch-guard";

const connectorId = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const dataSourceId = "33333333-3333-4333-8333-333333333333";

describe("connector dispatcher request parsing", () => {
  it("uses connector_id as the authoritative requested identifier", () => {
    expect(
      parseConnectorDispatchRequest({
        connector_id: connectorId,
        connector_type: "salesforce",
        organization_id: orgId,
      }),
    ).toMatchObject({ connectorId, requestedType: "salesforce", requestedOrganizationId: orgId });
  });

  it("accepts data_source_id only as a legacy connector-id alias", () => {
    expect(parseConnectorDispatchRequest({ data_source_id: connectorId }).connectorId).toBe(connectorId);
  });

  it("rejects malformed identity fields", () => {
    expect(() => parseConnectorDispatchRequest({ connector_id: "not-a-uuid" })).toThrow(
      "connector_id must be a UUID",
    );
    expect(() =>
      parseConnectorDispatchRequest({ connector_id: connectorId, organization_id: "other-org" }),
    ).toThrow("organization_id must be a UUID");
  });
});

describe("stored connector identity", () => {
  it("derives tenant, type and linked data source from the stored record", () => {
    expect(
      deriveStoredConnectorIdentity({
        id: connectorId,
        organization_id: orgId,
        connector_type: "hubspot",
        data_source_id: dataSourceId,
        config: {},
      }),
    ).toEqual({
      id: connectorId,
      organizationId: orgId,
      connectorType: "hubspot",
      dataSourceId,
    });
  });

  it("uses connector_type_detail only for an explicit legacy rest_api fallback", () => {
    expect(
      deriveStoredConnectorIdentity({
        id: connectorId,
        organization_id: orgId,
        connector_type: "rest_api",
        config: { connector_type_detail: "netsuite" },
      }).connectorType,
    ).toBe("netsuite");

    expect(
      deriveStoredConnectorIdentity({
        id: connectorId,
        organization_id: orgId,
        connector_type: "salesforce",
        config: { connector_type_detail: "hubspot" },
      }).connectorType,
    ).toBe("salesforce");
  });

  it("rejects client identity disagreements instead of trusting them", () => {
    const stored = deriveStoredConnectorIdentity({
      id: connectorId,
      organization_id: orgId,
      connector_type: "salesforce",
      data_source_id: dataSourceId,
    });
    expect(() =>
      assertDispatchIdentityMatches(
        parseConnectorDispatchRequest({ connector_id: connectorId, connector_type: "hubspot" }),
        stored,
      ),
    ).toThrow("connector_type does not match stored connector");
    expect(() =>
      assertDispatchIdentityMatches(
        parseConnectorDispatchRequest({
          connector_id: connectorId,
          organization_id: "44444444-4444-4444-8444-444444444444",
        }),
        stored,
      ),
    ).toThrow("organization_id does not match stored connector");
  });
});
