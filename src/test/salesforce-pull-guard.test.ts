import { describe, expect, it } from "vitest";

import {
  normalizeSalesforceObjects,
  parseSalesforcePullRequest,
  parseSalesforceQueryPage,
  safeSalesforceHttpError,
  validateSalesforceCursor,
} from "../../supabase/functions/_shared/salesforce-pull-guard";

describe("Salesforce pull request guard", () => {
  it("accepts only supported modes", () => {
    expect(parseSalesforcePullRequest({ connector_id: " c-1 ", mode: "incremental_sync" })).toEqual({
      connectorId: "c-1",
      mode: "incremental_sync",
    });
    expect(() => parseSalesforcePullRequest({ connector_id: "c-1", mode: "fast" })).toThrow(
      "mode must be historical_backfill or incremental_sync",
    );
  });

  it("normalizes configured objects against the governance allowlist", () => {
    expect(
      normalizeSalesforceObjects(
        ["account", "Opportunity", "ACCOUNT"],
        ["Account"],
        ["Account", "Opportunity"],
      ),
    ).toEqual(["Account", "Opportunity"]);
    expect(() => normalizeSalesforceObjects(["User/../../"], [], ["User"])).toThrow(
      "invalid Salesforce object name",
    );
    expect(() => normalizeSalesforceObjects(["Pricebook2"], [], ["Account"])).toThrow(
      "Salesforce object not allowed",
    );
  });
});

describe("Salesforce checkpoint guard", () => {
  it("accepts UTC Salesforce datetime literals", () => {
    expect(validateSalesforceCursor("2026-08-14T18:40:03Z")).toBe("2026-08-14T18:40:03Z");
    expect(validateSalesforceCursor("2026-08-14T18:40:03.123Z")).toBe("2026-08-14T18:40:03.123Z");
  });

  it("fails closed on corrupted or injectable checkpoint text", () => {
    expect(() => validateSalesforceCursor("2026-08-14T18:40:03Z OR Name != null")).toThrow(
      "not a valid UTC datetime literal",
    );
    expect(() => validateSalesforceCursor("not-a-date")).toThrow("not a valid UTC datetime literal");
  });
});

describe("Salesforce query page guard", () => {
  it("accepts object records and Salesforce query-more paths", () => {
    expect(
      parseSalesforceQueryPage({
        records: [{ Id: "001" }],
        done: false,
        nextRecordsUrl: "/services/data/v60.0/query/01gABC_def-123",
      }),
    ).toEqual({
      records: [{ Id: "001" }],
      done: false,
      nextRecordsUrl: "/services/data/v60.0/query/01gABC_def-123",
    });
  });

  it("rejects malformed records and unsafe pagination URLs", () => {
    expect(() => parseSalesforceQueryPage({ records: "bad" })).toThrow("missing records array");
    expect(() =>
      parseSalesforceQueryPage({ records: [], nextRecordsUrl: "https://evil.example/query/1" }),
    ).toThrow("nextRecordsUrl is invalid");
    expect(() =>
      parseSalesforceQueryPage({ records: [], done: true, nextRecordsUrl: "/services/data/v60.0/query/abc" }),
    ).toThrow("done=true with nextRecordsUrl");
  });

  it("redacts Salesforce error bodies down to status and safe error code", () => {
    expect(
      safeSalesforceHttpError(400, [
        { errorCode: "MALFORMED_QUERY", message: "SELECT secret__c FROM Account" },
      ]),
    ).toBe("Salesforce SOQL 400 MALFORMED_QUERY");
    expect(safeSalesforceHttpError(503, "upstream body with secrets")).toBe("Salesforce SOQL 503");
  });
});
