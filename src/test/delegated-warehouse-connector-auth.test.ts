import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const connectorPaths = [
  "supabase/functions/connector-bigquery-pull/index.ts",
  "supabase/functions/connector-snowflake-pull/index.ts",
  "supabase/functions/connector-s3-pull/index.ts",
] as const;

describe("delegated warehouse connector authorization", () => {
  for (const path of connectorPaths) {
    it(`${path} authorizes the connector tenant before circuit or external work`, () => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain('import { authorizeConnectorInvocation } from "../_shared/connector-invocation-auth.ts"');
      expect(source).toContain("serviceRoleKey");
      expect(source).toContain("organizationId: connector.organization_id");

      const connectorLookup = source.indexOf('.from("data_connectors")');
      const authorize = source.indexOf("authorizeConnectorInvocation({");
      const circuitGate = source.indexOf("const gate = await shouldAllow");

      expect(connectorLookup).toBeGreaterThan(-1);
      expect(authorize).toBeGreaterThan(connectorLookup);
      expect(circuitGate).toBeGreaterThan(authorize);
    });
  }
});
