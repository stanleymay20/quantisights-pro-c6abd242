export type ExpectedOutcomeDirection = "increase" | "decrease" | "stable";

/**
 * Infer the desired direction of a KPI when no explicit direction was supplied.
 *
 * This is intentionally conservative: only well-known lower-is-better metric
 * names are mapped to "decrease". Everything else preserves the historical
 * "increase" default until the caller supplies an explicit contract.
 */
export function inferExpectedOutcomeDirection(metric: string | null | undefined): ExpectedOutcomeDirection {
  const normalized = (metric ?? "").toLowerCase().replace(/[_-]+/g, " ");
  const decreasePatterns = [
    /\bchurn\b/,
    /\bcost\b/,
    /\bexpense\b/,
    /\bspend\b/,
    /\bburn\b/,
    /\brisk\b/,
    /\bmortality\b/,
    /\breadmission\b/,
    /\bincident\b/,
    /\binjury\b/,
    /\bfraud\b/,
    /\bdowntime\b/,
    /\boutage\b/,
    /\bdefect\b/,
    /\berror\b/,
    /\bfailure\b/,
    /\bemission\b/,
    /\bcarbon\b/,
    /\blatency\b/,
    /\bcycle\s*time\b/,
    /\blead\s*time\b/,
    /\bresponse\s*time\b/,
    /\bvacancy\b/,
    /\battrition\b/,
    /\bcomplaint\b/,
    /\breturn\s*rate\b/,
    /\bloss\b/,
    /\bvariance\b/,
    /\bvolatility\b/,
  ];

  return decreasePatterns.some(pattern => pattern.test(normalized)) ? "decrease" : "increase";
}

export function outcomeSucceededForDirection(
  deltaValue: unknown,
  direction: ExpectedOutcomeDirection | null | undefined,
): boolean | null {
  if (!direction) return null;
  const delta = Number(deltaValue);
  if (!Number.isFinite(delta)) return null;
  if (direction === "increase") return delta > 0;
  if (direction === "decrease") return delta < 0;
  return Math.abs(delta) <= 1;
}
