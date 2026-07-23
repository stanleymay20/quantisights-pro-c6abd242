// tests/evidence/__tests__/authentication-pipeline.test.mjs
// EE-1 regression suite for the Authentication evidence pipeline.
// Run with: npm run evidence:test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verify, buildEvidence, meta, CONTROLS } from "../pipelines/authentication.mjs";
import { AUTH_CONTROLS, REQUIRED_CONTROL_IDS } from "../pipelines/lib/auth-controls.mjs";
import { STATUS, isBlocking } from "../lib/taxonomy.mjs";
import { validate as validateArtifact } from "../lib/artifact.mjs";
import { finalize } from "../lib/pipeline.mjs";

function makeAdapterResult(overrides = {}) {
  const controls = {};
  for (const c of AUTH_CONTROLS) {
    controls[c.control_id] = {
      status: "PASS",
      execution_time_ms: 10,
      evidence: {
        route: "/login",
        response_status: 200,
        redirect_chain: ["/login"],
        session_state: { user_id: "seed", aal: "aal1" },
        auth_state: "signed_in",
        console_errors: [],
        network_failures: [],
        screenshots: [],
      },
      error: null,
    };
  }
  const { controls: overrideControls, ...rest } = overrides;
  return {
    adapter: "test",
    collected_at: "2026-07-01T00:00:00.000Z",
    environment: "preview",
    ...rest,
    controls: { ...controls, ...(overrideControls ?? {}) },
  };
}

function writeAdapter(result) {
  const dir = mkdtempSync(join(tmpdir(), "ee1-auth-"));
  const path = join(dir, "auth-evidence.json");
  writeFileSync(path, JSON.stringify(result, null, 2));
  return path;
}

test("pipeline metadata matches gate registry", () => {
  assert.equal(meta.name, "authentication");
  assert.equal(meta.gate, "Authentication");
});

test("all 15 required controls are declared", () => {
  assert.equal(CONTROLS.length, 15);
  assert.equal(REQUIRED_CONTROL_IDS.length, 15);
  for (const c of CONTROLS) {
    assert.ok(c.control_id, "control_id required");
    assert.ok(c.control_name, "control_name required");
    assert.ok(c.expected_outcome, `${c.control_id} missing expected_outcome`);
    assert.ok(c.failure_condition, `${c.control_id} missing failure_condition`);
    assert.ok(c.failure_code, `${c.control_id} missing failure_code`);
    assert.ok(["critical", "warning"].includes(c.blocking), `${c.control_id} bad blocking`);
    assert.ok(c.recommendation, `${c.control_id} missing recommendation`);
  }
});

test("successful adapter run produces PASS evidence", () => {
  const result = buildEvidence(makeAdapterResult());
  assert.equal(result.status, STATUS.PASS);
  assert.equal(result.failures.length, 0);
  assert.equal(result.positive_controls.length, 15);
});

test("failed critical control produces SECURITY_FAILURE (blocking)", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTH-001": { status: "FAIL", execution_time_ms: 5, evidence: {}, error: { message: "bad password" } },
    },
  }));
  assert.equal(result.status, STATUS.SECURITY_FAILURE);
  assert.ok(isBlocking(result.status), "SECURITY_FAILURE must be blocking");
  const fail = result.failures.find((f) => f.control_id === "AUTH-001");
  assert.ok(fail, "AUTH-001 failure recorded");
  assert.equal(fail.code, "AUTH_FAILURE");
  assert.equal(fail.blocking, true);
});

test("failed warning-tier control degrades to WARNING (non-blocking)", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTH-014": { status: "FAIL", execution_time_ms: 3, evidence: {}, error: "duplicate fetch" },
    },
  }));
  assert.equal(result.status, STATUS.WARNING);
  assert.equal(isBlocking(result.status), false);
});

test("missing control produces FRAMEWORK_INVALID", () => {
  const base = makeAdapterResult();
  delete base.controls["AUTH-004"];
  const result = buildEvidence(base);
  assert.equal(result.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(result.failures.find((f) => f.code === "MISSING_CONTROL" && f.control_id === "AUTH-004"));
});

test("invalid adapter status is treated as framework invalid", () => {
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTH-002": { status: "MAYBE", execution_time_ms: 1, evidence: {} },
    },
  }));
  assert.equal(result.status, STATUS.FRAMEWORK_INVALID);
});

test("verify() with no EVIDENCE_AUTH_RESULTS returns FRAMEWORK_INVALID", async () => {
  const prev = process.env.EVIDENCE_AUTH_RESULTS;
  delete process.env.EVIDENCE_AUTH_RESULTS;
  try {
    const record = await verify({});
    assert.equal(record.status, STATUS.FRAMEWORK_INVALID);
    assert.ok(record.failures.some((f) => f.code === "MISSING_ADAPTER_RESULTS"));
  } finally {
    if (prev !== undefined) process.env.EVIDENCE_AUTH_RESULTS = prev;
  }
});

test("verify() reads adapter file and yields valid artifact", async () => {
  const path = writeAdapter(makeAdapterResult());
  const prev = process.env.EVIDENCE_AUTH_RESULTS;
  process.env.EVIDENCE_AUTH_RESULTS = path;
  try {
    const partial = await verify({});
    const record = finalize({ ...partial, start_time: "2026-07-01T00:00:00.000Z" }, {
      start_time: "2026-07-01T00:00:00.000Z",
      commit_sha: "test",
      environment: "preview",
      actor: "test",
      organization: "org_test",
    });
    // Runner-level schema validation must accept the record.
    validateArtifact(record);
    assert.equal(record.status, STATUS.PASS);
    assert.ok(existsSync(path));
  } finally {
    if (prev !== undefined) process.env.EVIDENCE_AUTH_RESULTS = prev;
    else delete process.env.EVIDENCE_AUTH_RESULTS;
  }
});

test("blocked authentication prevents certification (integration with gates)", async () => {
  // A SECURITY_FAILURE artifact must be classified as blocking by the taxonomy
  // helper the certification engine consumes.
  const result = buildEvidence(makeAdapterResult({
    controls: {
      "AUTH-004": { status: "FAIL", execution_time_ms: 1, evidence: {}, error: "pkce double exchange" },
    },
  }));
  assert.equal(result.status, STATUS.SECURITY_FAILURE);
  assert.ok(isBlocking(result.status));
});
