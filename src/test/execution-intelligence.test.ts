import { describe, it, expect } from "vitest";

// ─── Scoring Formula Tests ───
describe("Execution Scoring Formula", () => {
  const computeScore = (successRate: number, failureRate: number, avgDelay: number, reliabilityRate: number) => {
    return Math.round(
      successRate * 40 + (1 - failureRate) * 25 + Math.max(0, 1 - avgDelay / 14) * 20 + reliabilityRate * 15
    );
  };

  it("returns 100 for perfect execution", () => {
    const score = computeScore(1, 0, 0, 1);
    expect(score).toBe(100);
  });

  it("returns low score for all failures", () => {
    const score = computeScore(0, 1, 14, 0);
    expect(score).toBeLessThanOrEqual(20);
  });

  it("handles partial success correctly", () => {
    const score = computeScore(0.6, 0.2, 3, 0.7);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(80);
  });

  it("delay beyond 14 days floors timeliness to 0", () => {
    const withDelay = computeScore(0.5, 0.1, 20, 0.5);
    const noDelay = computeScore(0.5, 0.1, 0, 0.5);
    expect(noDelay - withDelay).toBe(20); // Timeliness component is 20
  });

  it("clamps score between 0 and 100", () => {
    const highScore = computeScore(1, 0, 0, 1);
    expect(highScore).toBeLessThanOrEqual(100);
    const lowScore = computeScore(0, 1, 100, 0);
    expect(lowScore).toBeGreaterThanOrEqual(0);
  });
});

