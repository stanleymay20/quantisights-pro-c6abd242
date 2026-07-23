#!/usr/bin/env node
// tests/evidence/adapters/auth-adapter.mjs
// EE-1B: Translates Playwright JSON reporter output from e2e/auth.spec.ts
// into the EE-1 Authentication evidence contract consumed by
// tests/evidence/pipelines/authentication.mjs.
//
// This is a PURE TRANSLATOR. It does not launch Playwright or a browser and
// does not re-run assertions — it only converts what Playwright reported.
//
// Usage:
//   node tests/evidence/adapters/auth-adapter.mjs \
//     --input /tmp/auth-play.json \
//     --output /tmp/auth-evidence.json \
//     [--strict]
//
// Exit codes:
//   0  translation succeeded (in strict mode: every required control mapped)
//   1  malformed Playwright JSON, unmapped test result (strict), or missing
//      required control (strict), or IO error
//
// Mapping strategy (in priority order):
//   1. Explicit Playwright annotation:
//        test("...", { annotation: [{ type: "auth-control", description: "AUTH-001" }] })
//      OR any annotation whose `description` matches /AUTH-\d{3}/.
//   2. Case-insensitive substring match against TITLE_MAP below.
//   3. Regex fallback for the tests currently in e2e/auth.spec.ts.
// A single test may cover multiple controls if its annotation lists several
// AUTH-* codes; the same evidence is folded into each mapped control.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_CONTROL_IDS } from "../pipelines/lib/auth-controls.mjs";

// ---------- CLI ------------------------------------------------------------

