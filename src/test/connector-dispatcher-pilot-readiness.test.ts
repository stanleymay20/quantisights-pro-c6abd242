import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-pull/index.ts"),
  "utf8",
);

describe("connector dispatcher paid-pilot invariants", () => {
  it("derives connector identity from data_connectors before authorization and side effects", () => {
    const storedLookup = source.indexOf('.from("data_connectors")');
    const deriveIdentity = source.indexOf("deriveStoredConnectorIdentity(storedConnector)");
    const authorize = source.indexOf("authorizeConnectorInvocation({");
    const syncJob = source.indexOf('.from("data_sync_jobs")');
    expect(storedLookup).toBeGreaterThan(-1);
    expect(deriveIdentity).toBeGreaterThan(storedLookup);
    expect(authorize).toBeGreaterThan(deriveIdentity);
    expect(syncJob).toBeGreaterThan(authorize);
  });

  it("treats client organization/type as mismatch checks, not authoritative routing fields", () => {
    expect(source).toContain("parseConnectorDispatchRequest");
    expect(source).toContain("assertDispatchIdentityMatches(dispatchRequest, identity)");
    expect(source).toContain("connector_type: identity.connectorType");
    expect(source).toContain("organization_id: identity.organizationId");
    expect(source).not.toContain("const { connector_type, data_source_id, organization_id } = config");
  });

  it("uses the stored linked data-source id for sync bookkeeping", () => {
    expect(source).toContain("if (!identity.dataSourceId)");
    expect(source).toContain("data_source_id: identity.dataSourceId");
    expect(source).toContain("Connector is not linked to a data source");
  });

  it("delegates Salesforce and HubSpot with the server-derived connector id", () => {
    expect(source).toContain('hubspot: "connector-hubspot-pull"');
    expect(source).toContain('salesforce: "connector-salesforce-pull"');
    expect(source).toContain("async function runDelegatedConnector(");
    expect(source).toContain("body: JSON.stringify({ connector_id: connectorId })");

    const delegatedCall = source.indexOf("result = await runDelegatedConnector(");
    const storedId = source.indexOf("identity.id", delegatedCall);
    expect(delegatedCall).toBeGreaterThan(-1);
    expect(storedId).toBeGreaterThan(delegatedCall);
  });

  it("bounds delegated requests and fails audit/bookkeeping errors closed", () => {
    expect(source).toContain("AbortSignal.timeout(120_000)");

    const bookkeepingCheck = source.indexOf("if (jobUpdateError)");
    const bookkeepingFailure = source.indexOf("503, corsHeaders", bookkeepingCheck);
    const auditCheck = source.indexOf("if (auditError)");
    const auditFailure = source.indexOf("503, corsHeaders", auditCheck);

    expect(bookkeepingCheck).toBeGreaterThan(-1);
    expect(bookkeepingFailure).toBeGreaterThan(bookkeepingCheck);
    expect(auditCheck).toBeGreaterThan(bookkeepingFailure);
    expect(auditFailure).toBeGreaterThan(auditCheck);
  });
});
