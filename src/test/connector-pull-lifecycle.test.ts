import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260822194029_atomic_connector_pull_lifecycle.sql",
  "utf8",
);
const connectorPull = readFileSync("supabase/functions/connector-pull/index.ts", "utf8");

describe("governed connector pull lifecycle", () => {
  it("persists connector and data-source state atomically in PostgreSQL", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.persist_connector_pull_lifecycle");
    expect(migration).toContain("SECURITY INVOKER");
    expect(migration).toContain("UPDATE public.data_connectors");
    expect(migration).toContain("UPDATE public.data_sources");
    expect(migration).toContain("FOR UPDATE");
  });

  it("keeps the lifecycle RPC service-role only", () => {
    expect(migration).toContain(
      "FROM PUBLIC, anon, authenticated;",
    );
    expect(migration).toContain("TO service_role;");
  });

  it("makes healthy, degraded and failed connector truth explicit", () => {
    expect(migration).toContain("health = 'healthy'");
    expect(migration).toContain("health = 'degraded'");
    expect(migration).toContain("health = 'unhealthy'");
    expect(migration).toContain("SET status = 'active'");
    expect(migration).toContain("SET status = 'error'");
  });

  it("never promotes lifecycle state before sync bookkeeping and audit evidence exist", () => {
    const jobBookkeeping = connectorPull.indexOf("if (jobUpdateError)");
    const auditGuard = connectorPull.indexOf("if (auditError)");
    const lifecycleRpc = connectorPull.indexOf('"persist_connector_pull_lifecycle"');
    const successResponse = connectorPull.indexOf("{ success: finalStatus !== \"failed\"");

    expect(jobBookkeeping).toBeGreaterThan(-1);
    expect(auditGuard).toBeGreaterThan(jobBookkeeping);
    expect(lifecycleRpc).toBeGreaterThan(auditGuard);
    expect(successResponse).toBeGreaterThan(lifecycleRpc);
  });

  it("uses one completion timestamp and one bounded error message across evidence layers", () => {
    expect(connectorPull).toContain("const completedAt = new Date().toISOString();");
    expect(connectorPull).toContain('error_message: errorMessage');
    expect(connectorPull).toContain('completed_at: completedAt');
    expect(connectorPull).toContain('_error_message: errorMessage');
    expect(connectorPull).toContain('_completed_at: completedAt');
  });
});
