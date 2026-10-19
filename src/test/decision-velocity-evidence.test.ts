import { describe, expect, it } from "vitest";
import {
  calculateDecisionVelocity,
  formatVelocityDays,
  type DecisionVelocityRecord,
  type VelocityThresholds,
} from "@/lib/decision-velocity-metrics";

const thresholds: VelocityThresholds = {
  improvingThreshold: 0.85,
  degradingThreshold: 1.15,
  minDecisionsForTrend: 4,
  slowWarningDays: 5,
};

const HOUR = 3_600_000;
const now = Date.parse("2026-10-19T12:00:00.000Z");

function record(
  created: string,
  decided: string | null,
  started: string | null = null,
  completed: string | null = null,
  status = "approved",
): DecisionVelocityRecord {
  return {
    created_at: created,
    decided_at: decided,
    decision_status: status,
    execution_started_at: started,
    execution_completed_at: completed,
  };
}

describe("Decision velocity: canonical lifecycle evidence", () => {
  it("distinguishes internal decision, internal execution and full internal cycle", () => {
    const r = calculateDecisionVelocity([
      record(
        "2026-10-18T00:00:00Z",
        "2026-10-18T10:00:00Z",
        "2026-10-18T12:00:00Z",
        "2026-10-18T14:00:00Z",
      ),
    ], now, thresholds);

    expect(r.timeToDecision.count).toBe(1);
    expect(r.timeToDecision.medianDays! * 24).toBeCloseTo(10);
    expect(r.decisionToExecutionStart.count).toBe(1);
    expect(r.decisionToExecutionStart.medianDays! * 24).toBeCloseTo(2);
    expect(r.internalExecutionTime.medianDays! * 24).toBeCloseTo(2);
    expect(r.internalCycleTime.medianDays! * 24).toBeCloseTo(14);
    expect(r.invalidRecordCount).toBe(0);
  });

  it("does not equate a missing timestamp or pending decision with a zero-minute outcome", () => {
    const r = calculateDecisionVelocity([
      record("2026-10-18T12:00:00Z", null, null, null, "pending"),
      record("2026-10-17T12:00:00Z", null),
    ], now, thresholds);
    expect(r.observedRows).toBe(2);
    expect(r.pendingCount).toBe(1);
    expect(r.pendingAge.medianDays).toBe(1);
    expect(r.missingDecisionTimeCount).toBe(1);
    expect(r.timeToDecision).toEqual({ medianDays: null, count: 0 });
    expect(r.internalExecutionTime.medianDays).toBeNull();
    expect(r.decisionToExecutionStart.medianDays).toBeNull();
    expect(r.trend).toBe("insufficient");
  });

  it("rejects malformed, reversed and internally inconsistent event rows", () => {
    const r = calculateDecisionVelocity([
      record("not-a-date", "2026-10-18T02:00:00Z"),
      record("2026-10-18T08:00:00Z", "2026-10-18T07:00:00Z"),
      record("2026-10-18T00:00:00Z", "2026-10-18T04:00:00Z",
        "2026-10-18T03:00:00Z", "2026-10-18T05:00:00Z"),
    ], now, thresholds);
    expect(r.invalidRecordCount).toBe(3);
    expect(r.timeToDecision.count).toBe(0);
    expect(r.internalExecutionTime.count).toBe(0);
    expect(r.internalCycleTime.count).toBe(0);
    expect(r.timeToDecision.medianDays).toBeNull();
  });

  it("detects slowing from chronological timestamps even when query rows are newest first", () => {
    const start = Date.parse("2026-10-01T00:00:00Z");
    const rows = [1, 1, 9, 9].map((hours, index) => {
      const created = start + index * 2 * 24 * HOUR;
      return record(new Date(created).toISOString(), new Date(created + hours * HOUR).toISOString());
    });
    expect(calculateDecisionVelocity([...rows].reverse(), now, thresholds).trend).toBe("degrading");
    expect(calculateDecisionVelocity([...rows], now, thresholds).trend).toBe("degrading");
  });

  it("reports acceleration when recent decisions are actually quicker", () => {
    const start = Date.parse("2026-10-01T00:00:00Z");
    const rows = [9, 9, 1, 1].map((hours, index) => {
      const created = start + index * 2 * 24 * HOUR;
      return record(new Date(created).toISOString(), new Date(created + hours * HOUR).toISOString());
    });
    expect(calculateDecisionVelocity([...rows].reverse(), now, thresholds).trend).toBe("improving");
  });

  it("uses a median rather than a mean distorted by outliers", () => {
    const start = Date.parse("2026-10-01T00:00:00Z");
    const rows = [1, 2, 3, 100].map((hours, index) => {
      const created = start + index * 24 * HOUR;
      return record(new Date(created).toISOString(), new Date(created + hours * HOUR).toISOString());
    });
    const r = calculateDecisionVelocity(rows, now, thresholds);
    expect(r.timeToDecision.medianDays! * 24).toBeCloseTo(2.5);
  });

  it("never claims a trend with insufficient samples or a zero old baseline", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      record(`2026-10-0${i + 1}T00:00:00Z`, `2026-10-0${i + 1}T00:00:00Z`));
    expect(calculateDecisionVelocity(rows, now, thresholds).trend).toBe("insufficient");
    expect(calculateDecisionVelocity(rows.slice(0, 3), now, thresholds).trend).toBe("insufficient");
  });

  it("keeps missing duration unknown rather than showing a false success", () => {
    expect(formatVelocityDays(null)).toBe("—");
    expect(formatVelocityDays(Number.NaN)).toBe("—");
    expect(formatVelocityDays(-1)).toBe("—");
    expect(formatVelocityDays(0)).toBe("0 min");
    expect(formatVelocityDays(0.5 / (24 * 60))).toBe("<1 min");
    expect(formatVelocityDays(2 / 24)).toBe("2.0 h");
  });
});
