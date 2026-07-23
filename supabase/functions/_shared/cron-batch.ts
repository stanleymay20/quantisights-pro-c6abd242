// Shared helpers for cron jobs that fan out over every tenant (org, policy,
// user, ...) inside a single serverless invocation. Two problems compound
// as tenant count grows:
//
//  1. A single Deno.serve invocation has a hard wall-clock ceiling. An
//     unbounded sequential loop over all tenants eventually gets killed
//     mid-run, with no record of how far it got and no graceful handoff
//     to the next tick.
//  2. Without a time budget, a truncated loop always starts from index 0.
//     If the full tenant list can't fit in one invocation's budget,
//     whichever tenants sort last in the query NEVER get processed --
//     not occasionally, but forever, no matter how many times the cron
//     ticks -- because the same prefix wins the race every time.
//
// makeDeadline() bounds a single invocation so it returns cleanly instead
// of being killed. rotateForFairness() changes the starting offset each
// tick so sustained overload spreads the unserviced tail across runs
// instead of permanently starving it. Rotation is a throughput/fairness
// mechanism, not a correctness one -- callers must still be safe to
// re-run a tenant that was only partially processed (the crons this is
// applied to are already idempotent: dedup-by-content, delete-where,
// upsert-by-conflict-key).

// Conservative default: comfortably under Supabase Edge Functions' wall-clock
// ceiling (150s on Pro-tier project settings), leaving headroom for the
// final response write and any in-flight request.
export const DEFAULT_CRON_BUDGET_MS = 100_000;

export interface Deadline {
  expired(): boolean;
  remainingMs(): number;
}

export function makeDeadline(startedAtMs: number, budgetMs: number = DEFAULT_CRON_BUDGET_MS): Deadline {
  const deadlineAt = startedAtMs + budgetMs;
  return {
    expired: () => Date.now() >= deadlineAt,
    remainingMs: () => Math.max(0, deadlineAt - Date.now()),
  };
}

/**
 * Rotate `items` so the starting offset advances by one position each
 * `intervalMs` window. Deterministic and stateless (no cursor to persist) --
 * two invocations in the same window rotate identically, but consecutive
 * windows shift the starting point, so a list too large to fully process
 * in one budget still gets full coverage over enough ticks.
 */
export function rotateForFairness<T>(items: readonly T[], nowMs: number, intervalMs: number): T[] {
  if (items.length === 0) return [];
  const tick = Math.floor(nowMs / intervalMs);
  const offset = tick % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}
