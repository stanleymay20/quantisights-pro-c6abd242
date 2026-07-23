// Performance budgets enforced by the certification harness.
// Budgets reflect the Phase 7 requirements; values are intentionally
// generous to remain stable across CI hardware variability.

export interface PerformanceBudget {
  rows: number;
  parseBudgetMs: number;
}

export const PERFORMANCE_BUDGETS: PerformanceBudget[] = [
  { rows: 100_000, parseBudgetMs: 30_000 },
  { rows: 500_000, parseBudgetMs: 60_000 },
  { rows: 1_000_000, parseBudgetMs: 120_000 },
];

/** Allowed memory-estimate regression before the gate fails. */
export const MEMORY_REGRESSION_TOLERANCE = 0.15;

/** Worker responsiveness target — no main-thread task should exceed this. */
export const MAX_MAIN_THREAD_BLOCK_MS = 50;

export function budgetForRows(rows: number): number {
  const match = [...PERFORMANCE_BUDGETS]
    .sort((a, b) => a.rows - b.rows)
    .find((b) => rows <= b.rows);
  return match?.parseBudgetMs ?? PERFORMANCE_BUDGETS[PERFORMANCE_BUDGETS.length - 1].parseBudgetMs;
}
