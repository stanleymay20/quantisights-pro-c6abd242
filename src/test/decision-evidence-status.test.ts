import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { trustFromDecision } from "@/components/trust/trust-adapter";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("decision evidence status (P0 regression: Approve permanently blocked)", () => {
  // Root cause: auto-create-decisions/index.ts hardcoded evidence_sources: []
  // on every decision it created, and trust-adapter.ts's evidenceStatus()
  // checked evidence_sources BEFORE explanation_metadata.source_data, so the
  // empty array short-circuited past real evidence data on the same row.
  // Every decision from that pipeline was permanently stuck at "missing
  // evidence" with no UI path to attach or verify evidence, disabling
  // Approve everywhere.

  it("treats a decision with populated evidence_sources as verified", () => {
    const decision = {
      id: "d1",
      evidence_sources: [{ source_type: "advisory", source_name: "Advisory engine", source_id: "a1" }],
      explanation_metadata: {},
    };
    expect(trustFromDecision(decision).evidenceStatus).toBe("verified");
  });

  it("falls through to explanation_metadata.source_data when evidence_sources is an empty array", () => {
    const decision = {
      id: "d2",
      evidence_sources: [],
      explanation_metadata: {
        source_data: { dataset_name: "Supplier Risk Q3", dataset_id: "ds-1", rows_analyzed: 1200 },
      },
    };
    expect(trustFromDecision(decision).evidenceStatus).toBe("verified");
  });

  it("still reports missing when there is neither evidence_sources nor source_data", () => {
    const decision = { id: "d3", evidence_sources: [], explanation_metadata: {} };
    expect(trustFromDecision(decision).evidenceStatus).toBe("missing");
  });

  it("auto-create-decisions no longer hardcodes an empty evidence_sources array", () => {
    const source = read("supabase/functions/auto-create-decisions/index.ts");
    expect(source).not.toContain("evidence_sources: [],");
    expect(source).toContain("evidence_sources: [{");
  });
});
