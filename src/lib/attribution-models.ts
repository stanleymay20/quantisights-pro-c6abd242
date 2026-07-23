/**
 * Attribution Models (Ch 6)
 * 
 * Implements incremental lift calculation, attribution window models,
 * and temporal join logic for measuring decision impact.
 * 
 * Book concepts:
 * - Last-touch attribution
 * - First-touch attribution
 * - Linear (equal-weight) attribution
 * - Time-decay attribution
 * - Incremental lift calculation
 * - Attribution window management
 */

// ─── Types ───

export interface TouchPoint {
  id: string;
  timestamp: string;
  type: string;         // "advisory" | "decision" | "execution" | "intervention"
  entityId: string;
  weight?: number;      // Manual weight override
  metadata?: Record<string, unknown>;
}

export interface AttributionResult {
  touchPointId: string;
  credit: number;       // 0-1, sum across all results = 1
  model: string;
  timestamp: string;
  type: string;
}

export interface LiftResult {
  metric: string;
  baselineValue: number;
  currentValue: number;
  absoluteLift: number;
  relativeLift: number;       // percentage
  confidence: number;         // statistical confidence
  attributionWindow: number;  // days
  isSignificant: boolean;     // p < 0.05 equivalent
}

// ─── Attribution Models ───

/**
 * Last-Touch Attribution
 * 100% credit to the most recent touchpoint before conversion.
 */
export function lastTouchAttribution(touchPoints: TouchPoint[]): AttributionResult[] {
  if (touchPoints.length === 0) return [];
  const sorted = [...touchPoints].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  return sorted.map((tp, i) => ({
    touchPointId: tp.id,
    credit: i === 0 ? 1 : 0,
    model: "last_touch",
    timestamp: tp.timestamp,
    type: tp.type,
  }));
}

/**
 * First-Touch Attribution
 * 100% credit to the first touchpoint in the journey.
 */
export function firstTouchAttribution(touchPoints: TouchPoint[]): AttributionResult[] {
  if (touchPoints.length === 0) return [];
  const sorted = [...touchPoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return sorted.map((tp, i) => ({
    touchPointId: tp.id,
    credit: i === 0 ? 1 : 0,
    model: "first_touch",
    timestamp: tp.timestamp,
    type: tp.type,
  }));
}

/**
 * Linear Attribution
 * Equal credit distributed across all touchpoints.
 */
export function linearAttribution(touchPoints: TouchPoint[]): AttributionResult[] {
  if (touchPoints.length === 0) return [];
  const credit = 1 / touchPoints.length;
  return touchPoints.map((tp) => ({
    touchPointId: tp.id,
    credit,
    model: "linear",
    timestamp: tp.timestamp,
    type: tp.type,
  }));
}

/**
 * Time-Decay Attribution (Ch 6)
 * More credit to touchpoints closer to conversion.
 * Uses exponential decay: w_i = e^(-λ * Δt_i)
 */
export function timeDecayAttribution(
  touchPoints: TouchPoint[],
  halfLifeDays: number = 7
): AttributionResult[] {
  if (touchPoints.length === 0) return [];

  const sorted = [...touchPoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const latestTs = new Date(sorted[sorted.length - 1].timestamp).getTime();
  const lambda = Math.LN2 / (halfLifeDays * 86400000); // decay constant

  const weights = sorted.map((tp) => {
    const dt = latestTs - new Date(tp.timestamp).getTime();
    return Math.exp(-lambda * dt);
  });

  const totalWeight = weights.reduce((s, w) => s + w, 0);

  return sorted.map((tp, i) => ({
    touchPointId: tp.id,
    credit: totalWeight > 0 ? weights[i] / totalWeight : 1 / sorted.length,
    model: "time_decay",
    timestamp: tp.timestamp,
    type: tp.type,
  }));
}

/**
 * Position-Based (U-Shaped) Attribution
 * 40% to first, 40% to last, 20% distributed among middle.
 */
export function positionBasedAttribution(touchPoints: TouchPoint[]): AttributionResult[] {
  if (touchPoints.length === 0) return [];
  if (touchPoints.length === 1) return [{ touchPointId: touchPoints[0].id, credit: 1, model: "position_based", timestamp: touchPoints[0].timestamp, type: touchPoints[0].type }];

  const sorted = [...touchPoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const middleCount = sorted.length - 2;
  const middleCredit = middleCount > 0 ? 0.2 / middleCount : 0;

  return sorted.map((tp, i) => ({
    touchPointId: tp.id,
    credit: i === 0 ? 0.4 : i === sorted.length - 1 ? 0.4 : middleCredit,
    model: "position_based",
    timestamp: tp.timestamp,
    type: tp.type,
  }));
}

// ─── Incremental Lift Calculation (Ch 6) ───

/**
 * Calculate incremental lift from a decision/action.
 * Compares treatment (post-decision) vs control (pre-decision baseline).
 */
export function calculateIncrementalLift(
  baselineValues: number[],
  treatmentValues: number[],
  metricName: string,
  windowDays: number = 30
): LiftResult {
  const baselineMean = mean(baselineValues);
  const treatmentMean = mean(treatmentValues);
  const absoluteLift = treatmentMean - baselineMean;
  const relativeLift = baselineMean !== 0 ? (absoluteLift / Math.abs(baselineMean)) * 100 : 0;

  // Welch's t-test for significance
  const baselineVar = variance(baselineValues);
  const treatmentVar = variance(treatmentValues);
  const n1 = baselineValues.length;
  const n2 = treatmentValues.length;
  const se = Math.sqrt(baselineVar / n1 + treatmentVar / n2);
  const tStat = se > 0 ? Math.abs(absoluteLift / se) : 0;

  // Approximate p-value using t-distribution (df via Welch-Satterthwaite)
  const confidence = tStat > 1.96 ? 0.95 : tStat > 1.645 ? 0.90 : tStat > 1.28 ? 0.80 : 0.5;

  return {
    metric: metricName,
    baselineValue: baselineMean,
    currentValue: treatmentMean,
    absoluteLift,
    relativeLift,
    confidence,
    attributionWindow: windowDays,
    isSignificant: tStat > 1.96,
  };
}

// ─── Attribution Window Management ───

export interface AttributionWindow {
  lookbackDays: number;
  lookforwardDays: number;
  exclusionDays: number;  // Days to exclude after decision (implementation lag)
}

/**
 * Filter touchpoints within an attribution window.
 */
export function filterByWindow(
  touchPoints: TouchPoint[],
  conversionDate: string,
  window: AttributionWindow
): TouchPoint[] {
  const convTs = new Date(conversionDate).getTime();
  const lookbackMs = window.lookbackDays * 86400000;
  const exclusionMs = window.exclusionDays * 86400000;

  return touchPoints.filter((tp) => {
    const tpTs = new Date(tp.timestamp).getTime();
    const delta = convTs - tpTs;
    return delta >= exclusionMs && delta <= lookbackMs;
  });
}

// ─── Multi-Model Comparison ───

export type AttributionModel = "last_touch" | "first_touch" | "linear" | "time_decay" | "position_based";

export function runAllModels(touchPoints: TouchPoint[]): Record<AttributionModel, AttributionResult[]> {
  return {
    last_touch: lastTouchAttribution(touchPoints),
    first_touch: firstTouchAttribution(touchPoints),
    linear: linearAttribution(touchPoints),
    time_decay: timeDecayAttribution(touchPoints),
    position_based: positionBasedAttribution(touchPoints),
  };
}

// ─── Helpers ───

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
}
