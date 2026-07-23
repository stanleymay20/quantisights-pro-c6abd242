// tests/evidence/__tests__/ec5-decision-lifecycle-gate.test.mjs
// EC-5 regression coverage: the Decision Pipeline release gate consumes the
// EE-3 decision-lifecycle evidence pipeline, not the retired legacy stubs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getCertification } from "../eval-gate.mjs";
import { GATES } from "../lib/gates.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const LEGACY_DECISION_PIPELINES = Object.freeze([
  "decision-creation",
  "decision-editing",
  "decision-approval",
  "decision-rejection",
  "decision-ledger",
]);

function decisionGate() {
  return GATES.find((g) => g.key === "decision_pipeline");
}

function mkRoot() {
  return mkdtempSync(join(tmpdir(), "ec5-"));
}

function writeEvidence(dayRoot, pipeline, record) {
  const dir = join(dayRoot, pipeline);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "evidence.json"),
    JSON.stringify({
      pipeline,
      start_time: "2026-07-02T00:00:00.000Z",
      end_time: "2026-07-02T00:00:00.001Z",
      commit_sha: "test",
      environment: "preview",
      actor: "test",
      organization: "org_test",
      status: STATUS.PASS,
      positive_controls: [{ name: "seed", status: STATUS.PASS }],
      negative_controls: [],
      warnings: [],
      failures: [],
      evidence_files: [],
      ...record,
    }, null, 2),
  );
}

function seedNonDecisionGates(dayRoot) {
  for (const gate of GATES) {
    if (gate.key === "decision_pipeline") continue;
    for (const pipeline of gate.pipelines) {
      writeEvidence(dayRoot, pipeline, {});
    }
  }
}

function certifyWithDecision(record) {
  const root = mkRoot();
  const dayRoot = join(root, "2026-07-02");
  seedNonDecisionGates(dayRoot);
  writeEvidence(dayRoot, "decision-lifecycle", record);
  return getCertification({
    day: "2026-07-02",
    root,
    environment: "preview",
    run_id: "ec5-test",
    timestamp: "2026-07-02T00:00:00.000Z",
    duration_ms: 0,
  });
}

test("decision gate references only decision-lifecycle", () => {
  assert.deepEqual(decisionGate().pipelines, ["decision-lifecycle"]);
});

test("legacy decision stubs are retired and no longer required", () => {
  for (const pipeline of LEGACY_DECISION_PIPELINES) {
    assert.ok(!decisionGate().pipelines.includes(pipeline), `${pipeline} must not be in decision gate`);
    assert.equal(
      existsSync(join(REPO_ROOT, "tests/evidence/pipelines", `${pipeline}.mjs`)),
      false,
      `${pipeline}.mjs should be retired`,
    );
  }
});

test("PASS decision-lifecycle evidence satisfies the Decision Pipeline gate", () => {
  const cert = certifyWithDecision({
    status: STATUS.PASS,
    positive_controls: [{ name: "decision-lifecycle", status: STATUS.PASS }],
  });
  const gate = cert.pipeline_results.find((g) => g.gate === "decision_pipeline");
  assert.equal(gate.status, "PASS");
  assert.equal(gate.blocking, false);
  assert.equal(cert.overall_status, "PASS");
});

test("CRITICAL_FAILURE decision-lifecycle evidence blocks certification", () => {
  const cert = certifyWithDecision({
    status: STATUS.CRITICAL_FAILURE,
    failures: [{ reason: "decision audit tamper accepted" }],
  });
  const gate = cert.pipeline_results.find((g) => g.gate === "decision_pipeline");
  assert.equal(gate.status, "BLOCKED");
  assert.equal(gate.blocking, true);
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "decision-lifecycle"));
});

test("FRAMEWORK_INVALID decision-lifecycle evidence blocks certification", () => {
  const cert = certifyWithDecision({
    status: STATUS.FRAMEWORK_INVALID,
    failures: [{ reason: "missing DEC control" }],
  });
  const gate = cert.pipeline_results.find((g) => g.gate === "decision_pipeline");
  assert.equal(gate.status, "BLOCKED");
  assert.equal(gate.blocking, true);
  assert.equal(cert.overall_status, "CONDITIONAL_RELEASE");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "decision-lifecycle"));
});
