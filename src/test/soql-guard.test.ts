import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  assertSoqlSafe,
  parseSoql,
  redactHeaders,
} from "../../supabase/functions/_shared/soql-guard";

const governance = {
  allowed_objects: ["Account", "Contact"],
  allowed_fields: {
    Account: ["Id", "Name"],
    Contact: ["Id", "Email"],
  },
  max_query_cost: 500,
};

describe("SOQL governance", () => {
  it("injects a bounded outer LIMIT when none is present", () => {
    const validated = assertSoqlSafe("SELECT Id, Name FROM Account WHERE Name = 'Acme'", governance);
    expect(validated.limit).toBe(500);
    expect(validated.query).toBe("SELECT Id, Name FROM Account WHERE Name = 'Acme' LIMIT 500");
  });

  it("caps an oversized outer LIMIT while preserving OFFSET", () => {
    const validated = assertSoqlSafe("SELECT Id FROM Account LIMIT 5000 OFFSET 20", governance);
    expect(validated.limit).toBe(500);
    expect(validated.query).toBe("SELECT Id FROM Account LIMIT 500 OFFSET 20");
  });

  it("does not mistake LIMIT text inside a string literal for the outer query bound", () => {
    const raw = "SELECT Id FROM Account WHERE Name = 'LIMIT 999999'";
    expect(parseSoql(raw).limit).toBeNull();
    const validated = assertSoqlSafe(raw, governance);
    expect(validated.limit).toBe(500);
    expect(validated.query).toBe(`${raw} LIMIT 500`);
  });

  it("enforces field allowlists even when the object casing differs", () => {
    expect(() => assertSoqlSafe("SELECT Secret_Field__c FROM account", governance)).toThrow(
      "field not in allowlist for account: Secret_Field__c",
    );
    expect(assertSoqlSafe("SELECT id, name FROM account", governance).object).toBe("account");
  });

  it("blocks tooling/admin objects even if a caller puts them in the object allowlist", () => {
    expect(() =>
      assertSoqlSafe("SELECT Id FROM PermissionSet", {
        allowed_objects: ["PermissionSet"],
        allowed_fields: { PermissionSet: ["Id"] },
      }),
    ).toThrow("object forbidden (tooling/admin): PermissionSet");
  });

  it("rejects non-SELECT statements, multiple statements, and disallowed subqueries", () => {
    expect(() => assertSoqlSafe("DELETE FROM Account", governance)).toThrow("only SELECT is allowed");
    expect(() => assertSoqlSafe("SELECT Id FROM Account; SELECT Id FROM Contact", governance)).toThrow(
      "multiple statements not allowed",
    );
    expect(() =>
      assertSoqlSafe("SELECT Id, (SELECT Id FROM Contacts) FROM Account", governance),
    ).toThrow("SOQL field disallowed");
  });

  it("redacts credential-bearing headers without changing safe headers", () => {
    expect(
      redactHeaders({
        Authorization: "Bearer secret",
        "x-api-key": "secret-key",
        Cookie: "session=secret",
        Accept: "application/json",
      }),
    ).toEqual({
      Authorization: "[redacted]",
      "x-api-key": "[redacted]",
      Cookie: "[redacted]",
      Accept: "application/json",
    });
  });

  it("keeps the guard free of type-check suppression and explicit any", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/soql-guard.ts"),
      "utf8",
    );
    expect(source).not.toContain("@ts-nocheck");
    expect(source).not.toMatch(/\bany\b/);
    expect(source).toContain("fieldAllowlistForObject");
    expect(source).toContain("OUTER_LIMIT_PATTERN");
  });
});
