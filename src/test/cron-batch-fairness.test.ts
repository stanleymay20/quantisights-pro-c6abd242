import { describe, expect, it } from "vitest";
import { makeDeadline, rotateForFairness, DEFAULT_CRON_BUDGET_MS } from "../../supabase/functions/_shared/cron-batch";

describe("makeDeadline", () => {
  it("is not expired before the budget elapses", () => {
    const d = makeDeadline(Date.now(), 100_000);
    expect(d.expired()).toBe(false);
    expect(d.remainingMs()).toBeGreaterThan(0);
  });

  it("is expired once the budget has elapsed", () => {
    const d = makeDeadline(Date.now() - 200_000, 100_000);
    expect(d.expired()).toBe(true);
    expect(d.remainingMs()).toBe(0);
  });

  it("defaults to a budget comfortably under Supabase's edge function wall-clock ceiling", () => {
    expect(DEFAULT_CRON_BUDGET_MS).toBeLessThan(150_000);
    expect(DEFAULT_CRON_BUDGET_MS).toBeGreaterThan(0);
  });
});

describe("rotateForFairness", () => {
  const items = ["a", "b", "c", "d", "e"];

  it("returns the same order when the tick hasn't advanced", () => {
    const t = 1_000_000;
    expect(rotateForFairness(items, t, 86_400_000)).toEqual(
      rotateForFairness(items, t + 1000, 86_400_000),
    );
  });

  it("advances the starting offset as the tick advances, covering every item over enough ticks", () => {
    const intervalMs = 86_400_000; // one day
    const seen = new Set<string>();
    for (let day = 0; day < items.length; day++) {
      const rotated = rotateForFairness(items, day * intervalMs, intervalMs);
      // Only the first element of each day's rotation would survive a
      // budget that only fits one item -- simulates a permanently
      // overloaded cron that can only make it through item 0 each tick.
      seen.add(rotated[0]);
    }
    expect(seen.size).toBe(items.length);
  });

  it("is a true rotation: same elements, same length, no duplicates or drops", () => {
    const rotated = rotateForFairness(items, 12_345, 1000);
    expect(rotated).toHaveLength(items.length);
    expect(new Set(rotated)).toEqual(new Set(items));
  });

  it("handles an empty list without throwing", () => {
    expect(rotateForFairness([], Date.now(), 1000)).toEqual([]);
  });
});
