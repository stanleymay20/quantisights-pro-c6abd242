// DV-1 regression coverage: deployment artifact verification must compare the
// expected GitHub commit to the commit marker currently served by production.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  parseDeploymentMarkers,
  classifyDeployment,
  buildDeploymentVerification,
} from "../lib/deployment-verification.mjs";
import { GATES } from "../lib/gates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function mkTmp() {
  return mkdtempSync(join(tmpdir(), "dv1-"));
}

const HTML = String.raw`<!doctype html>
<html>
  <head>
    <script type="module" crossorigin src="/assets/index-B0n4hb0K.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-D1WM6Exb.css">
    <script defer src="/__l5e/events.js"
      data-artifact-kind="cf_deployment_id"
      data-artifact-id="2627d608-1121-4e98-979d-9fb92aa043e7"
      data-commit-sha="d5735f2729fdfcfdc6ec4f93ec26b0bae014c155"></script>
  </head>
</html>`;

test("parseDeploymentMarkers extracts commit, artifact, deployment id, and asset hashes", () => {
  const markers = parseDeploymentMarkers(HTML, {
    headers: { "x-deployment-id": "2627d608-1121-4e98-979d-9fb92aa043e7" },
  });

  assert.equal(markers.commit_sha, "d5735f2729fdfcfdc6ec4f93ec26b0bae014c155");
  assert.equal(markers.artifact_id, "2627d608-1121-4e98-979d-9fb92aa043e7");
  assert.equal(markers.deployment_id, "2627d608-1121-4e98-979d-9fb92aa043e7");
  assert.deepEqual(markers.asset_hashes, ["index-B0n4hb0K.js", "index-D1WM6Exb.css"]);
});

test("classifyDeployment returns PASS when expected and deployed commits match", () => {
  assert.equal(
    classifyDeployment({
      expectedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
      deployedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
    }),
    "PASS",
  );
});

test("classifyDeployment returns PENDING when production is serving a different commit", () => {
  assert.equal(
    classifyDeployment({
      expectedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
      deployedCommit: "d5735f2729fdfcfdc6ec4f93ec26b0bae014c155",
    }),
    "PENDING",
  );
});

test("classifyDeployment returns FAILED when production lacks a commit marker", () => {
  assert.equal(
    classifyDeployment({
      expectedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
      deployedCommit: null,
    }),
    "FAILED",
  );
});

test("buildDeploymentVerification writes deployment-verification.json with evidence details", () => {
  const root = mkTmp();
  const result = buildDeploymentVerification({
    expectedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
    productionUrl: "https://www.quantivis.io/",
    html: HTML,
    headers: { "x-deployment-id": "2627d608-1121-4e98-979d-9fb92aa043e7" },
    outputDir: root,
    now: () => "2026-07-03T00:00:00.000Z",
  });

  assert.equal(result.status, "PENDING");
  assert.ok(existsSync(result.output_path));
  const artifact = JSON.parse(readFileSync(result.output_path, "utf8"));
  assert.equal(artifact.status, "PENDING");
  assert.equal(artifact.expected_commit, "c25a8700fc01d911a06fd89fc1757dda227ead20");
  assert.equal(artifact.deployed_commit, "d5735f2729fdfcfdc6ec4f93ec26b0bae014c155");
  assert.equal(artifact.artifact_id, "2627d608-1121-4e98-979d-9fb92aa043e7");
  assert.equal(artifact.deployment_id, "2627d608-1121-4e98-979d-9fb92aa043e7");
  assert.deepEqual(artifact.asset_hashes, ["index-B0n4hb0K.js", "index-D1WM6Exb.css"]);
});

test("buildDeploymentVerification writes FAILED artifact when production HTML is unavailable", () => {
  const root = mkTmp();
  const result = buildDeploymentVerification({
    expectedCommit: "c25a8700fc01d911a06fd89fc1757dda227ead20",
    productionUrl: "https://www.quantivis.io/",
    html: "",
    errors: [{ code: "FETCH_FAILED", message: "fetch failed" }],
    outputDir: root,
    now: () => "2026-07-03T00:00:00.000Z",
  });

  assert.equal(result.status, "FAILED");
  const artifact = JSON.parse(readFileSync(result.output_path, "utf8"));
  assert.equal(artifact.status, "FAILED");
  assert.equal(artifact.deployed_commit, null);
  assert.deepEqual(artifact.errors, [{ code: "FETCH_FAILED", message: "fetch failed" }]);
});

test("deployment verification CLI exits non-zero on mismatch", () => {
  const root = mkTmp();
  const res = spawnSync(
    "node",
    [
      "tests/evidence/deployment-verification.mjs",
      "--expected-commit",
      "c25a8700fc01d911a06fd89fc1757dda227ead20",
      "--html-file",
      "-",
      "--output-dir",
      root,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      input: HTML,
    },
  );

  assert.notEqual(res.status, 0);
  assert.match(res.stdout, /PENDING/);
  assert.ok(existsSync(join(root, "deployment-verification.json")));
});

test("system health gate includes deployment-verification evidence pipeline", () => {
  const gate = GATES.find((g) => g.key === "system_health");
  assert.ok(gate, "system_health gate must exist");
  assert.ok(gate.pipelines.includes("deployment-verification"));
});
