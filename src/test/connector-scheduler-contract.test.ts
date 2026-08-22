import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scheduler = readFileSync("supabase/functions/connector-scheduler/index.ts", "utf8");

describe("connector scheduler dispatch contract", () => {
  it("routes the certified HubSpot connector through the governed dispatcher", () => {
    expect(scheduler).toContain('case "hubspot":');
    expect(scheduler).toContain('return "connector-pull";');
  });

  it("uses exact service-role bearer authentication for governed connector dispatch", () => {
    expect(scheduler).toContain('Authorization: `Bearer ${serviceKey}`');
  });

  it("does not advance a schedule before confirming a dispatch target exists", () => {
    const targetResolution = scheduler.indexOf("const fnName = pickFunction(cRow.connector_type);");
    const scheduleClaim = scheduler.indexOf("const { data: claimed, error: claimErr } = await svc");
    expect(targetResolution).toBeGreaterThan(-1);
    expect(scheduleClaim).toBeGreaterThan(-1);
    expect(targetResolution).toBeLessThan(scheduleClaim);
  });

  it("keeps Salesforce out of scheduled dispatch while OAuth provisioning is uncertified", () => {
    expect(scheduler).not.toMatch(/case\s+["']salesforce["']/);
  });
});
