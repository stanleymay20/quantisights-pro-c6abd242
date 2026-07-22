// tests/evidence/__tests__/ec3-hardening.test.mjs
// EC-3 regression coverage: doc determinism, docs parity for CERTIFICATION_ENGINE,
// TOTAL_WEIGHT parity, concurrent cert write collision, --force backup, history lock.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  normalize,
  renderReleaseBlock,
  renderMatrixBlock,
  renderEngineBlock,
} from "../generate-docs.mjs";
import { GATES, TOTAL_WEIGHT } from "../lib/gates.mjs";
import { STATUS } from "../lib/taxonomy.mjs";
import { getCertification, writeCertification } from "../eval-gate.mjs";
import { appendHistory } from "../lib/history.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

function mkTmp() { return mkdtempSync(join(tmpdir(), "ec3-")); }

function seedAllPass(dayRoot) {
  for (const g of GATES) {
    for (const p of g.pipelines) {
      const dir = join(dayRoot, p);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "evidence.json"), JSON.stringify({
        pipeline: p,
        start_time: "2026-07-01T00:00:00.000Z",
        end_time: "2026-07-01T00:00:00.001Z",
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
      }, null, 2));
    }
  }
}

test("normalize strips BOM, CRLF, trailing whitespace; adds single trailing newline", () => {
  const dirty = "\uFEFFhello  \r\nworld\t\r\n\n\n";
  assert.equal(normalize(dirty), "hello\nworld\n");
});

test("generated blocks are deterministic across successive calls", () => {
  assert.equal(renderReleaseBlock(), renderReleaseBlock());
  assert.equal(renderMatrixBlock(), renderMatrixBlock());
  assert.equal(renderEngineBlock(), renderEngineBlock());
});

test("CERTIFICATION_ENGINE.md contains the canonical TOTAL_WEIGHT (parity)", () => {
  const p = join(REPO_ROOT, "docs/enterprise/CERTIFICATION_ENGINE.md");
  const body = readFileSync(p, "utf8");
  assert.ok(
    body.includes(`TOTAL_WEIGHT = ${TOTAL_WEIGHT}`),
    `expected CERTIFICATION_ENGINE.md to document TOTAL_WEIGHT = ${TOTAL_WEIGHT}`,
  );
  // must not reference a stale value
  const stale = body.match(/TOTAL_WEIGHT\s*=\s*(\d+)/g) || [];
  for (const s of stale) {
    const n = Number(s.match(/(\d+)/)[1]);
    assert.equal(n, TOTAL_WEIGHT, `stale TOTAL_WEIGHT reference: ${s}`);
  }
});

test("evidence:docs --check passes on clean checkout (all three docs)", () => {
  const res = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--check"], {
    encoding: "utf8", cwd: REPO_ROOT,
  });
  assert.equal(res.status, 0, `generate-docs --check failed:\n${res.stdout}${res.stderr}`);
});

test("evidence:docs --write is idempotent (second run makes no changes)", () => {
  const one = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--write"], {
    encoding: "utf8", cwd: REPO_ROOT,
  });
  assert.equal(one.status, 0);
  const two = spawnSync("node", ["tests/evidence/generate-docs.mjs", "--write"], {
    encoding: "utf8", cwd: REPO_ROOT,
  });
  assert.equal(two.status, 0);
  assert.ok(!/\bwrote\b/.test(two.stdout), `second --write should be no-op, got:\n${two.stdout}`);
});

test("writeCertification refuses concurrent collision (EEXIST on run folder)", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01", root, environment: "preview",
    run_id: "collide-run", timestamp: "2026-07-01T00:00:00.000Z",
  });
  writeCertification({ root, day: "2026-07-01", cert });
  // Simulate concurrent second writer: refuses without --force.
  assert.throws(
    () => writeCertification({ root, day: "2026-07-01", cert }),
    /refusing to overwrite/,
  );
});

test("--force preserves prior certification as a backup folder", () => {
  const root = mkTmp();
  const dayRoot = join(root, "2026-07-01");
  seedAllPass(dayRoot);
  const cert = getCertification({
    day: "2026-07-01", root, environment: "preview",
    run_id: "force-run", timestamp: "2026-07-01T00:00:00.000Z",
  });
  const first = writeCertification({ root, day: "2026-07-01", cert });
  assert.ok(existsSync(first.jsonPath));
  const second = writeCertification({ root, day: "2026-07-01", cert, force: true });
  assert.ok(second.backupPath, "backupPath must be returned on --force");
  assert.ok(existsSync(second.backupPath), "prior evidence must be preserved on disk");
  const backupJson = join(second.backupPath, "CERTIFICATION.json");
  assert.ok(existsSync(backupJson), "prior CERTIFICATION.json survives --force");
  // new folder also exists
  assert.ok(existsSync(second.jsonPath));
});

test("history append survives concurrent contenders (lock file protects)", async () => {
  const root = mkTmp();
  const historyPath = join(root, "history.json");
  const workers = 10;
  await Promise.all(
    Array.from({ length: workers }, (_, i) =>
      Promise.resolve().then(() =>
        appendHistory(historyPath, {
          run_id: `r${i}`,
          release: "v1",
          commit: "c1",
          environment: "preview",
          overall_status: "PASS",
          score: 100,
        }),
      ),
    ),
  );
  const history = JSON.parse(readFileSync(historyPath, "utf8"));
  assert.equal(history.length, workers, "no history entries lost under concurrency");
  // lock file must not linger
  assert.ok(!existsSync(historyPath + ".lock"), "lock file released after append");
});
