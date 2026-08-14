import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sapPull = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-sap-pull/index.ts"),
  "utf8",
);

describe("SAP connector shared-helper contracts", () => {
  it("passes organization scope into the hardened throttle preflight", () => {
    expect(sapPull).toContain("preflightWait(svc, orgId, connector_id, VENDOR)");
    expect(sapPull).not.toContain("preflightWait(svc, connector_id, VENDOR)");
  });

  it("observes the real HTTP Response through the structured throttle contract", () => {
    expect(sapPull).toMatch(
      /observeResponse\(svc,\s*\{[\s\S]*?orgId,[\s\S]*?connectorId:\s*connector_id,[\s\S]*?vendor:\s*VENDOR,[\s\S]*?res,[\s\S]*?\}\)/,
    );
    expect(sapPull).not.toMatch(/observeResponse\(svc,\s*connector_id,\s*VENDOR,/);
  });

  it("writes dead letters through the structured tenant-scoped contract", () => {
    expect(sapPull).toMatch(
      /deadLetter\(svc,\s*\{[\s\S]*?orgId,[\s\S]*?connectorId:\s*connector_id,[\s\S]*?syncRunId:[\s\S]*?payload:[\s\S]*?errorMessage:\s*msg,[\s\S]*?\}\)/,
    );
    expect(sapPull).not.toMatch(/deadLetter\(svc,\s*connector_id,\s*orgId,/);
  });
});
