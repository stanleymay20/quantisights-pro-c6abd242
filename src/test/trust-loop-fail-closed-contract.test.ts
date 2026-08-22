import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const executive = read("src/hooks/useExecutiveIntelligence.ts");
const graph = read("src/hooks/useOperationalGraph.ts");
const performance = read("src/hooks/useDecisionPerformance.ts");
const outcomeWidget = read("src/components/decisions/OutcomeFeedbackWidget.tsx");
const outcomeEdge = read("supabase/functions/aicis-evaluate-outcomes/index.ts");
const outcomeMigration = read("supabase/migrations/20260822115500_atomic_manual_aicis_outcome.sql");

describe("trusted decision loop fail-closed contracts", () => {
  it("treats failed executive-intelligence reads as degraded evidence", () => {
    expect(executive).toContain("queryFailures");
    expect(executive).toContain("syntheticDegradation");
    expect(executive).toContain("Only clear/replace each surface after its query completed successfully");
    expect(executive).toContain("setLastError");
  });

  it("does not optimistically claim intervention writes before persistence", () => {
    expect(executive.indexOf('.from("executive_interventions")\n      .update')).toBeLessThan(
      executive.indexOf("setInterventions((cur) => cur.map"),
    );
    expect(executive).toContain("Intervention update failed");
  });

  it("fails the operational graph when any required evidence surface fails", () => {
    expect(graph).toContain("Operational graph evidence could not be verified");
    expect(graph).toContain("if (failures.length > 0)");
    expect(graph).toContain("if (build.error) throw build.error");
    expect(graph).toContain("if (topology.error) throw topology.error");
    expect(graph).toContain("if (compression.error) throw compression.error");
  });

  it("clears decision-performance evidence when organization scope changes or refresh fails", () => {
    expect(performance).toContain("setPerformance(null)");
    expect(performance).toContain("Decision performance returned no data");
    expect(performance).toContain("Outcome evaluation scheduling returned no confirmation");
  });

  it("records manual decision outcome, calibration and audit atomically", () => {
    expect(outcomeMigration).toContain("CREATE OR REPLACE FUNCTION public.record_manual_aicis_outcome");
    expect(outcomeMigration).toContain("UPDATE public.decision_ledger");
    expect(outcomeMigration).toContain("INSERT INTO public.aicis_outcomes");
    expect(outcomeMigration).toContain("INSERT INTO public.audit_log");
    expect(outcomeMigration).toContain("TO service_role");
    expect(outcomeEdge).toContain('service.rpc("record_manual_aicis_outcome"');
  });

  it("requires durable single-outcome confirmation before the UI reports success", () => {
    expect(outcomeEdge).toContain("total_evaluated !== 1");
    expect(outcomeEdge).toContain("recorded: true");
    expect(outcomeWidget).toContain("!data?.success");
    expect(outcomeWidget).toContain("!data.recorded");
    expect(outcomeWidget).toContain("data.total_evaluated !== 1");
  });
});
