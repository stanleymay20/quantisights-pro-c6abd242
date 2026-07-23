// tests/evidence/__tests__/authorization-pipeline.test.mjs
// EE-2 regression suite for the Authorization evidence pipeline.
// Run with: npm run evidence:test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  verify,
  buildEvidence,
  meta,
  CONTROLS,
  REQUIRED_CONTROL_IDS,
} from "../pipelines/authorization.mjs";
import { AUTHZ_CONTROLS } from "../pipelines/lib/authz-controls.mjs";
import { STATUS, isBlocking } from "../lib/taxonomy.mjs";
import { validate as validateArtifact } from "../lib/artifact.mjs";
import { finalize } from "../lib/pipeline.mjs";

function makeAdapterResult(overrides = {}) {
  const controls = {};
  for (const c of AUTHZ_CONTROLS) {
    controls[c.control_id] = {
      status: "PASS",
      execution_time_ms: 5,
      evidence: { route: "/dashboard", role: "member", status_code: 200, screenshots: [] },
      error: null,
    };
  }
  const { controls: overrideControls, ...rest } = overrides;
  return {
    adapter: "test",
    collected_at: "2026-07-01T00:00:00.000Z",
    environment: "preview",
    sources: { tenant_isolation: null, browser: null, route_probes: null },
    ...rest,
    controls: { ...controls, ...(overrideControls ?? {}) },
  };
}

function writeAdapter(result) {
  const dir = mkdtempSync(join(tmpdir(), "ee2-authz-"));
  const path = join(dir, "authz-evidence.json");
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

test("pipeline metadata matches gate registry", () => {
  assert.equal(meta.name, "authorization");
  assert.equal(meta.gate, "Authorization");
});

test("all 20 AUTHZ controls are declared", () => {
  assert.equal(CONTROLS.length, 20);
  assert.equal(REQUIRED_CONTROL_IDS.length, 20);
  for (const c of CONTROLS) {
    assert.ok(c.control_id.startsWith("AUTHZ-"), "control_id must start with AUTHZ-");
    assert.ok(c.control_name, `${c.control_id} missing control_name`);
    assert.ok(c.category, `${c.control_id} missing category`);
    assert.ok(c.expected_outcome, `${c.control_id} missing expected_outcome`);
    assert.ok(c.failure_condition, `${c.control_id} missing failure_condition`);
    assert.ok(c.failure_code, `${c.control_id} missing failure_code`);
    assert.ok(["critical", "warning"].includes(c.blocking), `${c.control_id} bad blocking`);
    assert.ok(["security_failure", "critical_leak"].includes(c.severity), `${c.control_id} bad severity`);
    assert.ok(c.recommendation, `${c.control_id} missing recommendation`);
  }
});

test("all-PASS adapter run produces PASS evidence", () => {
  const result = buildEvidence(makeAdapterResult());
  assert.equal(result.status, STATUS.PASS);
  assert.equal(result.failures.length, 0);
  assert.equal(result.positive_controls.length, 20);
});

test("cross-tenant read leak projects to CRITICAL_LEAK (blocking)", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-010": { status: "FAIL", execution_time_ms: 5, evidence: { table: "decision_ledger" }, error: { message: "rows returned" } },
    },
  }));
  assert.equal(result.status, STATUS.CRITICAL_LEAK);
  assert.ok(isBlocking(result.status));
  const fail = result.failures.find((f) => f.control_id === "AUTHZ-010");
  assert.equal(fail.code, "CROSS_TENANT_READ_LEAK");
  assert.equal(fail.blocking, true);
});

test("cross-tenant write leak projects to CRITICAL_LEAK", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-014": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "insert accepted" },
    },
  }));
  assert.equal(result.status, STATUS.CRITICAL_LEAK);
});

test("protected route failure projects to SECURITY_FAILURE (blocking, not leak)", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-001": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "selector timeout" },
    },
  }));
  assert.equal(result.status, STATUS.SECURITY_FAILURE);
  assert.ok(isBlocking(result.status));
  const fail = result.failures.find((f) => f.control_id === "AUTHZ-001");
  assert.equal(fail.code, "PROTECTED_ROUTE_FAILURE");
  assert.notEqual(fail.severity, "critical_leak");
});

test("positive-control failure (own-tenant read) is SECURITY_FAILURE not CRITICAL_LEAK", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-008": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "canary missing" },
    },
  }));
  assert.equal(result.status, STATUS.SECURITY_FAILURE);
});

test("SKIP degrades to WARNING (never fake PASS)", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-020": { status: "SKIP", execution_time_ms: 0, evidence: {}, error: "realtime harness not wired" },
    },
  }));
  assert.equal(result.status, STATUS.WARNING);
  assert.equal(isBlocking(result.status), false);
});

test("missing control produces FRAMEWORK_INVALID", () => {
  const base = makeAdapterResult();
  delete base.controls["AUTHZ-016"];
  const result = buildEvidence(base);
  assert.equal(result.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(result.failures.find((f) => f.code === "MISSING_CONTROL" && f.control_id === "AUTHZ-016"));
});

test("invalid adapter status is treated as framework invalid", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-002": { status: "MAYBE", execution_time_ms: 1, evidence: {} },
    },
  }));
  assert.equal(result.status, STATUS.FRAMEWORK_INVALID);
});

test("critical leak trumps security failure and warning", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-001": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "route fail" },
      "AUTHZ-010": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "leak" },
      "AUTHZ-020": { status: "SKIP", execution_time_ms: 0, evidence: {}, error: "no realtime" },
    },
  }));
  assert.equal(result.status, STATUS.CRITICAL_LEAK);
});

test("verify() with no EVIDENCE_AUTHZ_RESULTS returns FRAMEWORK_INVALID", async () => {
  const prev = process.env.EVIDENCE_AUTHZ_RESULTS;
  delete process.env.EVIDENCE_AUTHZ_RESULTS;
  try {
    const record = await verify({});
    assert.equal(record.status, STATUS.FRAMEWORK_INVALID);
    assert.ok(record.failures.some((f) => f.code === "MISSING_ADAPTER_RESULTS"));
  } finally {
    if (prev !== undefined) process.env.EVIDENCE_AUTHZ_RESULTS = prev;
  }
});

test("verify() reads adapter file and yields valid artifact", async () => {
  const path = writeAdapter(makeAdapterResult());
  const prev = process.env.EVIDENCE_AUTHZ_RESULTS;
  process.env.EVIDENCE_AUTHZ_RESULTS = path;
  try {
    const partial = await verify({});
    const record = finalize({ ...partial, start_time: "2026-07-01T00:00:00.000Z" }, {
      start_time: "2026-07-01T00:00:00.000Z",
      commit_sha: "test",
      environment: "preview",
      actor: "test",
      organization: "org_test",
    });
    validateArtifact(record);
    assert.equal(record.status, STATUS.PASS);
    assert.ok(existsSync(path));
  } finally {
    if (prev !== undefined) process.env.EVIDENCE_AUTHZ_RESULTS = prev;
    else delete process.env.EVIDENCE_AUTHZ_RESULTS;
  }
});

test("CRITICAL_LEAK is classified as blocking by the taxonomy gate helper", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTHZ-018": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: "role escalation succeeded" },
    },
  }));
  assert.equal(result.status, STATUS.CRITICAL_LEAK);
  assert.ok(isBlocking(result.status));
});
