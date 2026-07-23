// tests/evidence/__tests__/certification.test.mjs
// Run with: node --test tests/evidence/__tests__/

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getCertification,
  writeCertification,
  historyEntry,
} from "../eval-gate.mjs";
import { deterministicView } from "../lib/certification.mjs";
import { appendHistory } from "../lib/history.mjs";
import { generateRunId, RUN_ID_REGEX } from "../lib/run-id.mjs";
import { GATES, TOTAL_WEIGHT } from "../lib/gates.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

function mkTmp() {
  return mkdtempSync(join(tmpdir(), "ec2-"));
}

function writeEvidence(dayRoot, pipeline, record) {
  const dir = join(dayRoot, pipeline);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "evidence.json"),
    JSON.stringify({
      pipeline,
      start_time: "2026-07-01T00:00:00.000Z",
      end_time: "2026-07-01T00:00:00.001Z",
      commit_sha: "test",
      environment: "preview",
      actor: "test",
      organization: "org_test",
      positive_controls: [],
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
    for (const p of g.pipelines) {
      writeEvidence(dayRoot, p, {
        status: STATUS.PASS,
        positive_controls: [{ name: "seed", status: STATUS.PASS }],
      });
    }
  }
}

test("non allow-list environment produces CRITICAL_BLOCK", () => {
  const root = mkTmp();
  mkdirSync(join(root, "2026-07-01"), { recursive: true });
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "production",
    run_id: "test-run",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.equal(cert.critical_issues, 1);
  assert.equal(cert.blocking_items[0].status, STATUS.SECURITY_FAILURE);
});

test("missing day directory produces CRITICAL_BLOCK", () => {
  const root = mkTmp();
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "test-run",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.equal(cert.blocking_items[0].status, STATUS.FRAMEWORK_INVALID);
});

test("PASS with zero controls downgrades to FRAMEWORK_INVALID", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  // Overwrite one pipeline with vacuous PASS
  writeEvidence(dayRoot, "authentication", {
    status: STATUS.PASS,
    positive_controls: [],
    negative_controls: [],
  });
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "t",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  const auth = cert.pipeline_results.find((g) => g.gate === "authentication");
  const p = auth.evidence.find((x) => x.pipeline === "authentication");
  assert.equal(p.status, STATUS.FRAMEWORK_INVALID);
  assert.equal(p.blocking, true);
});

test("normalized score math: all PASS yields 100", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "t",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(cert.overall_status, "PASS");
  assert.equal(cert.score, 100);
  const earned = cert.score_breakdown.reduce((s, b) => s + b.contribution, 0);
  assert.equal(earned, TOTAL_WEIGHT);
});

test("artifact overwrite protection: writeCertification refuses without --force", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "fixed-run-id",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  const paths = writeCertification({ root, day: "2026-07-01", cert });
  assert.ok(existsSync(paths.jsonPath));
  assert.throws(
    () => writeCertification({ root, day: "2026-07-01", cert }),
    /refusing to overwrite/,
  );
  // force=true succeeds
  writeCertification({ root, day: "2026-07-01", cert, force: true });
});

test("corrupt history is quarantined, new history written", () => {
  const root = mkTmp();
  const historyPath = join(root, "history.json");
  writeFileSync(historyPath, "{ not json");
  const res = appendHistory(historyPath, {
    run_id: "r1",
    release: "v1",
    commit: "c1",
    environment: "preview",
    overall_status: "PASS",
    score: 100,
  });
  assert.ok(res.quarantined, "corrupt file quarantined");
  assert.ok(existsSync(res.quarantined));
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  assert.equal(history.length, 1);
});

test("history dedupes by (release, commit, environment, run_id)", () => {
  const root = mkTmp();
  const historyPath = join(root, "history.json");
  const entry = {
    run_id: "r1",
    release: "v1",
    commit: "c1",
    environment: "preview",
    overall_status: "PASS",
    score: 100,
  };
  appendHistory(historyPath, entry);
  appendHistory(historyPath, { ...entry, score: 90 });
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  assert.equal(history.length, 1);
  assert.equal(history[0].score, 90);
});

test("run_id has expected shape and is unique across calls", () => {
  const ids = new Set();
  for (let i = 0; i < 50; i++) {
    const id = generateRunId();
    assert.match(id, RUN_ID_REGEX, `bad run id shape: ${id}`);
    ids.add(id);
  }
  assert.equal(ids.size, 50);
});

test("deterministic fields are reproducible for identical evidence", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const a = getCertification({
    day: "2026-07-01", root, environment: "preview",
    run_id: "A", timestamp: "2026-07-01T00:00:00.000Z", duration_ms: 0,
  });
  const b = getCertification({
    day: "2026-07-01", root, environment: "preview",
    run_id: "B", timestamp: "2026-07-01T01:00:00.000Z", duration_ms: 999,
  });
  assert.deepEqual(deterministicView(a), deterministicView(b));
});

test("every certification carries engine version + full provenance", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01",
    root,
    release: "v9.9.9",
    commit: "deadbeef",
    branch: "main",
    repository: "quantivis/app",
    environment: "preview",
    generated_by: "ci",
    run_id: "r",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  assert.equal(cert.certification_engine_version, "1.0.0");
  for (const k of ["run_id","release","commit","branch","repository","environment","generated_by"]) {
    assert.ok(cert[k], `provenance field missing: ${k}`);
  }
  const h = historyEntry(cert);
  for (const k of ["run_id","release","commit","branch","repository","environment","certification_engine_version"]) {
    assert.ok(h[k], `history entry missing: ${k}`);
  }
});

test("gates.mjs and RELEASE_GATE.md are in sync (docs generator)", async () => {
  const { spawnSync } = await import("node:child_process");
  const res = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--check"], {
    encoding: "utf8",
  });
  assert.equal(res.status, 0, `generate-docs --check failed:\n${res.stdout}${res.stderr}`);
});
