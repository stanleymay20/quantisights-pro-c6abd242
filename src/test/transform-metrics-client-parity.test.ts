import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { slugifyMetric } from "../lib/data-upload-utils";
// eslint-disable-next-line no-new-func
const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8").replace(/\r\n/g, "\n");

// transform-metrics remains an off-path server implementation of the same
// metric naming/dedup contract. Keep parity coverage pointed at the hardened
// browser import source while the server cutover remains a separate change.
describe("transform-metrics vs. hardened client transform parity", () => {
  const source = read("supabase/functions/transform-metrics/index.ts");

  it("slugifyMetric produces output identical to the client's version (metric_type naming must match)", () => {
    const match = source.match(/function slugifyMetric\(name: string\): string \{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    // eslint-disable-next-line no-new-func
    const serverFn = new Function("name", match![1]) as (name: string) => string;

    const cases = ["Monthly Revenue", "Q1/Q2 Growth (%)", "  spaced  out  ", "COGS%", "already_snake_case", "Net $ Change"];
    for (const c of cases) {
      expect(serverFn(c)).toBe(slugifyMetric(c));
    }
  });

  it("drops missing/invalid mapped dates in the server implementation", () => {
    expect(source).toContain("if (dateIdx !== undefined) {");
    expect(source).toMatch(/if \(!dateRaw\) \{ failedUpdates\.push\(\{ id: raw\.id, error: "Missing date value" \}\); continue; \}/);
    expect(source).toMatch(/if \(!dateVal\) \{ failedUpdates\.push\(\{ id: raw\.id, error: `Invalid date: "\$\{dateRaw\}"` \}\); continue; \}/);
  });

  it("the hardened browser path refuses to fabricate synthetic dates", () => {
    const client = read("src/pages/DataUploadHardened.tsx");
    expect(client).toContain("Quantivis will not fabricate synthetic dates.");
    expect(client).not.toContain("syntheticYear");
    expect(client).not.toContain("syntheticMonth");
    expect(client).not.toContain("syntheticDay");
  });

  it("single-metric server mode falls back to a header-derived slug", () => {
    expect(source).toContain("const valueHeaderName = headerNames[Number(valIdx)];");
    expect(source).toContain("(valueHeaderName ? slugifyMetric(valueHeaderName) : (default_metric_type || \"revenue\"))");
  });

  it("dedups metrics by conflict key before upserting", () => {
    expect(source).toContain("const dedupedMetrics = new Map<string, Record<string, unknown>>();");
    expect(source).toContain("uniqueMetrics.length");
    expect(source).not.toContain("metricsToUpsert.length; i += 500");
  });

  it("transform-metrics is still not wired into the hardened upload path", () => {
    const client = read("src/pages/DataUploadHardened.tsx");
    expect(client).not.toContain('"transform-metrics"');
  });
});
