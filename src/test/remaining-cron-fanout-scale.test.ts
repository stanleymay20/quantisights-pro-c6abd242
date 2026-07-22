import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("remaining cron org fan-out (1M-seat readiness, tranche 2)", () => {
  // Same flaw as the first tranche (aicis-auto-decisions, retention-cleanup,
  // morning-brief): an unbounded sequential loop over every org inside one
  // Deno.serve invocation, with no time budget or rotation. pipeline-
  // orchestrator was audited too but found already safe -- it processes a
  // bounded batch of 20 overdue schedules per run, and each processed
  // schedule's next_run_at is pushed to the future on completion (success,
  // retry, or permanent failure), so it self-rotates out of contention
  // without needing this treatment.

  it("aicis-evaluate-outcomes bounds its org loop with a deadline and rotates the starting point", () => {
    const source = read("supabase/functions/aicis-evaluate-outcomes/index.ts");
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(startedAt)");
    expect(source).toContain("rotateForFairness(orgsToProcess, startedAt, RUN_INTERVAL_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
    expect(source).toContain("truncated");
  });

  it("evaluate-outcomes bounds its cron org loop with a deadline and rotates the starting point", () => {
    const source = read("supabase/functions/evaluate-outcomes/index.ts");
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(cronStartedAt)");
    expect(source).toContain("rotateForFairness(orgs || [], cronStartedAt, RUN_INTERVAL_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
    expect(source).toContain("truncated");
  });

  it("adaptive-calibration bounds its cron org loop with a deadline and rotates the starting point", () => {
    const source = read("supabase/functions/adaptive-calibration/index.ts");
    expect(source).toContain('import { makeDeadline, rotateForFairness } from "../_shared/cron-batch.ts"');
    expect(source).toContain("makeDeadline(cronStartedAt)");
    expect(source).toContain("rotateForFairness(orgs || [], cronStartedAt, RUN_INTERVAL_MS)");
    expect(source).toContain("if (deadline.expired()) break;");
    expect(source).toContain("truncated");
  });

  it("pipeline-orchestrator is confirmed already self-rotating (bounded batch + future next_run_at)", () => {
    const source = read("supabase/functions/pipeline-orchestrator/index.ts");
    expect(source).toContain(".limit(20)");
    expect(source).toContain("next_run_at: nextRun.toISOString()");
    expect(source).toContain("next_run_at: retryAt.toISOString()");
  });
});
