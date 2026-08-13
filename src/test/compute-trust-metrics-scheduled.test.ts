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
    expect(migration).toContain("FROM vault.decrypted_secrets");
    expect(migration).toContain("WHERE name = 'project_url'");
    expect(migration).not.toContain("https://itpwpnwzzitkelffttyx.supabase.co/functions/v1/compute-trust-metrics");
  });

  it("requires the Edge Function cron secret before computing metrics", () => {
    const source = read("supabase/functions/compute-trust-metrics/index.ts");
    expect(source).toContain('import { verifyCronSecret, cronSecretUnauthorized } from "../_shared/cron-secret.ts";');
    expect(source).toContain("if (!verifyCronSecret(req)) return cronSecretUnauthorized(corsHeaders);");
  });

  it("repairs every scheduled route with environment-local Vault URLs", () => {
    const migration = read(
      "supabase/migrations/20260813160423_harden_cron_project_routing.sql",
    );
    expect(migration).toContain("FROM vault.decrypted_secrets");
    expect(migration).toContain("WHERE name = 'project_url'");
    expect(migration).not.toContain("itpwpnwzzitkelffttyx");
    for (const functionName of [
      "ingest-external-signals",
      "executive-orchestration",
      "execution-intelligence",
      "morning-brief",
      "connector-scheduler",
      "compute-trust-metrics",
    ]) {
      expect(migration).toContain(`/functions/v1/${functionName}`);
    }
  });

  it("allows only bounded cron actions through dual-auth functions", () => {
    const orchestration = read(
      "supabase/functions/executive-orchestration/index.ts",
    );
    const intelligence = read(
      "supabase/functions/execution-intelligence/index.ts",
    );
    const config = read("supabase/config.toml");
    expect(orchestration).toContain("requireCronOrOrgMember(req, orgId)");
    expect(intelligence).toContain("requireCronOrOrgMember(req, orgId)");
    expect(intelligence).toContain('["compute_scores", "predict_risks"]');
    for (const functionName of [
      "execution-intelligence",
      "connector-scheduler",
      "compute-trust-metrics",
      "ingest-external-signals",
    ]) {
      expect(config).toMatch(
        new RegExp(`\\[functions\\.${functionName}\\]\\s+verify_jwt = false`),
      );
    }
  });
});
