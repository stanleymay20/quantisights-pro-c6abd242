import { describe, expect, it } from "vitest";
import { DOC_SECTIONS } from "@/data/documentation-sections";

const allContent = () => DOC_SECTIONS.map((section) => section.content).join("\n");

describe("documentation does not overstate unverified production scale", () => {
  it("does not assert 100M+ rows / 1,000+ orgs as an already-achieved fact", () => {
    const content = allContent();
    expect(content).not.toContain("designed to support 100M+ metric rows across 1,000+ organizations without performance degradation.\n");
    expect(content).toContain("designed to target");
  });

  it("does not assert an unverified sub-millisecond/sub-500ms latency SLA", () => {
    const content = allContent();
    expect(content).not.toMatch(/within milliseconds of new data arriving/i);
    expect(content).not.toMatch(/sub-500ms metric streaming/i);
  });

  it("labels warehouse connectors as Implemented rather than an unqualified Production claim", () => {
    const content = allContent();
    expect(content).not.toMatch(/\| Full Sync \| Production \|/);
    expect(content).toContain("is not an independent load-test or scale certification");
  });
});
