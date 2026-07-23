import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("aicis-auto-decisions duplicate-flooding fix (root cause behind many audit findings)", () => {
  // Root cause (found by an external live-app audit): this job runs every
  // 15-30 minutes and only deduped against re-running itself on the SAME
  // AICIS-side prediction/recommendation id (linkedPredIds/linkedRecIds).
  // If AICIS re-emits a fresh id for a condition that's still true on every
  // sync, recommended_action text is identical each time but the id-based
  // check never matches -- decision_ledger fills with near-duplicate
  // pending decisions for the same underlying condition. This is what fed
  // the duplicate "Decision 2"/"Decision 3" cards, the identical
  // Predictive Risk Intelligence scores (same execution_plans data behind
  // them), and Cognitive Bias Detection's anchoring-bias flag on 132/133
  // decisions.
  const source = read("supabase/functions/aicis-auto-decisions/index.ts");

  it("fetches pending aicis_auto decisions' recommended_action as a content-based dedup set", () => {
    expect(source).toContain('.eq("decision_origin", "aicis_auto")');
    expect(source).toContain('.eq("decision_status", "pending")');
    expect(source).toContain("pendingActionTexts");
  });

  it("skips a new prediction-derived decision when its text matches an existing pending one", () => {
    expect(source).toMatch(/const predictedAction = `Review elevated/);
    expect(source).toContain("if (pendingActionTexts.has(predictedAction))");
    expect(source).toContain("recommended_action: predictedAction");
  });

  it("skips a new recommendation-derived decision when its text matches an existing pending one", () => {
    expect(source).toMatch(/const recommendedAction = r\.intervention_title/);
    expect(source).toContain("if (pendingActionTexts.has(recommendedAction))");
    expect(source).toContain("recommended_action: recommendedAction");
  });

  it("adds each newly-queued action text to the set so duplicates within the same run are also caught", () => {
    expect(source).toContain("pendingActionTexts.add(predictedAction)");
    expect(source).toContain("pendingActionTexts.add(recommendedAction)");
  });
});