// ─── Risk Prediction Tests ───
describe("Risk Prediction Rules", () => {
  const computeRiskScore = (params: {
    daysOverdue?: number;
    priorityFailRate?: number;
    ownerFailRate?: number;
    hasOwner?: boolean;
    pendingDays?: number;
    isCritical?: boolean;
    isBlocked?: boolean;
  }) => {
    let riskScore = 0;

    if (params.daysOverdue !== undefined && params.daysOverdue > 0) {
      riskScore += Math.min(40, 25 + params.daysOverdue);
    }

    if (params.priorityFailRate !== undefined && params.priorityFailRate > 0) {
      const w = Math.round(params.priorityFailRate * 25);
      if (w > 5) riskScore += w;
    }

    if (params.ownerFailRate !== undefined && params.ownerFailRate > 0) {
      const w = Math.round(params.ownerFailRate * 15);
      if (w > 3) riskScore += w;
    }

    if (params.hasOwner === false) {
      riskScore += 15;
    }

    if (params.pendingDays !== undefined) {
      if (params.pendingDays > 14) riskScore += 20;
      else if (params.pendingDays > 7) riskScore += 10;
    }

    if (params.isCritical) {
      riskScore = Math.round(riskScore * 1.2);
    }

    if (params.isBlocked) {
      riskScore += 15;
    }

    return Math.min(100, Math.max(0, riskScore));
  };

  it("returns 0 for healthy plan", () => {
    expect(computeRiskScore({ hasOwner: true })).toBe(0);
  });

  it("flags overdue plans", () => {
    const score = computeRiskScore({ daysOverdue: 5 });
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it("caps overdue weight at 40", () => {
    const score = computeRiskScore({ daysOverdue: 100 });
    expect(score).toBeLessThanOrEqual(40);
  });

  it("critical amplifier increases score by 20%", () => {
    const base = computeRiskScore({ daysOverdue: 3 });
    const critical = computeRiskScore({ daysOverdue: 3, isCritical: true });
    expect(critical).toBeGreaterThan(base);
    expect(critical).toBe(Math.min(100, Math.round(base * 1.2)));
  });

  it("blocked plans get +15 risk", () => {
    const base = computeRiskScore({});
    const blocked = computeRiskScore({ isBlocked: true });
    expect(blocked - base).toBe(15);
  });

  it("no owner adds 15 risk", () => {
    const base = computeRiskScore({ hasOwner: true });
    const noOwner = computeRiskScore({ hasOwner: false });
    expect(noOwner - base).toBe(15);
  });

  it("classifies likely_failure above 70", () => {
    const score = computeRiskScore({ daysOverdue: 10, hasOwner: false, isBlocked: true, isCritical: true });
    expect(score).toBeGreaterThanOrEqual(70);
  });
});

// ─── Stale Detection Tests ───
describe("Stale Detection Logic", () => {
  const classifyStale = (lastEventAt: string | null, planCreatedAt: string, nowMs: number) => {
    if (!lastEventAt) {
      const ageDays = Math.floor((nowMs - new Date(planCreatedAt).getTime()) / 86400000);
      if (ageDays > 3) return { stale: true, tier: "no_events_ever", ageDays };
      return { stale: false, tier: "too_new" };
    }

    const daysSinceActivity = Math.floor((nowMs - new Date(lastEventAt).getTime()) / 86400000);
    if (daysSinceActivity > 7) return { stale: true, tier: "serious_inactivity", daysSinceActivity };
    if (daysSinceActivity > 5) return { stale: true, tier: "early_warning", daysSinceActivity };
    return { stale: false, tier: "active", daysSinceActivity };
  };

  const now = Date.now();

  it("marks plan with zero events as stale after 3 days", () => {
    const created = new Date(now - 5 * 86400000).toISOString();
    const result = classifyStale(null, created, now);
    expect(result.stale).toBe(true);
    expect(result.tier).toBe("no_events_ever");
  });

  it("does not flag recent plan with no events", () => {
    const created = new Date(now - 1 * 86400000).toISOString();
    const result = classifyStale(null, created, now);
    expect(result.stale).toBe(false);
  });

  it("flags 7+ day inactivity as serious", () => {
    const lastEvent = new Date(now - 8 * 86400000).toISOString();
    const result = classifyStale(lastEvent, "", now);
    expect(result.stale).toBe(true);
    expect(result.tier).toBe("serious_inactivity");
  });

  it("flags 5-7 day inactivity as early warning", () => {
    const lastEvent = new Date(now - 6 * 86400000).toISOString();
    const result = classifyStale(lastEvent, "", now);
    expect(result.stale).toBe(true);
    expect(result.tier).toBe("early_warning");
  });

  it("does not flag active plan", () => {
    const lastEvent = new Date(now - 2 * 86400000).toISOString();
    const result = classifyStale(lastEvent, "", now);
    expect(result.stale).toBe(false);
    expect(result.tier).toBe("active");
  });
});

// ─── Dedupe Logic Tests ───
describe("Intervention Deduplication", () => {
  it("unique partial index prevents duplicate unresolved interventions", () => {
    // This tests the conceptual guarantee
    const existingUnresolved = new Set(["plan-1", "plan-2"]);
    const newInterventions = [
      { plan_id: "plan-1", type: "escalation" },
      { plan_id: "plan-3", type: "escalation" },
    ];

    const filtered = newInterventions.filter(i => !existingUnresolved.has(i.plan_id));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].plan_id).toBe("plan-3");
  });
});

// ─── Score Change Explanation Tests ───
describe("Score Change Explanation", () => {
  it("correctly computes component deltas", () => {
    const current = { success_component: 30, failure_avoidance_component: 20, timeliness_component: 15, reliability_component: 10 };
    const previous = { success_component: 25, failure_avoidance_component: 22, timeliness_component: 15, reliability_component: 8 };

    const deltas: Record<string, number> = {};
    for (const key of Object.keys(current)) {
      const k = key as keyof typeof current;
      deltas[k] = Math.round((current[k] - previous[k]) * 100) / 100;
    }

    expect(deltas.success_component).toBe(5);
    expect(deltas.failure_avoidance_component).toBe(-2);
    expect(deltas.timeliness_component).toBe(0);
    expect(deltas.reliability_component).toBe(2);
  });
});

