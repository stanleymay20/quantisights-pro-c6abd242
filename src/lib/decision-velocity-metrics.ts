/**
 * Evidence-backed decision timing over already-authorized decision_ledger rows.
 *
 * This is NOT event-detection latency or externally verified business execution.
 * Timestamps represent canonical internal lifecycle milestones only.
 * Missing, malformed, or reversed timestamps cannot become a reassuring 0.
 */
export interface DecisionVelocityRecord {
  created_at: string | null;
  decided_at: string | null;
  decision_status: string;
  execution_started_at: string | null;
  execution_completed_at: string | null;
}

export interface VelocityThresholds {
  improvingThreshold: number;
  degradingThreshold: number;
  minDecisionsForTrend: number;
  slowWarningDays: number;
}

export interface TimedSample {
  medianDays: number | null;
  count: number;
}

export type VelocityTrend = "improving" | "stable" | "degrading" | "insufficient";

export interface DecisionVelocitySummary {
  timeToDecision: TimedSample;
  internalExecutionTime: TimedSample;
  internalCycleTime: TimedSample;
  pendingAge: TimedSample;
  pendingCount: number;
  trend: VelocityTrend;
  invalidRecordCount: number;
  missingDecisionTimeCount: number;
  observedRows: number;
}

const DAY_MS = 86_400_000;

function parseTimestamp(value: string | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isPresent(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function sample(values: number[]): TimedSample {
  return { medianDays: median(values), count: values.length };
}

export function formatVelocityDays(days: number | null): string {
  if (days === null || !Number.isFinite(days) || days < 0) return "—";
  const minutes = days * 24 * 60;
  if (minutes === 0) return "0 min";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${days.toFixed(1)} d`;
}

/**
 * The caller must supply org-scoped records from a successful query.
 * This function does not create an organizational or historical benchmark.
 */
export function calculateDecisionVelocity(
  decisions: readonly DecisionVelocityRecord[],
  nowMs: number,
  thresholds: VelocityThresholds,
): DecisionVelocitySummary {
  const decisionDurations: number[] = [];
  const internalDurations: number[] = [];
  const cycleDurations: number[] = [];
  const pendingAges: number[] = [];
  const chronologicalDecisions: Array<{ created: number; duration: number }> = [];
  let invalidRecordCount = 0;
  let missingDecisionTimeCount = 0;
  let pendingCount = 0;

  for (const row of decisions) {
    const created = parseTimestamp(row.created_at);
    const decided = parseTimestamp(row.decided_at);
    const started = parseTimestamp(row.execution_started_at);
    const completed = parseTimestamp(row.execution_completed_at);
    const timestamps = [
      [row.created_at, created],
      [row.decided_at, decided],
      [row.execution_started_at, started],
      [row.execution_completed_at, completed],
    ] as const;
    let invalid = timestamps.some(([raw, parsed]) => isPresent(raw) && parsed === null);

    // A later lifecycle milestone must not precede an earlier recorded one.
    if ((created !== null && decided !== null && decided < created)
      || (decided !== null && started !== null && started < decided)
      || (started !== null && completed !== null && completed < started)
      || (created !== null && completed !== null && completed < created)) {
      invalid = true;
    }

    const pending = row.decision_status === "pending";
    if (pending && (created === null || !Number.isFinite(nowMs) || nowMs < created)) {
      invalid = true;
    }

    // Exclude malformed or reversed event sequences from every aggregate,
    // rather than reporting valid-looking timings from a corrupted row.
    if (invalid) {
      invalidRecordCount += 1;
      if (pending) pendingCount += 1;
      continue;
    }

    if (pending) {
      pendingCount += 1;
      pendingAges.push((nowMs - created!) / DAY_MS);
    } else if (created !== null && decided !== null && decided >= created) {
      const days = (decided - created) / DAY_MS;
      decisionDurations.push(days);
      chronologicalDecisions.push({ created, duration: days });
    } else {
      missingDecisionTimeCount += 1;
    }

    // A complete *internal* execution duration requires an ordered decided ->
    // started -> completed chain. It does not prove an external provider acted.
    if (row.decision_status !== "pending" && decided !== null && started !== null
      && completed !== null && started >= decided && completed >= started) {
      internalDurations.push((completed - started) / DAY_MS);
      if (created !== null && decided >= created) {
        cycleDurations.push((completed - created) / DAY_MS);
      }
    }


  }

  // Database callers retrieve newest-first. Sort explicitly by *created* time;
  // otherwise the trend would label slower newer decisions as "accelerating".
  chronologicalDecisions.sort((a, b) => a.created - b.created);
  let trend: VelocityTrend = "insufficient";
  const minimum = Math.max(4, Math.ceil(thresholds.minDecisionsForTrend));
  if (chronologicalDecisions.length >= minimum) {
    const half = Math.floor(chronologicalDecisions.length / 2);
    const oldMedian = median(chronologicalDecisions.slice(0, half).map((x) => x.duration));
    const newMedian = median(chronologicalDecisions.slice(half).map((x) => x.duration));
    if (oldMedian !== null && newMedian !== null && oldMedian > 0
      && Number.isFinite(thresholds.improvingThreshold)
      && Number.isFinite(thresholds.degradingThreshold)) {
      trend = newMedian < oldMedian * thresholds.improvingThreshold
        ? "improving"
        : newMedian > oldMedian * thresholds.degradingThreshold
          ? "degrading"
          : "stable";
    }
  }

  return {
    timeToDecision: sample(decisionDurations),
    internalExecutionTime: sample(internalDurations),
    internalCycleTime: sample(cycleDurations),
    pendingAge: sample(pendingAges),
    pendingCount,
    trend,
    invalidRecordCount,
    missingDecisionTimeCount,
    observedRows: decisions.length,
  };
}
