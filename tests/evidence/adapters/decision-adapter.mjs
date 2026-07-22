#!/usr/bin/env node
// tests/evidence/adapters/decision-adapter.mjs
// EE-3: Translates the outputs of the decision-lifecycle harnesses into the
// EE-3 Decision Lifecycle evidence contract consumed by
// tests/evidence/pipelines/decision-lifecycle.mjs.
//
// This is a PURE TRANSLATOR. It does not launch Playwright, hit HTTP
// endpoints, or run decision workflows. It only converts what upstream
// harnesses already reported.
//
// Each input is one of two schemas — the adapter accepts either:
//
//   (a) Full pipeline shape:
//         { "controls": { "DEC-###": { status, evidence?, execution_time_ms?, error? }, ... } }
//
//   (b) Flat records shape:
//         { "records": [ { control_id, status, evidence?, error? }, ... ] }
//
// Any input source may cover any subset of the 25 controls. If two sources
// disagree about the same control_id, the WORSE result wins (FAIL > SKIP > PASS).
// Any missing control after merge stays SKIP (never fake PASS).
//
// Inputs (all optional; missing input just leaves its controls SKIP):
//   --workflow    <path>   Decision workflow harness output
//                          (create → recommend → review → decide → outcome)
//   --audit       <path>   Audit trail harness output (audit_log + timeline)
//   --report      <path>   Report / export harness output (gen-report, export, search)
//   --browser     <path>   Concurrent browser harness output for decision routes
//   --output, -o  <path>   Destination for the merged EE-3 evidence JSON (required)
//   --strict               Exit non-zero if any DEC-### is left SKIP

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DECISION_REQUIRED_CONTROL_IDS } from "../pipelines/lib/decision-controls.mjs";

// ---------- CLI -----------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    workflow: null,
    audit: null,
    report: null,
    browser: null,
    output: null,
    strict: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--workflow") args.workflow = argv[++i];
    else if (a === "--audit" || a === "--audit-trail") args.audit = argv[++i];
    else if (a === "--report") args.report = argv[++i];
    else if (a === "--browser") args.browser = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readJsonSafe(path) {
  if (!path) return null;
  const raw = readFileSync(resolve(path), "utf8");
  return JSON.parse(raw);
}

// ---------- Shared helpers ------------------------------------------------

export const DECISION_EVIDENCE_FIELDS = Object.freeze([
  "decision_id",
  "organization_id",
  "owner",
  "status_before",
  "status_after",
  "approval_chain",
  "audit_record",
  "timeline",
  "confidence",
  "recommendation",
  "risk_score",
  "governance",
  "request",
  "response",
  "screenshots",
  "console_errors",
  "network_failures",
]);

export function emptyEvidence(overrides = {}) {
  return {
    decision_id: null,
    organization_id: null,
    owner: null,
    status_before: null,
    status_after: null,
    approval_chain: [],
    audit_record: null,
    timeline: [],
    confidence: null,
    recommendation: null,
    risk_score: null,
    governance: null,
    request: null,
    response: null,
    screenshots: [],
    console_errors: [],
    network_failures: [],
    ...overrides,
  };
}

function skipRecord(reason) {
  return {
    status: "SKIP",
    execution_time_ms: 0,
    evidence: emptyEvidence(),
    error: { message: reason },
  };
}

const SEVERITY = { PASS: 0, SKIP: 1, FAIL: 2 };
function mergeRecords(prev, next) {
  if (!prev) return next;
  return SEVERITY[next.status] >= SEVERITY[prev.status] ? next : prev;
}

function normalizeRecord(raw) {
  if (!raw || typeof raw !== "object") return null;
  const status = String(raw.status || "").toUpperCase();
  if (!["PASS", "FAIL", "SKIP"].includes(status)) return null;
  return {
    status,
    execution_time_ms: Number(raw.execution_time_ms ?? 0),
    evidence: emptyEvidence(raw.evidence ?? {}),
    error: raw.error ?? null,
  };
}

/**
 * Extract { control_id → record } from either the pipeline shape
 * ({ controls: {...} }) or the flat-records shape ({ records: [...] }).
 * Returns a fresh object; never mutates the input.
 */
export function extractControls(source) {
  const out = {};
  if (!source || typeof source !== "object") return out;

  if (source.controls && typeof source.controls === "object") {
    for (const [id, raw] of Object.entries(source.controls)) {
      const rec = normalizeRecord(raw);
      if (rec) out[id] = rec;
    }
  }
  if (Array.isArray(source.records)) {
    for (const r of source.records) {
      const id = r?.control_id;
      if (!id) continue;
      const rec = normalizeRecord(r);
      if (rec) out[id] = mergeRecords(out[id], rec);
    }
  }
  return out;
}

