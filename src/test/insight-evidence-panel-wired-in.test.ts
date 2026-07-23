import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("InsightEvidencePanel wired into the live dashboard (was orphaned)", () => {
  // InsightEvidencePanel was fully built and correctly fixed (see
  // data-quality-index-scale-bug.test.ts) but had zero render sites -- the
  // only components that used it (AIInsights -> AnalyticsPanel ->
  // CommandCenter, and separately AnalystInsights -> CommandCenter) were
  // themselves unreachable from any route. The live /dashboard route
  // (Dashboard.tsx -> ExecutiveDailyDriver) never rendered insights as
  // cards at all -- `insights` only fed the "Ask" widget's text answers.
  // Wired it directly into the live tree instead of resurrecting the
  // orphaned CommandCenter subtree.
  const source = read("src/components/dashboard/ExecutiveDailyDriver.tsx");

  it("imports InsightEvidencePanel", () => {
    expect(source).toContain('import InsightEvidencePanel from "./InsightEvidencePanel";');
  });

  it("renders it for each insight, gated on insights being non-empty", () => {
    expect(source).toContain("{insights.length > 0 && (");
    expect(source).toContain("{insights.slice(0, 5).map(insight => (");
    expect(source).toContain("<InsightEvidencePanel key={insight.id} insight={insight} />");
  });

  it("Dashboard.tsx's insights prop (from useInsights) is what's passed through, so field shapes match", () => {
    const dashboard = read("src/pages/Dashboard.tsx");
    expect(dashboard).toContain("insights={insights}");
    expect(dashboard).toContain('import { useInsights } from "@/hooks/useInsights";');
  });
});
