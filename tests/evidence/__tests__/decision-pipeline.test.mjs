// tests/evidence/__tests__/decision-pipeline.test.mjs
// EE-3 regression suite for the Decision Lifecycle evidence pipeline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verify, buildEvidence, meta, CONTROLS, REQUIRED_CONTROL_IDS } from "../pipelines/decision-lifecycle.mjs";
import {
  DECISION_CONTROLS,
  DECISION_CONTROL_INDEX,
  DECISION_IMMUTABILITY_CONTROLS,
} from "../pipelines/lib/decision-controls.mjs";
import { STATUS, isBlocking } from "../lib/taxonomy.mjs";
import { validate as validateArtifact } from "../lib/artifact.mjs";
import { finalize } from "../lib/pipeline.mjs";

function makeAdapterResult(overrides = {}) {
  const controls = {};
  for (const c of DECISION_CONTROLS) {
    controls[c.control_id] = {
      status: "PASS",
      execution_time_ms: 5,
      evidence: {
        decision_id: "dec_seed",
        organization_id: "org_seed",
        owner: "user_seed",
        status_before: null,
        status_after: "pending",
        approval_chain: [],
        audit_record: { id: "aud_1" },
        timeline: [{ event: "create" }],
        confidence: 0.7,
        recommendation: { label: "Proceed" },
        risk_score: 42,
        governance: { profile: "gp_1" },
        request: { method: "POST" },
        response: { status: 201 },
        screenshots: [],
        console_errors: [],
        network_failures: [],
      },
      error: null,
    };
  }
  const { controls: overrideControls, ...rest } = overrides;
  return {
    adapter: "test",
    collected_at: "2026-08-01T00:00:00.000Z",
    environment: "preview",
    sources: {},
    controls: overrideControls ? { ...controls, ...overrideControls } : controls,
    ...rest,
  };
}

test("registry: 25 controls, unique IDs, all critical/blocking, immutability set", () => {
  assert.equal(DECISION_CONTROLS.length, 25);
  assert.equal(REQUIRED_CONTROL_IDS.length, 25);
  const ids = new Set(DECISION_CONTROLS.map((c) => c.control_id));
  assert.equal(ids.size, 25);
  for (const c of DECISION_CONTROLS) {
    assert.equal(c.blocking, "critical");
    assert.ok(["security_failure", "critical_failure"].includes(c.severity));
    assert.ok(c.failure_code);
    assert.ok(c.recommendation);
    assert.equal(DECISION_CONTROL_INDEX[c.control_id], c);
  }
  // Immutability guarantees project to CRITICAL_FAILURE
  for (const id of ["DEC-011", "DEC-020", "DEC-024", "DEC-025"]) {
    assert.ok(DECISION_IMMUTABILITY_CONTROLS.includes(id), `${id} must be critical_failure`);
  }
});

test("all PASS → pipeline STATUS.PASS, artifact validates", () => {
  const out = buildEvidence(makeAdapterResult());
  assert.equal(out.pipeline, meta.name);
  assert.equal(out.status, STATUS.PASS);
  assert.equal(out.positive_controls.length, 25);
  assert.equal(out.negative_controls.length, 0);
  assert.equal(out.failures.length, 0);
  const finalized = finalize(out, {
    start_time: "2026-08-01T00:00:00.000Z",
    commit_sha: "test", environment: "preview",
    actor: "test", organization: "test",
  });
  validateArtifact(finalized);
});

test("security_failure control FAIL → SECURITY_FAILURE blocking", () => {
  const r = makeAdapterResult({
    controls: { "DEC-001": { status: "FAIL", error: { message: "insert 500" } } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.SECURITY_FAILURE);
  assert.ok(isBlocking(out.status));
  const f = out.failures.find((x) => x.control_id === "DEC-001");
  assert.equal(f.code, "DECISION_CREATE_FAILURE");
  assert.equal(f.blocking, true);
});

test("critical_failure control FAIL → CRITICAL_FAILURE (tamper / delete)", () => {
  const r = makeAdapterResult({
    controls: { "DEC-025": { status: "FAIL", error: { message: "delete accepted" } } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
  assert.ok(isBlocking(out.status));
  const f = out.failures.find((x) => x.control_id === "DEC-025");
  assert.equal(f.code, "DECISION_DELETE_ALLOWED");
  assert.equal(f.severity, "critical_failure");
});

test("duplicate approval / invalid transition → DEC-012 SECURITY_FAILURE", () => {
  const r = makeAdapterResult({
    controls: { "DEC-012": { status: "FAIL", error: { message: "approved→pending accepted" } } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.SECURITY_FAILURE);
  assert.ok(out.failures.some((f) => f.code === "DECISION_INVALID_TRANSITION"));
});

test("approval history tamper (DEC-011) → CRITICAL_FAILURE", () => {
  const r = makeAdapterResult({
    controls: { "DEC-011": { status: "FAIL", error: { message: "UPDATE on approval_history accepted" } } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
});

test("outcome overwrite (DEC-020) → CRITICAL_FAILURE", () => {
  const r = makeAdapterResult({
    controls: { "DEC-020": { status: "FAIL" } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
});

test("SKIP degrades to WARNING (never fake PASS)", () => {
  const r = makeAdapterResult({
    controls: { "DEC-007": { status: "SKIP", error: "staging LLM unavailable" } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.WARNING);
  assert.ok(out.warnings.some((w) => w.control_id === "DEC-007"));
});

test("missing control → FRAMEWORK_INVALID", () => {
  const r = makeAdapterResult();
  delete r.controls["DEC-013"];
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(out.failures.some((f) => f.code === "MISSING_CONTROL" && f.control_id === "DEC-013"));
});

test("invalid status token → FRAMEWORK_INVALID", () => {
  const r = makeAdapterResult({
    controls: { "DEC-001": { status: "MAYBE" } },
  });
  const out = buildEvidence(r);
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(out.failures.some((f) => f.code === "INVALID_CONTROL_STATUS"));
});

test("verify() with no env var returns FRAMEWORK_INVALID", async () => {
  delete process.env.EVIDENCE_DECISION_RESULTS;
  const out = await verify({});
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
});

test("verify() reads adapter JSON via EVIDENCE_DECISION_RESULTS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dec-"));
  const path = join(dir, "results.json");
  writeFileSync(path, JSON.stringify(makeAdapterResult()));
  process.env.EVIDENCE_DECISION_RESULTS = path;
  try {
    const out = await verify({});
    assert.equal(out.status, STATUS.PASS);
    assert.equal(out.positive_controls.length, 25);
  } finally {
    delete process.env.EVIDENCE_DECISION_RESULTS;
  }
});

test("pipeline → certification: CRITICAL_FAILURE is treated as blocking", () => {
  const r = makeAdapterResult({
    controls: { "DEC-025": { status: "FAIL" } },
  });
  const out = buildEvidence(r);
  assert.ok(isBlocking(out.status));
});

test("meta.gate matches registered Decision pipeline gate", () => {
  assert.equal(meta.name, "decision-lifecycle");
  assert.equal(meta.gate, "Decision pipeline");
});
