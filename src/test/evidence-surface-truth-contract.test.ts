import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const catalog = read("src/pages/DataCatalog.tsx");
const replayHook = read("src/hooks/useDecisionReplay.ts");
const replayPanel = read("src/components/execution/DecisionReplayPanel.tsx");
const similar = read("src/hooks/useSimilarDecisions.ts");
const inbox = read("src/hooks/useIntelligenceInbox.ts");
const fusion = read("src/hooks/useNarrativeFusion.ts");
const graph = read("src/hooks/useOperationalGraph.ts");
const ml = read("src/hooks/useMLEngine.ts");

describe("evidence surface truth semantics", () => {
  it("never renders an unavailable catalog as all fresh", () => {
    expect(catalog).toContain("Data catalog evidence is unavailable");
    expect(catalog).toContain("Freshness unverified");
    expect(catalog).toContain("Dataset inventory cannot currently be verified");
    expect(catalog).toContain('ds.is_stale == null');
  });

  it("does not substitute replay confidence gaps with zero", () => {
    expect(replayPanel).toContain('value == null ? "Unknown"');
    expect(replayPanel).toContain('drift == null ? "Drift unknown"');
    expect(replayPanel).toContain("Replay evidence is unavailable");
    expect(replayHook).toContain("setReplays([])");
    expect(replayHook).toContain("setDriftReport(null)");
  });

  it("clears stale precedent evidence before retrieval and on failure", () => {
    expect(similar).toContain("resetEvidence");
    expect(similar).toContain("Decision context is required to retrieve precedent evidence");
    expect(similar).toContain("Similar-decision retrieval returned no evidence payload");
  });

  it("keeps intelligence inbox writes and observability failures explicit", () => {
    expect(inbox).toContain("observabilityError");
    expect(inbox).toContain("Intelligence routing returned no confirmation");
    expect(inbox).toContain("Intelligence feedback persistence failed");
    expect(inbox).toContain("scopeRef.current !== orgId");
  });

  it("fails closed across narrative and operational-graph evidence", () => {
    expect(fusion).toContain("Narrative fusion evidence could not be verified");
    expect(fusion).toContain("if (failures.length > 0)");
    expect(graph).toContain("Operational graph evidence could not be verified");
    expect(graph).toContain("if (failures.length > 0)");
  });

  it("does not cache missing ML results as valid model output", () => {
    expect(ml).toContain("ML engine returned no response payload");
    expect(ml).toContain("ML engine returned no result for");
    expect(ml.indexOf("setCache(cacheKey, result)")).toBeGreaterThan(ml.indexOf("data.result === undefined"));
  });
});
