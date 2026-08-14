import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ledger = readFileSync(resolve(process.cwd(), "src/pages/DecisionLedger.tsx"), "utf8");

describe("decision ledger calibration ownership", () => {
  it("does not recompute outcome success from the sign of outcome_delta in the browser", () => {
    expect(ledger).not.toContain("const outcomePositive = (decision.outcome_delta || 0) >= 0");
    expect(ledger).not.toContain("updates.calibration_error = calibrationError");
    expect(ledger).not.toContain("updates.prediction_accuracy_score = predictionAccuracy");
  });

  it("leaves calibration and forecast accuracy to the direction-aware outcome lifecycle", () => {
    expect(ledger).toContain("Calibration and prediction accuracy are outcome-lifecycle fields");
    expect(ledger).toContain("onExecutionStatusChanged");
  });
});
