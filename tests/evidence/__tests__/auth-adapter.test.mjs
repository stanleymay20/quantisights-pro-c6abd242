// tests/evidence/__tests__/auth-adapter.test.mjs
// EE-1B regression suite for the Playwright → AUTH evidence adapter.
// Run with: npm run evidence:test

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  translate,
  extractSpecs,
  mapTitleToControls,
  extractControlsFromAnnotations,
  parseArgs,
} from "../adapters/auth-adapter.mjs";
import { REQUIRED_CONTROL_IDS } from "../pipelines/lib/auth-controls.mjs";
import { buildEvidence } from "../pipelines/authentication.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

const ADAPTER = fileURLToPath(new URL("../adapters/auth-adapter.mjs", import.meta.url));

function specWithAnnotations(title, controls, { status = "passed", duration = 12, error = null, attachments = [] } = {}) {
  return {
    title,
    annotations: controls.map((c) => ({ type: "auth-control", description: c })),
    tests: [
      {
        projectName: "chromium",
        results: [{ status, duration, error, attachments, retry: 0 }],
      },
    ],
  };
}

function playwrightJson(specs) {
  return {
    config: { version: "1.59.1" },
    suites: [
      {
        title: "e2e/auth.spec.ts",
        suites: [{ title: "Authentication Flow", specs }],
      },
    ],
  };
}

function fullCoverage(overrides = {}) {
  const specs = REQUIRED_CONTROL_IDS.map((id) =>
    specWithAnnotations(overrides[id]?.title || `covers ${id}`, [id], {
      status: overrides[id]?.status || "passed",
      duration: overrides[id]?.duration || 5,
      error: overrides[id]?.error || null,
      attachments: overrides[id]?.attachments || [],
    }),
  );
  return playwrightJson(specs);
}

test("parseArgs handles --input/--output/--strict", () => {
  const args = parseArgs(["--input", "a.json", "--output", "b.json", "--strict"]);
  assert.equal(args.input, "a.json");
  assert.equal(args.output, "b.json");
  assert.equal(args.strict, true);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]));
});

test("annotation extraction picks up AUTH-xxx codes", () => {
  const codes = extractControlsFromAnnotations([
    { type: "auth-control", description: "AUTH-001" },
    { type: "note", description: "covers AUTH-004 and AUTH-005" },
  ]);
  assert.deepEqual(codes.sort(), ["AUTH-001", "AUTH-004", "AUTH-005"]);
});

test("title fallback maps known e2e/auth.spec.ts tests", () => {
  assert.deepEqual(mapTitleToControls("Authentication Flow > login with invalid credentials shows error"), ["AUTH-001"]);
  assert.deepEqual(mapTitleToControls("Authentication Flow > Google OAuth button is present on login"), ["AUTH-003"]);
  assert.deepEqual(mapTitleToControls("Authentication Flow > unauthenticated user is redirected from protected routes"), ["AUTH-009"]);
  assert.deepEqual(mapTitleToControls("nothing to see here"), []);
});

test("extractSpecs walks nested suites", () => {
  const specs = extractSpecs(playwrightJson([specWithAnnotations("t1", ["AUTH-001"])]));
  assert.equal(specs.length, 1);
  assert.equal(specs[0].fullTitle, "e2e/auth.spec.ts > Authentication Flow > t1");
});

