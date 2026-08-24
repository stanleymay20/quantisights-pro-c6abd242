import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("executive dashboard evidence wiring", () => {
  const source = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

  it("keeps evidence visible without restoring analytics-first insight cards", () => {
    expect(source).toContain("Evidence in view");
    expect(source).toContain("insights.length + topMetrics.length");
    expect(source).toContain("Executive evidence coverage is degraded");
    expect(source).toContain("degradedSurfaces.length > 0");
  });

  it("anchors priority decisions to governed confidence and value evidence", () => {
    expect(source).toContain('.from("decision_ledger")');
    expect(source).toContain('.from("decision_value_attributions")');
    expect(source).toContain("decision.capped_confidence");
    expect(source).toContain("valueLabel(attributions[decision.id])");
    expect(source).toContain("Scenario estimate — not verified");
    expect(source).toContain("Could not verify monetary evidence");
  });

  it("passes live insight evidence from useInsights into the executive driver", () => {
    const dashboard = read("src/pages/Dashboard.tsx");
    expect(dashboard).toContain("insights={insights}");
    expect(dashboard).toContain('import { useInsights } from "@/hooks/useInsights";');
  });
});
