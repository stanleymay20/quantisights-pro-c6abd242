import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("retention-cleanup results dict per-org collision (1M-seat readiness)", () => {
  // results was keyed only by data_category, not by org. Most orgs share
  // the same categories (e.g. "datasets"), so a plain
  // `results[policy.data_category] = {...}` assignment meant each org's
  // policy silently overwrote every earlier org's numbers in the run
  // summary -- the returned/logged totals only ever reflected whichever
  // org was processed last, undercounting more severely as org count (and
  // therefore same-category collisions per run) grows. Deletions
  // themselves were always correctly org-scoped via .eq("organization_id",
  // ...) -- only the observability summary was wrong.
  const source = read("supabase/functions/retention-cleanup/index.ts");

  it("accumulates deleted/error counts per category across orgs instead of overwriting", () => {
    expect(source).toContain("const categoryResult = results[policy.data_category] ?? { deleted: 0, errors: 0 };");
    expect(source).toContain("categoryResult.deleted += totalDeleted;");
    expect(source).not.toMatch(/results\[policy\.data_category\] = \{ deleted: totalDeleted/);
  });

  it("tracks an error count and last error message rather than a single overwritten error field", () => {
    expect(source).toContain("errors: number; last_error?: string");
    expect(source).toContain("categoryResult.errors += 1;");
  });
});