test("translate: full coverage yields PASS pipeline result", () => {
  const { result, missing, warnings } = translate(fullCoverage());
  assert.equal(missing.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(Object.keys(result.controls).length, 15);
  const pipeline = buildEvidence(result);
  assert.equal(pipeline.status, STATUS.PASS);
});

test("translate: failed critical control marks FAIL and pipeline SECURITY_FAILURE", () => {
  const { result } = translate(
    fullCoverage({
      "AUTH-001": { status: "failed", duration: 8, error: { message: "wrong creds path broken" } },
    }),
  );
  assert.equal(result.controls["AUTH-001"].status, "FAIL");
  assert.equal(result.controls["AUTH-001"].error.message, "wrong creds path broken");
  const pipeline = buildEvidence(result);
  assert.equal(pipeline.status, STATUS.SECURITY_FAILURE);
});

test("translate: missing control surfaces MISSING_CONTROL warning; strict mode throws", () => {
  const specs = REQUIRED_CONTROL_IDS
    .filter((id) => id !== "AUTH-010")
    .map((id) => specWithAnnotations(`covers ${id}`, [id]));
  const json = playwrightJson(specs);
  const soft = translate(json);
  assert.ok(soft.missing.includes("AUTH-010"));
  assert.ok(soft.warnings.some((w) => w.code === "MISSING_CONTROL" && w.control_id === "AUTH-010"));
  assert.throws(() => translate(json, { strict: true }), /Missing required AUTH controls/);
});

test("translate: unmapped test in strict mode throws", () => {
  const json = playwrightJson([
    ...REQUIRED_CONTROL_IDS.map((id) => specWithAnnotations(`covers ${id}`, [id])),
    { title: "totally new unmapped test", annotations: [], tests: [{ results: [{ status: "passed", duration: 1 }] }] },
  ]);
  const soft = translate(json);
  assert.ok(soft.unmapped.some((t) => t.includes("totally new unmapped test")));
  assert.throws(() => translate(json, { strict: true }), /Unmapped Playwright test/);
});

test("translate: screenshots and errors are extracted onto evidence", () => {
  const { result } = translate(
    fullCoverage({
      "AUTH-004": {
        status: "failed",
        duration: 20,
        error: { message: "pkce double exchange", stack: "at foo" },
        attachments: [
          { name: "screenshot", contentType: "image/png", path: "/tmp/shot.png" },
          { name: "trace", contentType: "application/zip", path: "/tmp/trace.zip" },
        ],
      },
    }),
  );
  const r = result.controls["AUTH-004"];
  assert.equal(r.status, "FAIL");
  assert.deepEqual(r.evidence.screenshots, ["/tmp/shot.png"]);
  assert.equal(r.error.message, "pkce double exchange");
  assert.equal(r.evidence.playwright.test_title, "e2e/auth.spec.ts > Authentication Flow > covers AUTH-004");
});

test("translate: same control from two specs collapses to worst severity", () => {
  const json = playwrightJson([
    ...REQUIRED_CONTROL_IDS.filter((id) => id !== "AUTH-002").map((id) => specWithAnnotations(`covers ${id}`, [id])),
    specWithAnnotations("logout happy path", ["AUTH-002"], { status: "passed" }),
    specWithAnnotations("logout leaks session", ["AUTH-002"], {
      status: "failed",
      error: { message: "session persisted" },
    }),
  ]);
  const { result } = translate(json);
  assert.equal(result.controls["AUTH-002"].status, "FAIL");
});

test("CLI: malformed Playwright JSON fails with non-zero exit", () => {
  const dir = mkdtempSync(join(tmpdir(), "ee1b-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{ this is not json");
  const out = join(dir, "out.json");
  const res = spawnSync("node", [ADAPTER, "--input", bad, "--output", out], { encoding: "utf8" });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /malformed Playwright JSON/);
  assert.equal(existsSync(out), false);
});

test("CLI: happy path writes evidence and reports summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "ee1b-"));
  const inp = join(dir, "play.json");
  const outPath = join(dir, "auth-evidence.json");
  writeFileSync(inp, JSON.stringify(fullCoverage()));
  const res = spawnSync("node", [ADAPTER, "--input", inp, "--output", outPath, "--strict"], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr);
  const written = JSON.parse(readFileSync(outPath, "utf8"));
  assert.equal(Object.keys(written.controls).length, 15);
  assert.equal(written.adapter, "playwright");
});

