// tests/evidence/__tests__/ai-pipeline.test.mjs
// EE-5 regression suite for mocked AI recommendation, explanation, and
// confidence evidence pipelines. No live AI provider is called.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AI_CONTROLS,
  AI_CONTROL_INDEX,
  AI_PIPELINE_CONTROL_IDS,
} from "../pipelines/lib/ai-controls.mjs";
import { translate, parseArgs } from "../adapters/ai-adapter.mjs";
import {
  buildEvidence as buildRecommendationEvidence,
  verify as verifyRecommendation,
} from "../pipelines/ai-recommendation.mjs";
import { buildEvidence as buildExplanationEvidence } from "../pipelines/ai-explanation.mjs";
import { buildEvidence as buildConfidenceEvidence } from "../pipelines/confidence-scoring.mjs";
import { STATUS, isBlocking } from "../lib/taxonomy.mjs";
import { validate as validateArtifact } from "../lib/artifact.mjs";
import { finalize } from "../lib/pipeline.mjs";

const ALL_IDS = [
  "AI-001",
  "AI-002",
  "AI-003",
  "AI-004",
  "AI-005",
  "AI-006",
  "AI-007",
  "AI-008",
  "AI-009",
  "AI-010",
  "AI-011",
];

function makeRaw(overrides = {}) {
  const controls = {};
  for (const id of ALL_IDS) {
    controls[id] = {
      status: "PASS",
      execution_time_ms: 5,
      evidence: {
        mode: "mocked_ai",
        provider: "mock",
        recommendation_id: "rec_ee5",
        decision_id: "dec_ee5",
        explanation_id: "exp_ee5",
        confidence_score: 82,
        citations: [{ id: "ev_1", source: "evidence-pack", quote_hash: "sha256:quote" }],
        fallback_used: ["AI-007", "AI-008", "AI-009"].includes(id),
        response: { status: 200, model: "mock-ai" },
        parsed: { recommendation: "Proceed", explanation_layers: 7 },
      },
      error: null,
    };
  }
  return {
    adapter: "test",
    collected_at: "2026-07-02T00:00:00.000Z",
    environment: "preview",
    mode: "mocked_ai",
    sources: { mocked_ai_evidence: "manual://ee5" },
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

test("AI control registry covers recommendation, explanation, confidence, failure modes, and mocked mode", () => {
  assert.deepEqual(AI_CONTROLS.map((c) => c.control_id), ALL_IDS);
  assert.equal(new Set(AI_CONTROLS.map((c) => c.control_id)).size, ALL_IDS.length);
  for (const control of AI_CONTROLS) {
    assert.equal(AI_CONTROL_INDEX[control.control_id], control);
    assert.ok(control.pipeline);
    assert.ok(control.failure_code);
    assert.ok(["security_failure", "critical_failure"].includes(control.severity));
  }
  assert.ok(AI_PIPELINE_CONTROL_IDS["ai-recommendation"].includes("AI-001"));
  assert.ok(AI_PIPELINE_CONTROL_IDS["ai-explanation"].includes("AI-002"));
  assert.ok(AI_PIPELINE_CONTROL_IDS["confidence-scoring"].includes("AI-003"));
  assert.ok(AI_PIPELINE_CONTROL_IDS["confidence-scoring"].includes("AI-004"));
});

test("adapter translates mocked AI evidence into pipeline contract", () => {
  const { result, missing, warnings } = translate(makeRaw(), { strict: true });
  assert.equal(result.adapter, "ai-adapter");
  assert.equal(result.mode, "mocked_ai");
  assert.equal(Object.keys(result.controls).length, 11);
  assert.equal(missing.length, 0);
  assert.equal(warnings.length, 0);
});

test("all PASS mocked AI evidence satisfies recommendation, explanation, and confidence pipelines", () => {
  const { result } = translate(makeRaw(), { strict: true });
  for (const build of [buildRecommendationEvidence, buildExplanationEvidence, buildConfidenceEvidence]) {
    const out = build(result);
    assert.equal(out.status, STATUS.PASS);
    assert.ok(out.positive_controls.length > 0);
    assert.equal(out.failures.length, 0);
    validateArtifact(finalized(out));
  }
});

test("confidence score outside 0-100 projects to CRITICAL_FAILURE", () => {
  const { result } = translate(makeRaw({
    controls: {
      "AI-004": {
        status: "FAIL",
        evidence: { confidence_score: 120, mode: "mocked_ai" },
        error: { message: "confidence score exceeded 100" },
      },
    },
  }));
  const out = buildConfidenceEvidence(result);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
  assert.ok(isBlocking(out.status));
  assert.ok(out.failures.some((f) => f.code === "CONFIDENCE_SCORE_OUT_OF_BOUNDS"));
});

test("hallucination guard / missing citation failure blocks recommendation", () => {
  const { result } = translate(makeRaw({
    controls: {
      "AI-010": {
        status: "FAIL",
        evidence: { citations: [], mode: "mocked_ai" },
        error: { message: "recommendation lacks supporting citation" },
      },
    },
  }));
  const out = buildRecommendationEvidence(result);
  assert.equal(out.status, STATUS.CRITICAL_FAILURE);
  assert.ok(out.failures.some((f) => f.code === "AI_HALLUCINATION_GUARD_FAILED"));
});

test("malformed AI response handling failure blocks recommendation", () => {
  const { result } = translate(makeRaw({
    controls: {
      "AI-006": { status: "FAIL", error: { message: "malformed JSON accepted" } },
    },
  }));
  const out = buildRecommendationEvidence(result);
  assert.equal(out.status, STATUS.SECURITY_FAILURE);
  assert.ok(out.failures.some((f) => f.code === "MALFORMED_AI_RESPONSE_ACCEPTED"));
});

test("timeout, 429, and fallback controls are required and block on failure", () => {
  for (const [id, code] of [
    ["AI-007", "AI_TIMEOUT_NOT_HANDLED"],
    ["AI-008", "AI_RATE_LIMIT_NOT_HANDLED"],
    ["AI-009", "AI_FALLBACK_FAILURE"],
  ]) {
    const { result } = translate(makeRaw({ controls: { [id]: { status: "FAIL" } } }));
    const out = buildRecommendationEvidence(result);
    assert.equal(out.status, STATUS.SECURITY_FAILURE);
    assert.ok(out.failures.some((f) => f.code === code));
  }
});

test("missing mocked AI mode produces FRAMEWORK_INVALID", () => {
  const raw = makeRaw();
  delete raw.controls["AI-011"];
  const { result } = translate(raw);
  const out = buildRecommendationEvidence(result);
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
  assert.ok(out.failures.some((f) => f.code === "MISSING_CONTROL" && f.control_id === "AI-011"));
});

test("verify() refuses to fake AI evidence without EVIDENCE_AI_RESULTS", async () => {
  delete process.env.EVIDENCE_AI_RESULTS;
  const out = await verifyRecommendation({});
  assert.equal(out.status, STATUS.FRAMEWORK_INVALID);
});

test("verify() reads mocked AI evidence via EVIDENCE_AI_RESULTS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ee5-"));
  const path = join(dir, "ai-results.json");
  writeFileSync(path, JSON.stringify(makeRaw()));
  process.env.EVIDENCE_AI_RESULTS = path;
  try {
    const out = await verifyRecommendation({});
    assert.equal(out.pipeline, "ai-recommendation");
    assert.equal(out.status, STATUS.PASS);
  } finally {
    delete process.env.EVIDENCE_AI_RESULTS;
  }
});

test("adapter parseArgs supports documented CLI flags", () => {
  assert.deepEqual(
    parseArgs(["--input", "raw.json", "--output", "out.json", "--strict"]),
    { input: "raw.json", output: "out.json", strict: true, help: false },
  );
});
