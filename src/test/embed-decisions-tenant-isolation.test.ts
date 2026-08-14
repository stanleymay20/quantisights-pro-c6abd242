import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/embed-decisions/index.ts"),
  "utf8",
);

describe("embed-decisions tenant isolation", () => {
  it("accepts service-role traffic only by exact bearer-token match", () => {
    expect(source).toContain('const isServiceRoleCall = authHeader === `Bearer ${serviceKey}`;');
    expect(source).not.toContain("authHeader?.includes(serviceKey)");
  });

  it("requires organization membership for every user-initiated embedding request", () => {
    expect(source).toContain('svc.rpc("is_org_member"');
    expect(source).toContain("_user_id: userId");
    expect(source).toContain("_org_id: organization_id");
    expect(source).toContain('JSON.stringify({ error: "Forbidden" })');
  });

  it("checks membership before tenant decision-memory queries", () => {
    const membershipCheck = source.indexOf('svc.rpc("is_org_member"');
    const decisionRead = source.indexOf('.from("decision_ledger")');
    const insightRead = source.indexOf('.from("insights")');

    expect(membershipCheck).toBeGreaterThan(-1);
    expect(decisionRead).toBeGreaterThan(membershipCheck);
    expect(insightRead).toBeGreaterThan(membershipCheck);
  });
});
