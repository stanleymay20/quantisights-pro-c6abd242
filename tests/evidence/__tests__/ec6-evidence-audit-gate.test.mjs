// tests/evidence/__tests__/ec6-evidence-audit-gate.test.mjs
// EC-6 regression coverage: EE-4 Evidence & Audit Trail pipelines are wired
// into the certification gate registry.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { getCertification } from "../eval-gate.mjs";
import { GATES } from "../lib/gates.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

const EVIDENCE_PIPELINES = Object.freeze([
  "evidence-attachment",
  "evidence-retrieval",
  "evidence-export",
]);

function gate(key) {
  return GATES.find((g) => g.key === key);
}

function mkRoot() {
  return mkdtempSync(join(tmpdir(), "ec6-"));
}

function writeEvidence(dayRoot, pipeline, record = {}) {
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

function seedAllPass(dayRoot) {
  for (const g of GATES) {
    for (const pipeline of g.pipelines) {
      writeEvidence(dayRoot, pipeline);
    }
  }
}

function certifyWith(overrides) {
  const root = mkRoot();
  const dayRoot = join(root, "2026-07-02");
  seedAllPass(dayRoot);
  for (const [pipeline, record] of Object.entries(overrides)) {
    writeEvidence(dayRoot, pipeline, record);
  }
  return getCertification({
    day: "2026-07-02",
    root,
    environment: "preview",
    run_id: "ec6-test",
    timestamp: "2026-07-02T00:00:00.000Z",
    duration_ms: 0,
  });
}

test("evidence gate references the EE-4 evidence pipelines", () => {
  assert.deepEqual(gate("evidence_pipeline").pipelines, EVIDENCE_PIPELINES);
});

test("audit gate references audit-trail", () => {
  assert.deepEqual(gate("audit").pipelines, ["audit-trail"]);
});

test("PASS evidence and audit artifacts satisfy their gates", () => {
  const cert = certifyWith({});
  const evidenceGate = cert.pipeline_results.find((g) => g.gate === "evidence_pipeline");
  const auditGate = cert.pipeline_results.find((g) => g.gate === "audit");

  assert.equal(evidenceGate.status, "PASS");
  assert.equal(evidenceGate.blocking, false);
  assert.equal(auditGate.status, "PASS");
  assert.equal(auditGate.blocking, false);
  assert.equal(cert.overall_status, "PASS");
});

test("CRITICAL_FAILURE in evidence pipeline blocks certification", () => {
  const cert = certifyWith({
    "evidence-attachment": {
      status: STATUS.CRITICAL_FAILURE,
      failures: [{ reason: "evidence chain tamper accepted" }],
    },
  });
  const evidenceGate = cert.pipeline_results.find((g) => g.gate === "evidence_pipeline");

  assert.equal(evidenceGate.status, "BLOCKED");
  assert.equal(evidenceGate.blocking, true);
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "evidence-attachment"));
});

test("FRAMEWORK_INVALID in evidence pipeline blocks certification", () => {
  const cert = certifyWith({
    "evidence-retrieval": {
      status: STATUS.FRAMEWORK_INVALID,
      failures: [{ reason: "missing EVD-010 control" }],
    },
  });
  const evidenceGate = cert.pipeline_results.find((g) => g.gate === "evidence_pipeline");

  assert.equal(evidenceGate.status, "BLOCKED");
  assert.equal(evidenceGate.blocking, true);
  assert.notEqual(cert.overall_status, "PASS");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "evidence-retrieval"));
});

test("CRITICAL_FAILURE in audit-trail blocks certification", () => {
  const cert = certifyWith({
    "audit-trail": {
      status: STATUS.CRITICAL_FAILURE,
      failures: [{ reason: "audit delete accepted" }],
    },
  });
  const auditGate = cert.pipeline_results.find((g) => g.gate === "audit");

  assert.equal(auditGate.status, "BLOCKED");
  assert.equal(auditGate.blocking, true);
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "audit-trail"));
});

test("FRAMEWORK_INVALID in audit-trail blocks certification", () => {
  const cert = certifyWith({
    "audit-trail": {
      status: STATUS.FRAMEWORK_INVALID,
      failures: [{ reason: "missing EVD-006 control" }],
    },
  });
  const auditGate = cert.pipeline_results.find((g) => g.gate === "audit");

  assert.equal(auditGate.status, "BLOCKED");
  assert.equal(auditGate.blocking, true);
  assert.notEqual(cert.overall_status, "PASS");
  assert.ok(cert.blocking_items.some((b) => b.pipeline === "audit-trail"));
});

test("gates.mjs and enterprise docs remain in sync", () => {
  const res = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--check"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `generate-docs --check failed:\n${res.stdout}${res.stderr}`);
});
