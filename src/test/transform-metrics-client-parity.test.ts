import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { slugifyMetric } from "../lib/data-upload-utils";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// transform-metrics is a fully-built, correct-looking edge function that
// duplicates DataUpload.tsx's client-side raw-to-metrics transform -- but
// it has never actually been wired up (grepping src/ for "transform-metrics"
// finds zero call sites; DataUpload.tsx does the whole raw->clean step in
// the browser instead). Before it can safely replace that client-side work
// (the next step toward getting upload processing off the browser main
// thread for 1M-seat scale), it needs to behave identically to what it
// would replace. Auditing it surfaced three real divergences, fixed here.
describe("transform-metrics vs. DataUpload.tsx client transform parity", () => {
  const source = read("supabase/functions/transform-metrics/index.ts");

  it("slugifyMetric produces output identical to the client's version (metric_type naming must match)", () => {
    // Extract the server's slugifyMetric body from source and eval it in
    // isolation to compare actual behavior, not just string diffing --
    // Deno's `function slugifyMetric(name: string): string { ... }` has
    // different type annotations than the compiled client function but
    // must produce identical output for the same input.
    const match = source.match(/function slugifyMetric\(name: string\): string \{([\s\S]*?)\n\}/);
    expect(match).toBeTruthy();
    // eslint-disable-next-line no-new-func
    const serverFn = new Function("name", match![1]) as (name: string) => string;

    const cases = ["Monthly Revenue", "Q1/Q2 Growth (%)", "  spaced  out  ", "COGS%", "already_snake_case", "Net $ Change"];
    for (const c of cases) {
      expect(serverFn(c)).toBe(slugifyMetric(c));
    }
  });

  it("only synthesizes a date when no date column is mapped; drops the row when a mapped date value is missing or invalid", () => {
    expect(source).toContain("if (dateIdx !== undefined) {");
    expect(source).toMatch(/if \(!dateRaw\) \{ failedUpdates\.push\(\{ id: raw\.id, error: "Missing date value" \}\); continue; \}/);
    expect(source).toMatch(/if \(!dateVal\) \{ failedUpdates\.push\(\{ id: raw\.id, error: `Invalid date: "\$\{dateRaw\}"` \}\); continue; \}/);
    // The synthetic-date branch must live in the `else` (no date column mapped) arm.
    const elseIdx = source.indexOf("} else {\n          const syntheticYear");
    expect(elseIdx).toBeGreaterThan(-1);
  });

  it("single-metric mode falls back to a header-derived slug, not a hardcoded default, when no metric_type column is mapped", () => {
    expect(source).toContain("const valueHeaderName = headerNames[Number(valIdx)];");
    expect(source).toContain("(valueHeaderName ? slugifyMetric(valueHeaderName) : (default_metric_type || \"revenue\"))");
  });

  it("dedups metrics by conflict key before upserting, avoiding Postgres's ON CONFLICT double-affect error", () => {
    expect(source).toContain("const dedupedMetrics = new Map<string, Record<string, unknown>>();");
    expect(source).toContain("uniqueMetrics.length");
    expect(source).not.toContain("metricsToUpsert.length; i += 500");
  });

  it("is still not wired up to any call site (confirms this is prep work, not yet a live cutover)", () => {
    const callers = read("src/pages/DataUpload.tsx");
    expect(callers).not.toContain('"transform-metrics"');
  });
});