export function parseArgs(argv) {
  const args = { input: null, output: null, strict: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input" || a === "-i") args.input = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------- Mapping table --------------------------------------------------
// Substring match against the test's *full title* (describe + test title,
// lower-cased). Order matters: first match wins.

const TITLE_MAP = [
  { needle: "landing page loads", controls: ["AUTH-009"] }, // unauth landing / redirect surface
  { needle: "login page renders", controls: ["AUTH-014"] }, // hydration + form render
  { needle: "login with invalid credentials", controls: ["AUTH-001"] },
  { needle: "register page renders", controls: ["AUTH-014"] },
  { needle: "forgot password page exists", controls: ["AUTH-011"] },
  { needle: "unauthenticated user is redirected", controls: ["AUTH-009"] },
  { needle: "google oauth button is present", controls: ["AUTH-003"] },
  // Additional planned coverage (annotated in future specs) — kept here so a
  // rename does not silently break mapping.
  { needle: "logout", controls: ["AUTH-002", "AUTH-015"] },
  { needle: "oauth callback", controls: ["AUTH-004"] },
  { needle: "pkce", controls: ["AUTH-004"] },
  { needle: "session persistence", controls: ["AUTH-005"] },
  { needle: "session refresh", controls: ["AUTH-006"] },
  { needle: "expired session", controls: ["AUTH-007"] },
  { needle: "invalid jwt", controls: ["AUTH-008"] },
  { needle: "bad_jwt", controls: ["AUTH-008"] },
  { needle: "mfa", controls: ["AUTH-010"] },
  { needle: "password reset", controls: ["AUTH-012"] },
  { needle: "account recovery", controls: ["AUTH-013"] },
  { needle: "recovery flow", controls: ["AUTH-013"] },
];

const AUTH_CODE_RE = /AUTH-\d{3}/g;

export function extractControlsFromAnnotations(annotations) {
  if (!Array.isArray(annotations)) return [];
  const codes = new Set();
  for (const ann of annotations) {
    if (!ann || typeof ann !== "object") continue;
    const desc = String(ann.description ?? "");
    const type = String(ann.type ?? "");
    if (type.toLowerCase() === "auth-control" && desc) {
      for (const m of desc.matchAll(AUTH_CODE_RE)) codes.add(m[0]);
    } else {
      for (const m of desc.matchAll(AUTH_CODE_RE)) codes.add(m[0]);
    }
  }
  return [...codes];
}

export function mapTitleToControls(fullTitle) {
  const t = String(fullTitle || "").toLowerCase();
  if (!t) return [];
  for (const { needle, controls } of TITLE_MAP) {
    if (t.includes(needle)) return controls;
  }
  return [];
}

// ---------- Playwright JSON walk ------------------------------------------

function collectSpecs(node, parentTitles, out) {
  const titles = node.title ? [...parentTitles, node.title] : parentTitles;
  if (Array.isArray(node.specs)) {
    for (const spec of node.specs) {
      const specTitles = [...titles, spec.title].filter(Boolean);
      const tests = Array.isArray(spec.tests) ? spec.tests : [];
      for (const t of tests) {
        const results = Array.isArray(t.results) ? t.results : [];
        // Use the last result (retries collapse to final outcome).
        const last = results[results.length - 1] ?? null;
        out.push({
          fullTitle: specTitles.join(" > "),
          annotations: spec.annotations || t.annotations || [],
          projectName: t.projectName || null,
          result: last,
        });
      }
    }
  }
  if (Array.isArray(node.suites)) {
    for (const s of node.suites) collectSpecs(s, titles, out);
  }
}

export function extractSpecs(playwrightJson) {
  if (!playwrightJson || typeof playwrightJson !== "object") {
    throw new Error("Playwright JSON is not an object");
  }
  const out = [];
  const roots = Array.isArray(playwrightJson.suites) ? playwrightJson.suites : [];
  for (const root of roots) collectSpecs(root, [], out);
  return out;
}

// ---------- Result → evidence --------------------------------------------

function mapStatus(playwrightStatus) {
  const s = String(playwrightStatus || "").toLowerCase();
  if (s === "passed" || s === "expected") return "PASS";
  if (s === "failed" || s === "timedout" || s === "unexpected" || s === "interrupted") return "FAIL";
  if (s === "skipped") return "SKIP";
  return "FAIL"; // fail-closed on unknown status
}

function extractScreenshots(result) {
  if (!result || !Array.isArray(result.attachments)) return [];
  const out = [];
  for (const a of result.attachments) {
    if (!a) continue;
    const name = String(a.name || "").toLowerCase();
    const contentType = String(a.contentType || "").toLowerCase();
    if (contentType.startsWith("image/") || name.includes("screenshot")) {
      if (a.path) out.push(a.path);
    }
  }
  return out;
}

/**
 * Read the auth-evidence sidecar JSON emitted by e2e/lib/auth-evidence.ts
 * (`testInfo.attach("auth-evidence", { contentType: "application/json" })`).
 * Supports both `body` (inline base64/utf8) and `path` (file) forms.
 */
function extractSidecar(result) {
  if (!result || !Array.isArray(result.attachments)) return null;
  for (const a of result.attachments) {
    if (!a) continue;
    const name = String(a.name || "").toLowerCase();
    const contentType = String(a.contentType || "").toLowerCase();
    if (name !== "auth-evidence" && !contentType.includes("application/json")) continue;
    try {
      let raw = null;
      if (typeof a.body === "string" && a.body) {
        // Playwright's JSON reporter base64-encodes attachment bodies.
        try {
          raw = Buffer.from(a.body, "base64").toString("utf8");
          // Detect a false-positive base64 decode (result would not be JSON).
          if (!raw.trim().startsWith("{") && !raw.trim().startsWith("[")) raw = a.body;
        } catch {
          raw = a.body;
        }
      } else if (a.path) {
        try {
          raw = readFileSync(a.path, "utf8");
        } catch {
          continue;
        }
      }
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore malformed sidecar; adapter still reports the test outcome
    }
  }
  return null;
}

function extractError(result) {
  if (!result || !result.error) return null;
  const e = result.error;
  return {
    message: e.message || e.value || "Playwright reported failure",
    stack: e.stack || null,
  };
}

function buildEvidenceFor(spec) {
  const r = spec.result;
  const status = mapStatus(r?.status);
  const screenshots = extractScreenshots(r);
  const sidecar = extractSidecar(r) || {};
  const evidence = {
    route: sidecar.route ?? null,
    response_status: sidecar.response_status ?? null,
    redirect_chain: Array.isArray(sidecar.redirect_chain) ? sidecar.redirect_chain : [],
    session_state: sidecar.session_state ?? null,
    auth_state: sidecar.auth_state ?? null,
    console_errors: Array.isArray(sidecar.console_errors) ? sidecar.console_errors : [],
    network_failures: Array.isArray(sidecar.network_failures) ? sidecar.network_failures : [],
    screenshots,
    notes: Array.isArray(sidecar.notes) ? sidecar.notes : [],
    playwright: {
      test_title: spec.fullTitle,
      project: spec.projectName,
      retries: r?.retry ?? 0,
    },
  };
  const record = {
    status,
    execution_time_ms: Number(r?.duration ?? 0),
    evidence,
    error: status === "FAIL" ? extractError(r) : null,
  };
  return record;
}

// ---------- Translation ---------------------------------------------------

export function translate(playwrightJson, { strict = false } = {}) {
  const specs = extractSpecs(playwrightJson);
  const controls = {};
  const warnings = [];
  const unmapped = [];

  for (const spec of specs) {
    const annotationCodes = extractControlsFromAnnotations(spec.annotations);
    const titleCodes = annotationCodes.length ? annotationCodes : mapTitleToControls(spec.fullTitle);
    if (titleCodes.length === 0) {
      unmapped.push(spec.fullTitle);
      continue;
    }
    const record = buildEvidenceFor(spec);
    for (const code of titleCodes) {
      if (!REQUIRED_CONTROL_IDS.includes(code)) {
        warnings.push({ code: "UNKNOWN_CONTROL", message: `Test mapped to ${code} but it is not in AUTH_CONTROLS`, test: spec.fullTitle });
        continue;
      }
      // If already present, prefer the more severe status (FAIL > SKIP > PASS)
      // so a broken variant of the same control blocks certification.
      const prev = controls[code];
      controls[code] = mergeRecords(prev, record);
    }
  }

  const missing = REQUIRED_CONTROL_IDS.filter((id) => !controls[id]);
  for (const id of missing) {
    warnings.push({ code: "MISSING_CONTROL", control_id: id, message: `No Playwright test mapped to ${id}` });
  }

  if (strict) {
    if (unmapped.length) {
      const err = new Error(`Unmapped Playwright test(s): ${unmapped.join(" | ")}`);
      err.code = "UNMAPPED_TEST";
      throw err;
    }
    if (missing.length) {
      const err = new Error(`Missing required AUTH controls: ${missing.join(", ")}`);
      err.code = "MISSING_CONTROLS";
      throw err;
    }
  }

  return {
    result: {
      adapter: "playwright",
      collected_at: new Date().toISOString(),
      environment: process.env.EVIDENCE_ENV || "preview",
      source: {
        playwright_version: playwrightJson?.config?.version || null,
        spec: "e2e/auth.spec.ts",
      },
      controls,
    },
    warnings,
    unmapped,
    missing,
  };
}

const SEVERITY = { PASS: 0, SKIP: 1, FAIL: 2 };
function mergeRecords(prev, next) {
  if (!prev) return next;
  if (SEVERITY[next.status] > SEVERITY[prev.status]) return next;
  return prev;
}

// ---------- CLI entry -----------------------------------------------------

function printHelp() {
  process.stdout.write(
    `auth-adapter — Playwright → EE-1 Authentication evidence translator\n\n` +
      `Usage:\n` +
      `  node tests/evidence/adapters/auth-adapter.mjs --input <playwright-json> --output <auth-results-json> [--strict]\n\n` +
      `Options:\n` +
      `  --input, -i    Path to Playwright JSON reporter output (required)\n` +
      `  --output, -o   Path to write the AUTH evidence JSON (required)\n` +
      `  --strict       Exit non-zero if any required AUTH control is missing\n` +
      `                 or any Playwright test cannot be mapped\n`,
  );
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`auth-adapter: ${err.message}\n`);
    process.exit(1);
  }
  if (args.help || (!args.input && !args.output)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }
  if (!args.input || !args.output) {
    process.stderr.write("auth-adapter: --input and --output are required\n");
    process.exit(1);
  }
  let raw;
  try {
    raw = readFileSync(resolve(args.input), "utf8");
  } catch (err) {
    process.stderr.write(`auth-adapter: cannot read input: ${err.message}\n`);
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`auth-adapter: malformed Playwright JSON: ${err.message}\n`);
    process.exit(1);
  }
  let out;
  try {
    out = translate(parsed, { strict: args.strict });
  } catch (err) {
    process.stderr.write(`auth-adapter: ${err.message}\n`);
    process.exit(1);
  }
  try {
    mkdirSync(dirname(resolve(args.output)), { recursive: true });
    writeFileSync(resolve(args.output), JSON.stringify(out.result, null, 2));
  } catch (err) {
    process.stderr.write(`auth-adapter: cannot write output: ${err.message}\n`);
    process.exit(1);
  }
  const summary = {
    written: args.output,
    controls_mapped: Object.keys(out.result.controls).length,
    controls_missing: out.missing.length,
    unmapped_tests: out.unmapped.length,
    warnings: out.warnings.length,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(0);
}

// Only execute when invoked directly.
const invokedDirect = (() => {
  try {
    const argv1 = process.argv[1] ? resolve(process.argv[1]) : "";
    return argv1 === resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (invokedDirect) {
  main(process.argv.slice(2));
}
