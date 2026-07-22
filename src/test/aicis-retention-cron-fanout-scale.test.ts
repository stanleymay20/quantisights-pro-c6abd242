import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("aicis-auto-decisions and retention-cleanup cron fan-out (1M-seat readiness)", () => {
  // Both crons looped over every candidate org/policy sequentially inside
  // one Deno.serve invocation with no time budget. Past a tenant count that
  // exceeds the platform's wall-clock ceiling for a single invocation, the
  // loop gets killed mid-run -- and without rotation, the same fixed-order
  // prefix of orgs/policies would win every single tick while the tail
  // never gets processed, no matter how many times the cron fires.

  it("aicis-auto-decisions bounds its org loop with a deadline and rotates the starting point", () => {
    const source = read("supabase/functions/aicis-auto-decisions/index.ts");
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(startedAt)");
    expect(source).toContain("rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
    expect(source).toContain("truncated");
  });

  it("retention-cleanup bounds its policy loop with a deadline and rotates the starting point", () => {
    const source = read("supabase/functions/retention-cleanup/index.ts");
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(startedAt)");
    expect(source).toContain("rotateForFairness(policies, startedAt, DAY_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
    expect(source).toContain("truncated");
  });
});
