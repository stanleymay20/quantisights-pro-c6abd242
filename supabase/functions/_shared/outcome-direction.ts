export type ExpectedOutcomeDirection = "increase" | "decrease" | "stable";

const LOWER_IS_BETTER_PATTERNS = [
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

export function inferExpectedOutcomeDirection(metric: string | null | undefined): ExpectedOutcomeDirection {
  const normalized = (metric ?? "").toLowerCase().replace(/[_-]+/g, " ");
  return LOWER_IS_BETTER_PATTERNS.some(pattern => pattern.test(normalized))
    ? "decrease"
    : "increase";
}

export function normalizeExpectedOutcomeDirection(
  direction: unknown,
  metric: string | null | undefined,
): ExpectedOutcomeDirection {
  return direction === "increase" || direction === "decrease" || direction === "stable"
    ? direction
    : inferExpectedOutcomeDirection(metric);
}

export function outcomeSucceededForDirection(
  observedChange: unknown,
  direction: ExpectedOutcomeDirection | null | undefined,
  tolerance = 1,
): boolean | null {
  if (!direction) return null;
  const delta = Number(observedChange);
  if (!Number.isFinite(delta)) return null;
  if (direction === "increase") return delta > tolerance;
  if (direction === "decrease") return delta < -tolerance;
  return Math.abs(delta) <= tolerance;
}

/**
 * Convert an expected magnitude into a signed percentage change so forecast
 * accuracy compares like with like. A user may enter 10 with direction=decrease;
 * the predicted signed change is therefore -10, not +10.
 */
export function signedExpectedChange(
  expectedChange: unknown,
  direction: ExpectedOutcomeDirection,
): number | null {
  const magnitude = Number(expectedChange);
  if (!Number.isFinite(magnitude) || magnitude === 0) return null;
  if (direction === "decrease") return -Math.abs(magnitude);
  if (direction === "increase") return Math.abs(magnitude);
  return 0;
}
