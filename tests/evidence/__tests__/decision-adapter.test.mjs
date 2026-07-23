// tests/evidence/__tests__/decision-adapter.test.mjs
// EE-3 regression suite for the decision-adapter translator.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  translate,
  extractControls,
  emptyEvidence,
  DECISION_EVIDENCE_FIELDS,
  parseArgs,
} from "../adapters/decision-adapter.mjs";
import { DECISION_REQUIRED_CONTROL_IDS } from "../pipelines/lib/decision-controls.mjs";
import { buildEvidence } from "../pipelines/decision-lifecycle.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

function pipelineShape(map) {
  return { controls: map };
}
function recordsShape(list) {
  return { records: list };
}

test("emptyEvidence contains all EE-3 evidence fields", () => {
  const e = emptyEvidence();
  for (const f of DECISION_EVIDENCE_FIELDS) assert.ok(f in e, `missing ${f}`);
});

test("extractControls: pipeline shape roundtrip", () => {
  const out = extractControls(pipelineShape({
    "DEC-001": { status: "PASS", evidence: { decision_id: "d1" } },
  }));
  assert.equal(out["DEC-001"].status, "PASS");
  assert.equal(out["DEC-001"].evidence.decision_id, "d1");
});

test("extractControls: flat records shape roundtrip", () => {
  const out = extractControls(recordsShape([
    { control_id: "DEC-002", status: "FAIL" },
  ]));
  assert.equal(out["DEC-002"].status, "FAIL");
});

test("extractControls ignores invalid status", () => {
  const out = extractControls(pipelineShape({ "DEC-001": { status: "WEIRD" } }));
  assert.deepEqual(out, {});
});

test("translate: no inputs → all 25 SKIP with warnings", () => {
  const { result, missing, warnings } = translate({});
  assert.equal(Object.keys(result.controls).length, 25);
  for (const id of DECISION_REQUIRED_CONTROL_IDS) {
    assert.equal(result.controls[id].status, "SKIP");
  }
  assert.equal(missing.length, 25);
  assert.equal(warnings.length, 25);
});

test("translate: strict mode throws on missing controls", () => {
  assert.throws(
    () => translate({ strict: true }),
    (err) => err.code === "MISSING_DECISION_CONTROLS" && err.missing.length === 25,
  );
});

test("translate: FAIL beats PASS beats SKIP on merge", () => {
  const workflow = pipelineShape({ "DEC-001": { status: "PASS" } });
  const browser = pipelineShape({ "DEC-001": { status: "FAIL", error: { message: "bad" } } });
  const audit = pipelineShape({ "DEC-001": { status: "SKIP" } });
  const { result } = translate({ workflow, audit, browser });
  assert.equal(result.controls["DEC-001"].status, "FAIL");
});

test("translate: multi-source coverage — each source fills different controls", () => {
  const workflow = pipelineShape({
    "DEC-001": { status: "PASS" }, "DEC-009": { status: "PASS" },
  });
  const audit = pipelineShape({
    "DEC-011": { status: "PASS" }, "DEC-013": { status: "PASS" }, "DEC-014": { status: "PASS" },
  });
  const report = pipelineShape({
    "DEC-021": { status: "PASS" }, "DEC-022": { status: "PASS" }, "DEC-023": { status: "PASS" },
  });
  const browser = pipelineShape({ "DEC-025": { status: "PASS" } });
  const { result, missing } = translate({ workflow, audit, report, browser });
  assert.equal(result.controls["DEC-001"].status, "PASS");
  assert.equal(result.controls["DEC-025"].status, "PASS");
  // Unreported controls still SKIP
  assert.equal(result.controls["DEC-002"].status, "SKIP");
  assert.ok(missing.includes("DEC-002"));
});

test("translate output flows cleanly into pipeline.buildEvidence", () => {
  const inputs = {};
  const controls = {};
  for (const id of DECISION_REQUIRED_CONTROL_IDS) controls[id] = { status: "PASS", evidence: {} };
  inputs.workflow = pipelineShape(controls);
  const { result } = translate(inputs);
  const evidence = buildEvidence(result);
  assert.equal(evidence.status, STATUS.PASS);
  assert.equal(evidence.positive_controls.length, 25);
});

test("translate output with SKIPs produces WARNING pipeline status", () => {
  const controls = {};
  for (const id of DECISION_REQUIRED_CONTROL_IDS) controls[id] = { status: "PASS", evidence: {} };
  delete controls["DEC-007"]; // simulate LLM harness absent
  const { result } = translate({ workflow: pipelineShape(controls) });
  const evidence = buildEvidence(result);
  assert.equal(evidence.status, STATUS.WARNING);
});

test("parseArgs recognizes all supported flags", () => {
  const args = parseArgs([
    "--workflow", "w.json", "--audit", "a.json", "--report", "r.json",
    "--browser", "b.json", "-o", "out.json", "--strict",
  ]);
  assert.equal(args.workflow, "w.json");
  assert.equal(args.audit, "a.json");
  assert.equal(args.report, "r.json");
  assert.equal(args.browser, "b.json");
  assert.equal(args.output, "out.json");
  assert.equal(args.strict, true);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]));
});
