import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-hubspot-pull/index.ts"),
  "utf8",
);

describe("HubSpot pull paid-pilot invariants", () => {
  it("does not suppress TypeScript checking or use a global customer HubSpot API key", () => {
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toContain('Deno.env.get("HUBSPOT_API_KEY")');
    expect(source).toContain("resolveConnectorCredentials(svc, connector_id)");
    expect(source).toContain("credentials.privateAppToken");
  });

  it("authorizes connector tenant membership before execution", () => {
    const authorization = source.indexOf("authorizeConnectorInvocation({");
    const circuitGate = source.indexOf("shouldAllow(svc, orgId, connector_id)");
    expect(authorization).toBeGreaterThan(-1);
    expect(circuitGate).toBeGreaterThan(authorization);
    expect(source).toContain("organizationId: orgId");
  });

  it("rejects connector-type confusion and validates configuration", () => {
    expect(source).toContain('connector.connector_type !== "hubspot"');
    expect(source).toContain("parseHubSpotPullRequest");
    expect(source).toContain("normalizeHubSpotObjects");
    expect(source).toContain("normalizeHubSpotPageSize");
  });

  it("tenant-scopes checkpoints and fails database errors closed", () => {
    expect(source).toMatch(
      /connector_sync_checkpoints[\s\S]*?\.eq\("organization_id",\s*ctx\.orgId\)[\s\S]*?\.eq\("connector_id",\s*ctx\.connectorId\)/,
    );
    expect(source).toContain("unable to read HubSpot checkpoint");
    expect(source).toContain("unable to persist HubSpot checkpoint");
    expect(source).toContain("validateHubSpotCursor");
  });

  it("bounds upstream calls, validates pages, redacts errors, and rejects silent truncation", () => {
    expect(source).toContain("AbortSignal.timeout(FETCH_TIMEOUT_MS)");
    expect(source).toContain("parseHubSpotCollectionPage");
    expect(source).toContain("safeHubSpotHttpError");
    expect(source).toContain("pagination exceeded safety cap");
  });
});
