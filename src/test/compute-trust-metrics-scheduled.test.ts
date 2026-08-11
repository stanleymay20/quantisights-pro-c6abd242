import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = resolve(__dirname, "../../supabase/migrations");
const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("compute-trust-metrics is actually scheduled", () => {
  // Nothing called the Edge Function, so trust_metrics_snapshots stayed empty.
  // This test guards the scheduler and its cron-secret authentication path.
  it("has a pg_cron schedule invoking the compute-trust-metrics edge function", () => {
    const migration = readFileSync(resolve(migrationsDir, "20260806083000_schedule_compute_trust_metrics.sql"), "utf8");
    expect(migration).toMatch(/SELECT\s+cron\.schedule\(\s*'compute-trust-metrics-daily'/);
    expect(migration).toContain("functions/v1/compute-trust-metrics");
    expect(migration).toContain("'x-cron-secret', COALESCE(public.get_ingest_cron_secret(), '')");
  });

  it("requires the Edge Function cron secret before computing metrics", () => {
    const source = read("supabase/functions/compute-trust-metrics/index.ts");
    expect(source).toContain('import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";');
    expect(source).toContain("if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);");
  });
});
