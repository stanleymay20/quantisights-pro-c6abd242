import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fmtCurrency } from "@/lib/format-utils";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Portfolio currency consistency (was $, rest of the app uses €)", () => {
  it("fmtCurrency formats with €, matching the rest of the app", () => {
    expect(fmtCurrency(1_500_000_000)).toBe("€1.5B");
    expect(fmtCurrency(2_400_000)).toBe("€2.4M");
    expect(fmtCurrency(8_000)).toBe("€8K");
    expect(fmtCurrency(42)).toBe("€42");
    expect(fmtCurrency(null)).toBe("—");
  });

  it("no longer formats with $", () => {
    expect(fmtCurrency(1_000_000)).not.toContain("$");
  });
});

describe("Data Catalog 'Active Datasets' count (was always 0)", () => {
  // Root cause: the ingestion pipeline (DataUpload.tsx) only ever
  // transitions dataset status pending -> processing -> completed/failed.
  // Nothing ever sets status to "active", so filtering on that string
  // always matched zero rows regardless of how many datasets actually
  // finished ingesting successfully.
  it("counts datasets by status === 'completed', not the never-assigned 'active'", () => {
    const source = read("src/pages/DataCatalog.tsx");
    expect(source).not.toMatch(/activeCount = datasets\.filter\(d => d\.status === "active"\)/);
    expect(source).toMatch(/activeCount = datasets\.filter\(d => d\.status === "completed"\)/);
  });

  it("DataUpload.tsx never actually sets a dataset's status to 'active' (confirms the count would otherwise always be 0)", () => {
    const source = read("src/pages/DataUpload.tsx");
    expect(source).not.toMatch(/status:\s*"active"/);
    expect(source).toContain('status: "completed"');
  });
});
