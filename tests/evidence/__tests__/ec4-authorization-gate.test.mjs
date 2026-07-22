// tests/evidence/__tests__/ec4-authorization-gate.test.mjs
// EC-4 regression: authorization gate wires the EE-2 `authorization` pipeline.
//
// Guarantees:
//   1. The authorization gate references the `authorization` pipeline.
//   2. The legacy authz stubs (protected-routes, user-management,
//      organization-management, settings) are retired to prevent double-count.
//   3. A passing `authorization` pipeline satisfies the gate.
//   4. A `CRITICAL_LEAK` from `authorization` blocks certification.
//   5. Docs stay in sync with gates.mjs (delegates to generate-docs --check).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { GATES } from "../lib/gates.mjs";
import { getCertification } from "../eval-gate.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

const RETIRED_STUBS = new Set([
  "protected-routes",
  "user-management",
  "organization-management",
  "settings",
]);

function mkTmp() {
  return mkdtempSync(join(tmpdir(), "ec4-"));
}

function writeEvidence(dayRoot, pipeline, record) {
  const dir = join(dayRoot, pipeline);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "evidence.json"),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
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

test("authorization gate registers the EE-2 authorization pipeline", () => {
  const authz = GATES.find((g) => g.key === "authorization");
  assert.ok(authz, "authorization gate must exist");
  assert.ok(
    authz.pipelines.includes("authorization"),
    `authorization gate must include the 'authorization' pipeline, got: ${authz.pipelines.join(", ")}`,
  );
});

test("retired authorization stubs are no longer required by any gate", () => {
  for (const gate of GATES) {
    for (const p of gate.pipelines) {
      assert.ok(
        !RETIRED_STUBS.has(p),
        `gate "${gate.key}" still references retired stub pipeline "${p}"`,
      );
    }
  }
});

test("authorization gate lists no duplicate pipelines (no double-counting)", () => {
  const authz = GATES.find((g) => g.key === "authorization");
  const set = new Set(authz.pipelines);
  assert.equal(
    set.size,
    authz.pipelines.length,
    "authorization gate pipelines must be unique",
  );
});

test("a passing authorization pipeline satisfies the authorization gate", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "ec4-pass",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  const gate = cert.pipeline_results.find((g) => g.gate === "authorization");
  assert.ok(gate, "authorization gate must appear in pipeline_results");
  assert.equal(gate.status, "PASS");
  assert.equal(gate.blocking, false);
  assert.equal(cert.overall_status, "PASS");
  // The authorization gate must have evaluated the new pipeline.
  const authzEvidence = gate.evidence.find((e) => e.pipeline === "authorization");
  assert.ok(authzEvidence, "authorization evidence entry must be present");
  assert.equal(authzEvidence.status, STATUS.PASS);
});

test("a CRITICAL_LEAK from the authorization pipeline blocks certification", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  writeEvidence(dayRoot, "authorization", {
    status: STATUS.CRITICAL_LEAK,
    positive_controls: [],
    negative_controls: [
      { name: "AUTHZ-006", status: STATUS.CRITICAL_LEAK, detail: { table: "decision_ledger" } },
    ],
    failures: [
      {
        code: "CROSS_TENANT_READ",
        control_id: "AUTHZ-006",
        blocking: true,
        severity: "critical_leak",
        message: "org_a read org_b decision_ledger row",
      },
    ],
  });
  const cert = getCertification({
    day: "2026-07-01",
    root,
    environment: "preview",
    run_id: "ec4-leak",
    timestamp: "2026-07-01T00:00:00.000Z",
  });
  const gate = cert.pipeline_results.find((g) => g.gate === "authorization");
  assert.equal(gate.status, "BLOCKED");
  assert.equal(gate.blocking, true);
  assert.equal(cert.overall_status, "CRITICAL_BLOCK");
  assert.ok(
    cert.blocking_items.some(
      (b) => b.pipeline === "authorization" && b.status === STATUS.CRITICAL_LEAK,
    ),
    "authorization CRITICAL_LEAK must appear in blocking_items",
  );
});

test("gates.mjs and enterprise docs are in sync (generate-docs --check)", () => {
  const res = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--check"], {
    encoding: "utf8",
  });
  assert.equal(
    res.status,
    0,
    `generate-docs --check failed:\n${res.stdout}${res.stderr}`,
  );
});
