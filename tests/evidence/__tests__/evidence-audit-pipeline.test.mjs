// tests/evidence/__tests__/evidence-audit-pipeline.test.mjs
// EE-4 regression suite for Evidence & Audit Trail evidence pipelines.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  EVIDENCE_AUDIT_CONTROLS,
  EVIDENCE_AUDIT_CONTROL_INDEX,
  PIPELINE_CONTROL_IDS,
} from "../pipelines/lib/evidence-audit-controls.mjs";
import { translate, parseArgs } from "../adapters/evidence-audit-adapter.mjs";
import {
  buildEvidence as buildAttachmentEvidence,
  meta as attachmentMeta,
  verify as verifyAttachment,
} from "../pipelines/evidence-attachment.mjs";
import { buildEvidence as buildRetrievalEvidence } from "../pipelines/evidence-retrieval.mjs";
import { buildEvidence as buildExportEvidence } from "../pipelines/evidence-export.mjs";
import { buildEvidence as buildAuditEvidence } from "../pipelines/audit-trail.mjs";
import { STATUS, isBlocking } from "../lib/taxonomy.mjs";
import { validate as validateArtifact } from "../lib/artifact.mjs";
import { finalize } from "../lib/pipeline.mjs";

const ALL_IDS = [
  "EVD-001",
  "EVD-002",
  "EVD-003",
  "EVD-004",
  "EVD-005",
  "EVD-006",
  "EVD-007",
  "EVD-008",
  "EVD-009",
  "EVD-010",
];

function makeRawEvidence(overrides = {}) {
  const controls = {};
  for (const id of ALL_IDS) {
    controls[id] = {
      status: "PASS",
      execution_time_ms: 4,
      evidence: {
        decision_id: "dec_ee4",
        evidence_id: "ev_ee4",
        audit_id: "aud_ee4",
        organization_id: "org_ee4",
        actor_id: "user_ee4",
        chain_hash: "sha256:abc",
        previous_hash: "sha256:prev",
        citation: { source: "board-pack", page: 7, quote_hash: "sha256:quote" },
        timeline: [
          { at: "2026-07-02T00:00:00.000Z", event: "evidence_attached" },
          { at: "2026-07-02T00:00:01.000Z", event: "audit_written" },
        ],
        request: { method: "POST" },
        response: { status: 200 },
        export: { available: true, format: "json" },
      },
      error: null,
    };
  }
  return {
    adapter: "test",
    collected_at: "2026-07-02T00:00:00.000Z",
    environment: "preview",
    sources: {
      evidence_harness: "manual://ee4",
      audit_harness: "manual://ee4",
    },
    controls: { ...controls, ...(overrides.controls ?? {}) },
  };
}

function finalized(record) {
  return finalize(record, {
    start_time: "2026-07-02T00:00:00.000Z",
    commit_sha: "test",
    environment: "preview",
    actor: "test",
    organization: "org_test",
  });
}

test("control registry covers the EE-4 evidence and audit requirements", () => {
  assert.deepEqual(EVIDENCE_AUDIT_CONTROLS.map((c) => c.control_id), ALL_IDS);
  assert.equal(new Set(EVIDENCE_AUDIT_CONTROLS.map((c) => c.control_id)).size, ALL_IDS.length);
  for (const control of EVIDENCE_AUDIT_CONTROLS) {
    assert.equal(EVIDENCE_AUDIT_CONTROL_INDEX[control.control_id], control);
    assert.ok(control.pipeline);
    assert.ok(control.failure_code);
    assert.ok(["security_failure", "critical_failure"].includes(control.severity));
  }
  assert.deepEqual(PIPELINE_CONTROL_IDS["evidence-attachment"], ["EVD-001", "EVD-003"]);
  assert.deepEqual(PIPELINE_CONTROL_IDS["evidence-retrieval"], ["EVD-002", "EVD-004", "EVD-010"]);
  assert.deepEqual(PIPELINE_CONTROL_IDS["evidence-export"], ["EVD-008"]);
  assert.deepEqual(PIPELINE_CONTROL_IDS["audit-trail"], ["EVD-005", "EVD-006", "EVD-007", "EVD-009"]);
});

test("adapter translates raw evidence/audit controls into pipeline contract", () => {
  const { result, missing, warnings } = translate(makeRawEvidence(), { strict: true });
  assert.equal(missing.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(result.adapter, "evidence-audit-adapter");
  assert.equal(Object.keys(result.controls).length, 10);
});

test("all PASS evidence satisfies attachment, retrieval, export, and audit pipelines", () => {
  const { result } = translate(makeRawEvidence(), { strict: true });
  for (const build of [buildAttachmentEvidence, buildRetrievalEvidence, buildExportEvidence, buildAuditEvidence]) {
    const out = build(result);
    assert.equal(out.status, STATUS.PASS);
    assert.ok(out.positive_controls.length > 0);
    assert.equal(out.failures.length, 0);
    validateArtifact(finalized(out));
  }
});

test("tamper attempts denied control failure projects to CRITICAL_FAILURE", () => {
  const { result } = translate(makeRawEvidence({
    controls: {
      "EVD-009": { status: "FAIL", error: { message: "tamper update returned 200" } },
    },
  }));
  const out = buildAuditEvidence(result);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
  assert.ok(isBlocking(out.status));
  assert.ok(out.failures.some((f) => f.code === "EVIDENCE_TAMPER_ALLOWED"));
});

test("missing evidence detection failure blocks retrieval pipeline", () => {
  const { result } = translate(makeRawEvidence({
    controls: {
      "EVD-010": { status: "FAIL", error: { message: "missing evidence silently ignored" } },
    },
  }));
  const out = buildRetrievalEvidence(result);
  assert.equal(out.status, STATUS.SECURITY_FAILURE);
  assert.ok(out.failures.some((f) => f.code === "MISSING_EVIDENCE_NOT_DETECTED"));
});

test("missing required control yields FRAMEWORK_INVALID", () => {
  const raw = makeRawEvidence();
  delete raw.controls["EVD-004"];
  const { result } = translate(raw);
  const out = buildRetrievalEvidence(result);
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(out.failures.some((f) => f.code === "MISSING_CONTROL" && f.control_id === "EVD-004"));
});

test("verify() refuses to fake evidence without EVIDENCE_AUDIT_RESULTS", async () => {
  delete process.env.EVIDENCE_AUDIT_RESULTS;
  const out = await verifyAttachment({});
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
});

test("verify() reads adapter JSON via EVIDENCE_AUDIT_RESULTS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ee4-"));
  const path = join(dir, "evidence-audit.json");
  writeFileSync(path, JSON.stringify(makeRawEvidence()));
  process.env.EVIDENCE_AUDIT_RESULTS = path;
  try {
    const out = await verifyAttachment({});
    assert.equal(out.pipeline, attachmentMeta.name);
    assert.equal(out.status, STATUS.PASS);
  } finally {
    delete process.env.EVIDENCE_AUDIT_RESULTS;
  }
});

test("adapter parseArgs supports documented CLI flags", () => {
  assert.deepEqual(
    parseArgs(["--input", "raw.json", "--output", "out.json", "--strict"]),
    { input: "raw.json", output: "out.json", strict: true, help: false },
  );
});
