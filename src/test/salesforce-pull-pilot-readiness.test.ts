import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-salesforce-pull/index.ts"),
  "utf8",
);

describe("Salesforce pull pilot-readiness invariants", () => {
  it("does not suppress TypeScript checking", () => {
    expect(source).not.toContain("@ts-nocheck");
  });

  it("validates request, object config, checkpoints and query pages through the hardened guard", () => {
    expect(source).toContain("parseSalesforcePullRequest");
    expect(source).toContain("normalizeSalesforceObjects");
    expect(source).toContain("validateSalesforceCursor");
    expect(source).toContain("parseSalesforceQueryPage");
    expect(source).toContain("safeSalesforceHttpError");
  });

  it("scopes checkpoint reads to the organization and fails persistence errors closed", () => {
    expect(source).toMatch(
      /connector_sync_checkpoints[\s\S]*?\.eq\("organization_id",\s*ctx\.orgId\)[\s\S]*?\.eq\("connector_id",\s*ctx\.connectorId\)/,
    );
    expect(source).toContain("unable to read Salesforce checkpoint");
    expect(source).toContain("unable to persist Salesforce checkpoint");
  });

  it("bounds Salesforce HTTP calls and refuses silent pagination truncation", () => {
    expect(source).toContain("AbortSignal.timeout(FETCH_TIMEOUT_MS)");
    expect(source).toContain("Salesforce pagination exceeded safety cap");
  });

  it("rejects connector-type confusion before token access", () => {
    const typeGuard = source.indexOf('connector.connector_type !== "salesforce"');
    const tokenLookup = source.indexOf("getSalesforceTokens(svc");
    expect(typeGuard).toBeGreaterThan(-1);
    expect(tokenLookup).toBeGreaterThan(typeGuard);
  });
});
