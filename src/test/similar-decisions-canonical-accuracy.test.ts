import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = read("supabase/functions/similar-decisions/index.ts");

describe("similar decision precedent accuracy", () => {
  it("refreshes accuracy from the canonical measured outcome contract", () => {
    expect(source).toContain('.select("decision_id, expected_direction, accuracy_score, evaluation_date")');
    expect(source).toContain("accuracyByDecision");
    expect(source).toContain("accuracy_score: canonicalAccuracy");
  });

  it("does not coerce missing embedded accuracy to zero", () => {
    expect(source).not.toContain(".map(r => Number(r.metadata?.accuracy_score))");
    expect(source).toContain('typeof a === "number" && Number.isFinite(a)');
  });
});