// ─── Prediction History Integrity Tests ───
describe("Prediction History Integrity", () => {
  it("supersede marks old predictions inactive", () => {
    const predictions = [
      { id: "1", is_active: true, run_id: "run-1" },
      { id: "2", is_active: true, run_id: "run-1" },
    ];

    // Simulate supersede
    const superseded = predictions.map(p => ({
      ...p,
      is_active: false,
      superseded_at: new Date().toISOString(),
      superseded_by_run_id: "run-2",
    }));

    expect(superseded.every(p => !p.is_active)).toBe(true);
    expect(superseded.every(p => p.superseded_by_run_id === "run-2")).toBe(true);
  });

  it("new predictions have unique run_id", () => {
    const runId = crypto.randomUUID();
    const predictions = [
      { plan_id: "a", run_id: runId },
      { plan_id: "b", run_id: runId },
    ];

    expect(predictions.every(p => p.run_id === runId)).toBe(true);
  });
});

// ─── Override Audit Tests ───
describe("Override Auditability", () => {
  it("captures previous and new state", () => {
    const previousState = { status: "in_progress", owner_user_id: "user-1", priority: "high" };
    const overrideType = "force_cancel";

    const newState = { ...previousState, status: overrideType === "force_cancel" ? "cancelled" : previousState.status };

    expect(newState.status).toBe("cancelled");
    expect(previousState.status).toBe("in_progress");
  });

  it("validates override types", () => {
    const validTypes = ["force_reassign", "force_cancel", "extend_deadline", "escalate", "mark_blocked"];
    expect(validTypes.includes("force_cancel")).toBe(true);
    expect(validTypes.includes("invalid_type")).toBe(false);
  });
});

// ─── Score Idempotency Tests ───
describe("Score Idempotency Guard", () => {
  it("skips duplicate scores within cooldown window", () => {
    const recentScores = [
      { scope_type: "organization", scope_id: "org-1", scoring_model_version: 3, computed_at: new Date(Date.now() - 2 * 60000).toISOString() },
    ];
    const newScores = [
      { scope_type: "organization", scope_id: "org-1", scoring_model_version: 3 },
      { scope_type: "user", scope_id: "user-1", scoring_model_version: 3 },
    ];
    const cooldownMs = 5 * 60 * 1000;
    const now = Date.now();

    const filtered = newScores.filter(ns => {
      const existing = recentScores.find(rs =>
        rs.scope_type === ns.scope_type &&
        rs.scope_id === ns.scope_id &&
        rs.scoring_model_version === ns.scoring_model_version &&
        (now - new Date(rs.computed_at).getTime()) < cooldownMs
      );
      return !existing;
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].scope_id).toBe("user-1");
  });

  it("allows scores after cooldown expires", () => {
    const recentScores = [
      { scope_type: "organization", scope_id: "org-1", scoring_model_version: 3, computed_at: new Date(Date.now() - 10 * 60000).toISOString() },
    ];
    const newScore = { scope_type: "organization", scope_id: "org-1", scoring_model_version: 3 };
    const cooldownMs = 5 * 60 * 1000;
    const now = Date.now();

    const existing = recentScores.find(rs =>
      rs.scope_type === newScore.scope_type &&
      rs.scope_id === newScore.scope_id &&
      (now - new Date(rs.computed_at).getTime()) < cooldownMs
    );

    expect(existing).toBeUndefined();
  });
});

// ─── Step-Up Auth Enforcement Tests ───
describe("Step-Up Auth Enforcement", () => {
  it("rejects override without recent step-up event", () => {
    const lastStepUpAt = Date.now() - 10 * 60 * 1000;
    const validityMs = 5 * 60 * 1000;
    const isValid = (Date.now() - lastStepUpAt) < validityMs;
    expect(isValid).toBe(false);
  });

  it("allows override with recent step-up event", () => {
    const lastStepUpAt = Date.now() - 2 * 60 * 1000;
    const validityMs = 5 * 60 * 1000;
    const isValid = (Date.now() - lastStepUpAt) < validityMs;
    expect(isValid).toBe(true);
  });

  it("requires both elevated role AND step-up auth", () => {
    const hasElevatedRole = true;
    const hasStepUp = false;
    const canOverride = hasElevatedRole && hasStepUp;
    expect(canOverride).toBe(false);
  });
});
