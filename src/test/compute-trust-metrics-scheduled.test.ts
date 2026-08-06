import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(__dirname, "../../supabase/migrations");

describe("compute-trust-metrics is actually scheduled", () => {
  // The edge function was always correct and honest about missing evidence,
  // but nothing ever called it -- trust_metrics_snapshots stayed empty
  // forever and the live Trust Center showed "No trust snapshot yet" / zero
  // values indefinitely. Root cause was a missing pg_cron entry, not a
  // computation bug. This test guards against that gap re-appearing.
  it("has a pg_cron schedule invoking the compute-trust-metrics edge function", () => {
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
    const combined = files.map((f) => readFileSync(resolve(migrationsDir, f), "utf8")).join("\n");
    expect(combined).toContain("cron.schedule(\n  'compute-trust-metrics-daily'");
    expect(combined).toContain("functions/v1/compute-trust-metrics");
    expect(combined).toContain("x-cron-secret");
  });
});
