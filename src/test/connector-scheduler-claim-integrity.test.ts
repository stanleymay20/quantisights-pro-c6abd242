import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const scheduler = read("supabase/functions/connector-scheduler/index.ts");
const ci = read(".github/workflows/ci.yml");

describe("connector scheduler claim integrity", () => {
  it("does not suppress TypeScript checking", () => {
    expect(scheduler).not.toContain("@ts-nocheck");
    expect(ci).toContain("deno check --config supabase/functions/deno.json supabase/functions/connector-scheduler/index.ts");
  });

  it("requires a returned compare-and-swap claim before dispatch", () => {
    expect(scheduler).toContain('.eq("next_run_at", sched.next_run_at)');
    expect(scheduler).toContain('.eq("organization_id", sched.organization_id)');
    expect(scheduler).toContain('.select("id")');
    expect(scheduler).toContain("!claimed?.id");

    const claimCheck = scheduler.indexOf("!claimed?.id");
    const dispatch = scheduler.indexOf("await fetch(url");
    expect(claimCheck).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(claimCheck);
  });

  it("scopes connector lookup to the schedule organization", () => {
    const lookup = scheduler.indexOf('.from("data_connectors")');
    const dispatch = scheduler.indexOf("await fetch(url");
    expect(lookup).toBeGreaterThan(-1);
    expect(dispatch).toBeGreaterThan(lookup);
    expect(scheduler.slice(lookup, dispatch)).toContain('.eq("organization_id", sched.organization_id)');
  });

  it("does not report a failed HTTP dispatch as successfully dispatched", () => {
    expect(scheduler).toContain("if (!response.ok)");
    expect(scheduler).toContain("dispatch returned non-success status");
    const responseCheck = scheduler.indexOf("if (!response.ok)");
    const successPush = scheduler.indexOf("dispatched.push(sched.connector_id)", responseCheck);
    expect(successPush).toBeGreaterThan(responseCheck);
  });
});
