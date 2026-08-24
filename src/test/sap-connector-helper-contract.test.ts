import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sapPull = readFileSync(
  resolve(process.cwd(), "supabase/functions/connector-sap-pull/index.ts"),
  "utf8",
);

describe("SAP connector shared-helper contracts", () => {
  it("passes organization scope and the stored connector id into hardened throttle preflight", () => {
    expect(sapPull).toContain("const connectorId = typeof body.connector_id");
    expect(sapPull).toContain("const orgId = connector.organization_id as string");
    expect(sapPull).toContain("preflightWait(svc, orgId, connectorId, VENDOR)");
    expect(sapPull).not.toContain("preflightWait(svc, connectorId, VENDOR)");
  });

  it("observes the real HTTP Response through the structured tenant-scoped throttle contract", () => {
    expect(sapPull).toMatch(
      /observeResponse\(svc,\s*\{[\s\S]*?orgId,[\s\S]*?connectorId,[\s\S]*?vendor:\s*VENDOR,[\s\S]*?res[\s\S]*?\}\)/,
    );
    expect(sapPull).not.toMatch(/observeResponse\(svc,\s*connectorId,\s*VENDOR,/);
  });

  it("writes dead letters through the structured tenant-scoped contract", () => {
    expect(sapPull).toMatch(
      /deadLetter\(svc,\s*\{[\s\S]*?orgId,[\s\S]*?connectorId,[\s\S]*?syncRunId:\s*runId,[\s\S]*?payload:[\s\S]*?errorMessage:\s*msg[\s\S]*?\}\)/,
    );
    expect(sapPull).not.toMatch(/deadLetter\(svc,\s*connectorId,\s*orgId,/);
  });
});
