import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("morning-brief scale bugs (1M-seat readiness)", () => {
  const source = read("supabase/functions/morning-brief/index.ts");

  // auth.admin.listUsers() defaults to page 1 / 50 users with no pagination
  // params. Calling it once per org meant (a) most of the platform's users
  // were invisible past the first 50 signups -- their org's brief email
  // silently never sent -- and (b) it re-fetched the same page from the
  // admin API once per org regardless. Fixed by paging through every user
  // exactly once, before the org loop, into a lookup map.
  it("no longer calls listUsers() inside the per-org loop", () => {
    const orgLoopStart = source.indexOf("for (const org of rotatedOrgs)");
    const orgLoopEnd = source.indexOf("\n    }\n\n    const truncated");
    const loopBody = source.slice(orgLoopStart, orgLoopEnd === -1 ? undefined : orgLoopEnd);
    expect(loopBody).not.toContain("listUsers(");
  });

  it("pages through listUsers() until exhausted instead of relying on the default single page", () => {
    expect(source).toContain("listUsers({ page, perPage })");
    expect(source).toMatch(/while \(true\)/);
    expect(source).toContain("page++");
  });

  // A single Deno.serve invocation has a wall-clock ceiling; an unbounded
  // loop over every org gets killed mid-run once org count is large enough,
  // and without rotation the same prefix of orgs wins every single day
  // while the tail never gets a brief.
  it("bounds the org loop with a time budget and rotates the starting point daily", () => {
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(startedAt)");
    expect(source).toContain("rotateForFairness(orgs, startedAt, DAY_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
  });

  it("reports truncation so an overloaded run is observable, not silent", () => {
    expect(source).toContain("truncated");
    expect(source).toContain("orgs_processed");
  });
});
