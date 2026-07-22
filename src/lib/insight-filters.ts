import type { Insight } from "@/hooks/useInsights";

/**
 * Canonical filter for critical/elevated insights.
 * SINGLE SOURCE OF TRUTH — all components must use this instead of inline filters.
 */
export function filterCriticalInsights(insights: Insight[]): Insight[] {
  return insights.filter(
    (i) => i.severity === "high" || i.severity === "medium"
  );
}

/** Count of critical signals — convenience for display */
export function countCriticalSignals(insights: Insight[]): number {
  return filterCriticalInsights(insights).length;
}