test("CLI: strict mode exits non-zero when a required control is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "ee1b-"));
  const inp = join(dir, "play.json");
  const outPath = join(dir, "auth-evidence.json");
  const specs = REQUIRED_CONTROL_IDS
    .filter((id) => id !== "AUTH-013")
    .map((id) => specWithAnnotations(`covers ${id}`, [id]));
  writeFileSync(inp, JSON.stringify(playwrightJson(specs)));
  const res = spawnSync("node", [ADAPTER, "--input", inp, "--output", outPath, "--strict"], { encoding: "utf8" });
  assert.notEqual(res.status, 0);
  assert.match(res.stderr, /Missing required AUTH controls/);
});

// ---------------------------------------------------------------- EE-1C

test("EE-1C: auth-evidence sidecar (base64 body) is merged into evidence fields", () => {
  const sidecar = {
    route: "/dashboard",
    response_status: 200,
    redirect_chain: ["/login", "/dashboard"],
    session_state: { user_id: "u1", aal: "aal1" },
    auth_state: "signed_in",
    console_errors: [{ message: "noop" }],
    network_failures: [],
    notes: ["sidecar ok"],
  };
  const body = Buffer.from(JSON.stringify(sidecar)).toString("base64");
  const json = playwrightJson([
    ...REQUIRED_CONTROL_IDS.filter((id) => id !== "AUTH-005").map((id) => specWithAnnotations(`covers ${id}`, [id])),
    {
      title: "session persists",
      annotations: [{ type: "auth-control", description: "AUTH-005" }],
      tests: [{
        results: [{
          status: "passed",
          duration: 20,
          attachments: [{ name: "auth-evidence", contentType: "application/json", body }],
        }],
      }],
    },
  ]);
  const { result } = translate(json);
  const rec = result.controls["AUTH-005"];
  assert.equal(rec.evidence.route, "/dashboard");
  assert.equal(rec.evidence.response_status, 200);
  assert.deepEqual(rec.evidence.redirect_chain, ["/login", "/dashboard"]);
  assert.equal(rec.evidence.session_state.user_id, "u1");
  assert.equal(rec.evidence.auth_state, "signed_in");
  assert.equal(rec.evidence.console_errors.length, 1);
  assert.deepEqual(rec.evidence.notes, ["sidecar ok"]);
});

test("EE-1C: SKIP staging-only control produces WARNING, never fake PASS", () => {
  const json = playwrightJson(
    REQUIRED_CONTROL_IDS.map((id) =>
      id === "AUTH-010"
        ? specWithAnnotations(`covers ${id}`, [id], { status: "skipped" })
        : specWithAnnotations(`covers ${id}`, [id]),
    ),
  );
  const { result } = translate(json);
  assert.equal(result.controls["AUTH-010"].status, "SKIP");
  const pipeline = buildEvidence(result);
  // Warning-tier: non-blocking; certainly not PASS-with-fake-evidence.
  assert.equal(pipeline.status, STATUS.WARNING);
  assert.ok(pipeline.warnings.some((w) => w.control_id === "AUTH-010" && w.code === "CONTROL_SKIPPED"));
});

test("EE-1C: e2e/auth.spec.ts annotates every AUTH-### control", async () => {
  const src = readFileSync(fileURLToPath(new URL("../../../e2e/auth.spec.ts", import.meta.url)), "utf8");
  for (const id of REQUIRED_CONTROL_IDS) {
    assert.match(src, new RegExp(id), `e2e/auth.spec.ts missing coverage for ${id}`);
    assert.match(src, new RegExp(`attachAuthEvidence\\([^)]*"${id}"`), `${id} not passed to attachAuthEvidence`);
  }
});

test("EE-1C: strict mode succeeds when Playwright JSON covers all 15 controls", () => {
  const { result, missing, warnings } = translate(fullCoverage(), { strict: true });
  assert.equal(missing.length, 0);
  assert.equal(warnings.length, 0);
  assert.equal(Object.keys(result.controls).length, 15);
});

