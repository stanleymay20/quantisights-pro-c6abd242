import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migrationPath = "supabase/migrations/20260816111500_harden_governed_decision_loop.sql";

describe("governed decision loop hardening", () => {
  it("makes executive approval readiness a server-side prerequisite", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("FUNCTION public.decision_approval_readiness");
    expect(migration).toContain("missing evidence: verified evidence must be linked before approval");
    expect(migration).toContain("unresolved contradiction: conflicting signals must be resolved before approval");
    expect(migration).toContain("insufficient confidence: AICIS confidence must be at least 70% before approval");
    expect(migration).toContain("v_readiness := public.decision_approval_readiness(_decision_id)");

    const readinessGate = migration.indexOf("v_readiness := public.decision_approval_readiness(_decision_id)");
    const approvalWrite = migration.indexOf("SET decision_status = 'approved'");
    expect(readinessGate).toBeGreaterThan(-1);
    expect(approvalWrite).toBeGreaterThan(readinessGate);
  });

  it("hardens approval and outcome governance writes", () => {
    const migration = read(migrationPath);

    expect(migration).toContain('CREATE POLICY "Approvers can update their approvals"');
    expect(migration).toContain("WITH CHECK (\n  approver_id = auth.uid()");
    expect(migration).toContain("guard_decision_approval_identity_trigger");
    expect(migration).toContain("decision approval identity fields are immutable");
    expect(migration).toContain('CREATE POLICY "Owners admins can insert decision outcomes"');
    expect(migration).toContain('CREATE POLICY "Owners admins can update decision outcomes"');
  });

  it("authenticates automatic outcome evaluation with the shared cron secret", () => {
    const edge = read("supabase/functions/evaluate-outcomes/index.ts");
    const config = read("supabase/config.toml");
    const migration = read(migrationPath);

    expect(edge).toContain('req.headers.get("x-cron-secret")');
    expect(edge).toContain('Deno.env.get("CRON_SHARED_SECRET") ?? Deno.env.get("INGEST_CRON_SECRET")');
    expect(edge).toContain('cronSecretHeader !== cronSecretEnv');
    expect(config).toContain("[functions.evaluate-outcomes]\n    verify_jwt = false");
    expect(config).toContain("[functions.aicis-evaluate-outcomes]\n    verify_jwt = false");

    expect(migration).toContain("evaluate-decision-outcomes-hourly");
    expect(migration).toContain("evaluate-aicis-outcomes-hourly");
    expect(migration).toContain("public.get_ingest_cron_secret()");
    expect(migration).toContain("/functions/v1/evaluate-outcomes");
    expect(migration).toContain("/functions/v1/aicis-evaluate-outcomes");
  });

  it("requires owner/admin authority for outcome-evidence mutations", () => {
    const edge = read("supabase/functions/evaluate-outcomes/index.ts");

    expect(edge).toContain('if (action === "schedule" || action === "evaluate")');
    expect(edge).toContain('supabase.rpc("get_user_org_role"');
    expect(edge).toContain('["owner", "admin"].includes(String(orgRole))');
    expect(edge).toContain('decisionCheck.decision_status !== "approved"');
  });

  it("never trains adaptive calibration from raw outcome-delta sign", () => {
    const calibration = read("supabase/functions/adaptive-calibration/index.ts");
    const evaluator = read("supabase/functions/evaluate-outcomes/index.ts");

    expect(calibration).not.toContain("delta > 0 ? 1 : 0");
    expect(calibration).not.toContain("outcome_delta\"");
    expect(calibration).toContain("prediction_accuracy_score");
    expect(calibration).toContain('success_metric: "prediction_accuracy_score"');
    expect(evaluator).toContain("accuracyScore = succeeded ? 100");
  });

  it("makes replay and bias detection direction aware", () => {
    const replay = read("supabase/functions/decision-replay/index.ts");
    const bias = read("supabase/functions/cognitive-bias-detect/index.ts");

    expect(replay).toContain("outcomeSucceededForDirection");
    expect(replay).not.toContain("(decision.outcome_delta || 0) >= 0");
    expect(bias).toContain("outcomeSucceededForDirection");
    expect(bias).not.toContain("Number(d.outcome_delta) < 0");
  });

  it("keeps the browser approval button blocked by platform readiness as well as human review", () => {
    const review = read("src/components/decisions/ExecutiveReviewFlow.tsx");

    expect(review).toContain("const platformReady = dataGates.every((gate) => gate.passed)");
    expect(review).toContain("const approveDisabled = !checklistComplete || !platformReady || busy");
  });
});
