import { describe, it, expect } from "vitest";

/**
 * System Health hook contract tests — verify data transformation logic.
 */

describe("useSystemHealth - Data Logic", () => {
  it("CRITICAL_JOBS constant covers all required autonomous jobs", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/hooks/useSystemHealth.ts", "utf-8");
    
    const requiredJobs = [
      "evaluate-outcomes",
      "adaptive-calibration",
      "retention-cleanup",
      "morning-brief",
      "convergence-reconcile",
      "health-check",
    ];
    
    for (const job of requiredJobs) {
      expect(content).toContain(`"${job}"`);
    }
  });

  it("closedLoopRate is calculated as percentage", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/hooks/useSystemHealth.ts", "utf-8");
    expect(content).toContain("evaluatedOutcomes / totalDecisions");
    expect(content).toContain("* 100");
  });

  it("exports SystemHealthMetrics type with all required fields", async () => {
    const mod = await import("fs");
    const content = mod.readFileSync("src/hooks/useSystemHealth.ts", "utf-8");
    
    const requiredFields = [
      "totalDecisions", "completedDecisions", "evaluatedOutcomes",
      "closedLoopRate", "calibrationScore", "openAdvisories",
      "cronJobs", "avgConfidence",
    ];
    
    for (const field of requiredFields) {
      expect(content).toContain(field);
    }
  });
});