// ---------- Translator ----------------------------------------------------

export function translate({
  workflow = null,
  audit = null,
  report = null,
  browser = null,
  environment = "preview",
  strict = false,
  collected_at = null,
} = {}) {
  const sources = {
    workflow: workflow ? "provided" : null,
    audit_trail: audit ? "provided" : null,
    report: report ? "provided" : null,
    browser: browser ? "provided" : null,
  };

  const merged = {};
  for (const src of [workflow, audit, report, browser]) {
    const extracted = extractControls(src);
    for (const [id, rec] of Object.entries(extracted)) {
      merged[id] = mergeRecords(merged[id], rec);
    }
  }

  const controls = {};
  const missing = [];
  for (const id of DECISION_REQUIRED_CONTROL_IDS) {
    if (merged[id]) controls[id] = merged[id];
    else {
      controls[id] = skipRecord(`No harness reported ${id}`);
      missing.push(id);
    }
  }

  const warnings = missing.map((id) => ({
    code: "DECISION_CONTROL_MISSING",
    control_id: id,
    message: `No harness reported ${id}; degraded to SKIP.`,
  }));

  if (strict && missing.length > 0) {
    const err = new Error(
      `decision-adapter: strict mode — missing controls: ${missing.join(", ")}`,
    );
    err.code = "MISSING_DECISION_CONTROLS";
    err.missing = missing;
    throw err;
  }

  return {
    result: {
      adapter: "decision-adapter",
      collected_at: collected_at ?? new Date().toISOString(),
      environment,
      sources,
      controls,
    },
    warnings,
    missing,
  };
}

// ---------- CLI entry -----------------------------------------------------

function printHelp() {
  process.stdout.write(
    `decision-adapter — workflow + audit + report + browser → EE-3 Decision evidence\n\n` +
      `Usage:\n` +
      `  node tests/evidence/adapters/decision-adapter.mjs \\\n` +
      `    [--workflow <path>] [--audit <path>] [--report <path>] [--browser <path>] \\\n` +
      `    --output <decision-results-json> [--strict]\n\n` +
      `Options:\n` +
      `  --workflow     JSON from decision workflow harness (create → decide → outcome)\n` +
      `  --audit        JSON from audit_log / timeline harness\n` +
      `  --report       JSON from report / export / search harness\n` +
      `  --browser      JSON from concurrent-browser harness for decision routes\n` +
      `  --output, -o   Path to write the DECISION evidence JSON (required)\n` +
      `  --strict       Exit non-zero if any required DEC-### was left SKIP\n`,
  );
}

async function main(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (err) { process.stderr.write(`decision-adapter: ${err.message}\n`); process.exit(1); }
  if (args.help) { printHelp(); process.exit(0); }
  if (!args.output) {
    printHelp();
    process.stderr.write("decision-adapter: --output is required\n");
    process.exit(1);
  }
  let workflow = null, audit = null, report = null, browser = null;
  try {
    if (args.workflow) workflow = readJsonSafe(args.workflow);
    if (args.audit) audit = readJsonSafe(args.audit);
    if (args.report) report = readJsonSafe(args.report);
    if (args.browser) browser = readJsonSafe(args.browser);
  } catch (err) {
    process.stderr.write(`decision-adapter: cannot read input: ${err.message}\n`);
    process.exit(1);
  }
  let out;
  try {
    out = translate({
      workflow, audit, report, browser,
      environment: process.env.EVIDENCE_ENV || "preview",
      strict: args.strict,
    });
  } catch (err) {
    process.stderr.write(`decision-adapter: ${err.message}\n`);
    process.exit(1);
  }
  try {
    mkdirSync(dirname(resolve(args.output)), { recursive: true });
    writeFileSync(resolve(args.output), JSON.stringify(out.result, null, 2));
  } catch (err) {
    process.stderr.write(`decision-adapter: cannot write output: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({
    written: args.output,
    controls_mapped: Object.values(out.result.controls).filter((c) => c.status !== "SKIP").length,
    controls_skipped: out.missing.length,
    warnings: out.warnings.length,
  }, null, 2) + "\n");
  process.exit(0);
}

const invokedDirect = (() => {
  try {
    const argv1 = process.argv[1] ? resolve(process.argv[1]) : "";
    return argv1 === resolve(new URL(import.meta.url).pathname);
  } catch { return false; }
})();
if (invokedDirect) {
  main(process.argv.slice(2));
}
