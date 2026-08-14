import { describe, expect, it } from "vitest";

import {
  normalizeSalesforceDiscoveryObjects,
  parseSalesforceDescribe,
} from "../../supabase/functions/_shared/salesforce-discovery";

describe("Salesforce discovery target normalization", () => {
  it("uses defaults when objects are omitted", () => {
    expect(normalizeSalesforceDiscoveryObjects(undefined, ["Account", "Contact"])).toEqual({
      objects: ["Account", "Contact"],
      skipped: [],
    });
  });

  it("deduplicates case-insensitively and safely skips malformed values", () => {
    expect(
      normalizeSalesforceDiscoveryObjects(
        ["Account", "account", "Bad/Object", { object: "Contact" }, "Contact"],
        [],
      ),
    ).toEqual({
      objects: ["Account", "Contact"],
      skipped: ["account(duplicate)", "Bad/Object", "(invalid object name)"],
    });
  });

  it("rejects unbounded discovery fan-out", () => {
    expect(() =>
      normalizeSalesforceDiscoveryObjects(["Account", "Contact", "Case"], [], 2),
    ).toThrow("at most 2 objects");
  });

  it("normalizes an invalid max-object cap to the safe default", () => {
    expect(
      normalizeSalesforceDiscoveryObjects(["Account"], [], Number.NaN).objects,
    ).toEqual(["Account"]);
  });
});

describe("Salesforce describe parsing", () => {
  it("validates and preserves safe field/relationship metadata", () => {
    expect(
      parseSalesforceDescribe({
        custom: true,
        fields: [
          {
            name: "AccountId",
            type: "reference",
            nillable: false,
            length: 18,
            custom: false,
            referenceTo: ["Account"],
            relationshipName: "Account",
          },
          {
            name: "Amount",
            type: "currency",
            nillable: true,
            length: null,
            custom: false,
            referenceTo: [],
            relationshipName: null,
          },
        ],
        childRelationships: [
          {
            relationshipName: "Contacts",
            childSObject: "Contact",
            field: "AccountId",
            cascadeDelete: false,
          },
        ],
      }),
    ).toEqual({
      custom: true,
      fields: [
        {
          name: "AccountId",
          type: "reference",
          nillable: false,
          length: 18,
          custom: false,
          referenceTo: ["Account"],
          relationshipName: "Account",
        },
        {
          name: "Amount",
          type: "currency",
          nillable: true,
          length: null,
          custom: false,
          referenceTo: [],
          relationshipName: null,
        },
      ],
      relationships: [
        {
          relationshipName: "Contacts",
          childSObject: "Contact",
          field: "AccountId",
          cascadeDelete: false,
        },
      ],
    });
  });

  it("rejects malformed describe payloads instead of persisting partial schemas", () => {
    expect(() => parseSalesforceDescribe({ fields: "not-an-array" })).toThrow("missing fields array");
    expect(() =>
      parseSalesforceDescribe({
        fields: [{ name: "Id", type: "id", nillable: "false", custom: false }],
      }),
    ).toThrow("nillable must be boolean");
    expect(() =>
      parseSalesforceDescribe({
        fields: [{ name: "OwnerId", type: "reference", nillable: false, custom: false, referenceTo: ["User/Bad"] }],
      }),
    ).toThrow("referenceTo contains an invalid object name");
  });

  it("rejects malformed child relationship metadata", () => {
    expect(() =>
      parseSalesforceDescribe({
        fields: [],
        childRelationships: [{ childSObject: "Contact", field: "Account.Id", cascadeDelete: false }],
      }),
    ).toThrow("field contains invalid characters");
  });
});
