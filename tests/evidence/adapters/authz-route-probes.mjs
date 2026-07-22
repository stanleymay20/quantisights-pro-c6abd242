#!/usr/bin/env node
// tests/evidence/adapters/authz-route-probes.mjs
// EE-2B — Route-probe adapter.
//
// Purpose:
//   Convert route-probe observations (either from a hand-authored JSON file
//   or from a Playwright JSON reporter run) into the `{ probes: [...] }`
//   payload consumed by tests/evidence/adapters/authz-adapter.mjs via its
//   --route-probes flag. Without this adapter, the following AUTHZ controls
//   remain SKIP because no upstream harness covers them:
//
//     AUTHZ-004  Protected governance access     (browser GET /auditability)
//     AUTHZ-007  Authenticated route access      (aggregated route reach)
//     AUTHZ-012  Own-tenant write allowed        (2xx on same-org insert)
//     AUTHZ-015  Cross-tenant write denied       (401/403/42501 leak check)
//     AUTHZ-019  Edge function authorization     (401 missing/invalid JWT)
//
// This is a PURE TRANSLATOR:
//   * No network calls.
//   * No Playwright launch.
//   * No product-code imports.
//
// Inputs (choose one; --input takes precedence over --playwright):
//   --input <path>        JSON file with the route-probe schema below.
//   --playwright <path>   Playwright JSON reporter output. Tests must be
//                         annotated with { type: "authz-control", description: "AUTHZ-###" }
//                         and attach a JSON attachment named "authz-probe".
//   --output <path>       (required) Destination for the merged route-probe JSON.
//   --strict              Exit non-zero if any REQUIRED_ROUTE_PROBE_CONTROLS
//                         id is unmapped in the final output.
//
// The output file is a valid --route-probes payload for authz-adapter.mjs:
//   {
//     "source": "authz-route-probes",
//     "collected_at": "<ISO-8601>",
//     "probes": [ { control_id, route, role, ...evidence, pass }, ... ]
//   }
//
// Strict-mode failures (all exit non-zero):
//   * malformed input JSON
//   * probe entry references an unknown AUTHZ control id
//   * a required route-probe control has no probe in the output
//   * probe missing required fields (control_id, route)
//
// Non-strict mode: prints warnings for the same conditions and continues,
// EXCEPT for malformed JSON, unknown control ids, and missing required
// fields, which always fail (structural errors, not coverage gaps).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTHZ_CONTROL_INDEX,
} from "../pipelines/lib/authz-controls.mjs";

// The five controls this adapter is contractually responsible for. If any of
// these is missing after translation, strict mode exits non-zero.
export const REQUIRED_ROUTE_PROBE_CONTROLS = Object.freeze([
  "AUTHZ-004",
  "AUTHZ-007",
  "AUTHZ-012",
  "AUTHZ-015",
  "AUTHZ-019",
]);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    input: null,
    playwright: null,
    output: null,
    strict: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a === "--playwright") args.playwright = argv[++i];
    else if (a === "--output" || a === "-o") args.output = argv[++i];
    else if (a === "--strict") args.strict = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Probe normalization
// ---------------------------------------------------------------------------

const EXPECTATION_KIND = new Set([
  "allow",       // 2xx expected; pass ⇔ status_code in [200, 299]
  "deny",        // 401 / 403 expected (protected-route redirect also OK)
  "leak_check",  // must be denied; PostgREST 42501 or HTTP 401/403 is PASS
  "api",         // Edge Function / RPC style; 401 for missing JWT, 403 cross-tenant
  "explicit",    // trust probe.pass as authoritative
]);

function normalizeProbe(raw, index) {
  if (!raw || typeof raw !== "object") {
    throw structuralError(`probes[${index}] is not an object`);
  }
  const control_id = String(raw.control_id || "").trim();
  if (!control_id) throw structuralError(`probes[${index}].control_id missing`);
  if (!AUTHZ_CONTROL_INDEX[control_id]) {
    throw structuralError(`probes[${index}].control_id "${control_id}" is not a known AUTHZ control`);
  }
  const route = raw.route ?? raw.url ?? null;
  if (!route) throw structuralError(`probes[${index}].route missing (control_id=${control_id})`);

  const expected = (raw.expected ?? "explicit").toLowerCase();
  if (!EXPECTATION_KIND.has(expected)) {
    throw structuralError(`probes[${index}].expected "${raw.expected}" unknown (allowed: ${[...EXPECTATION_KIND].join("|")})`);
  }

  const statusCode = raw.status_code ?? raw.response?.status ?? null;
  const redirectChain = Array.isArray(raw.redirect_chain) ? raw.redirect_chain : [];
  const method = raw.method ?? raw.request?.method ?? (control_id === "AUTHZ-012" || control_id === "AUTHZ-015" ? "POST" : "GET");

  const pass = computePass(expected, {
    status_code: statusCode,
    redirect_chain: redirectChain,
    explicit: raw.pass,
  });

  return {
    control_id,
    route,
    role: raw.role ?? null,
    organization_id: raw.organization_id ?? null,
    user_id: raw.user_id ?? null,
    table: raw.table ?? null,
    policy: raw.policy ?? null,
    method,
    request: raw.request ?? { method, url: route },
    response: raw.response ?? {
      status: statusCode,
      body_snippet: raw.response_body_snippet ?? null,
    },
    status_code: statusCode,
    redirect_chain: redirectChain,
    console_errors: Array.isArray(raw.console_errors) ? raw.console_errors : [],
    network_failures: Array.isArray(raw.network_failures) ? raw.network_failures : [],
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots : [],
    recommendation: raw.recommendation ?? AUTHZ_CONTROL_INDEX[control_id].recommendation,
    expected,
    pass,
  };
}

function computePass(expected, { status_code, redirect_chain, explicit }) {
  if (expected === "explicit") return explicit === true;
  const code = typeof status_code === "number" ? status_code : Number(status_code);
  if (expected === "allow") {
    return Number.isFinite(code) && code >= 200 && code < 300;
  }
  if (expected === "deny") {
    if (code === 401 || code === 403) return true;
    // A redirect chain terminating at /login also counts as deny for browser probes.
    if (Array.isArray(redirect_chain) && redirect_chain.length > 0) {
      const last = redirect_chain[redirect_chain.length - 1];
      if (typeof last === "string" && last.includes("/login")) return true;
    }
    return false;
  }
  if (expected === "leak_check") {
    // A cross-tenant write must be rejected: HTTP 401/403 or PostgREST 42501.
    if (code === 401 || code === 403) return true;
    if (code === 42501) return true; // pg RLS violation surfaced as-is
    return false;
  }
  if (expected === "api") {
    // Edge Function without/with wrong JWT: 401 is canonical, 403 acceptable.
    return code === 401 || code === 403;
  }
  return false;
}

// A structural error is always fatal (both strict and non-strict).
function structuralError(msg) {
  const err = new Error(msg);
  err.code = "ROUTE_PROBE_STRUCTURAL";
  return err;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function readJsonStrict(path, label) {
  let raw;
  try {
    raw = readFileSync(resolve(path), "utf8");
  } catch (err) {
    throw structuralError(`${label}: could not read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw structuralError(`${label}: malformed JSON at ${path}: ${err.message}`);
  }
}

function loadInput(path) {
  const payload = readJsonStrict(path, "--input");
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.probes)) {
    throw structuralError(`--input: expected { probes: [...] } object`);
  }
  return payload.probes;
}

// Extract route probes from Playwright JSON reporter output. Contract:
//   * A test opts in with:
//       test.info().annotations.push({ type: "authz-control", description: "AUTHZ-004" });
//   * Rich fields (status_code, redirect_chain, role, etc.) are attached as:
//       test.info().attachments.push({
//         name: "authz-probe",
//         contentType: "application/json",
//         body: Buffer.from(JSON.stringify({ ...fields }))
//       });
//     or via a file path in `attachment.path`.
function loadPlaywright(path) {
  const payload = readJsonStrict(path, "--playwright");
  const probes = [];
  const suites = collectSuites(payload);
  for (const suite of suites) {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const result of t.results ?? []) {
          const annotations = [
            ...(t.annotations ?? []),
            ...(spec.annotations ?? []),
            ...(result.annotations ?? []),
          ];
          const controlAnn = annotations.find(
            (a) => a && String(a.type).toLowerCase() === "authz-control",
          );
          if (!controlAnn) continue;
          const control_id = String(controlAnn.description || "").trim().toUpperCase();
          if (!control_id) continue;

          const attachments = result.attachments ?? [];
          const sidecar = extractSidecar(attachments, "authz-probe");
          const status = String(result.status || "").toLowerCase();
          const testPassed = status === "passed" || status === "expected";

          probes.push({
            control_id,
            route: sidecar?.route ?? spec.title ?? spec.file ?? "unknown",
            role: sidecar?.role ?? null,
            organization_id: sidecar?.organization_id ?? null,
            user_id: sidecar?.user_id ?? null,
            table: sidecar?.table ?? null,
            policy: sidecar?.policy ?? null,
            method: sidecar?.method ?? sidecar?.request?.method ?? null,
            request: sidecar?.request ?? null,
            response: sidecar?.response ?? null,
            status_code: sidecar?.status_code ?? sidecar?.response?.status ?? null,
            redirect_chain: sidecar?.redirect_chain ?? [],
            console_errors: sidecar?.console_errors ?? [],
            network_failures: sidecar?.network_failures ?? [],
            screenshots: attachments
              .filter((a) => (a?.contentType || "").startsWith("image/") && a?.path)
              .map((a) => a.path),
            recommendation: sidecar?.recommendation ?? null,
            expected: sidecar?.expected ?? "explicit",
            // Playwright pass status is the ground truth when no explicit
            // expected/status_code payload is provided.
            pass: sidecar?.pass !== undefined ? Boolean(sidecar.pass) : testPassed,
          });
        }
      }
    }
  }
  return probes;
}

function collectSuites(payload) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node.suites)) node.suites.forEach(walk);
    if (Array.isArray(node.specs)) out.push(node);
  };
  walk(payload);
  return out;
}

function extractSidecar(attachments, name) {
  if (!Array.isArray(attachments)) return null;
  const hit = attachments.find((a) => a && a.name === name);
  if (!hit) return null;
  try {
    if (typeof hit.body === "string") {
      // base64-encoded JSON per Playwright reporter contract
      const decoded = Buffer.from(hit.body, "base64").toString("utf8");
      return JSON.parse(decoded);
    }
    if (hit.body && typeof hit.body === "object") {
      return hit.body;
    }
    if (hit.path) {
      return JSON.parse(readFileSync(hit.path, "utf8"));
    }
  } catch {
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public translate()
// ---------------------------------------------------------------------------

export function translate({
  input = null,       // { probes: [...] } object
  playwright = null,  // Playwright JSON reporter object
  strict = false,
  collected_at = null,
} = {}) {
  const rawProbes = [];
  if (input) {
    if (!Array.isArray(input.probes)) {
      throw structuralError(`translate({input}): expected { probes: [...] }`);
    }
    rawProbes.push(...input.probes);
  }
  if (playwright) {
    // Reuse the file loader's semantics: parse from an already-parsed object.
    const probes = [];
    const suites = collectSuites(playwright);
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          for (const result of t.results ?? []) {
            const annotations = [
              ...(t.annotations ?? []),
              ...(spec.annotations ?? []),
              ...(result.annotations ?? []),
            ];
            const controlAnn = annotations.find(
              (a) => a && String(a.type).toLowerCase() === "authz-control",
            );
            if (!controlAnn) continue;
            const sidecar = extractSidecar(result.attachments ?? [], "authz-probe");
            const status = String(result.status || "").toLowerCase();
            const testPassed = status === "passed" || status === "expected";
            probes.push({
              control_id: String(controlAnn.description || "").trim().toUpperCase(),
              route: sidecar?.route ?? spec.title ?? spec.file ?? "unknown",
              ...sidecar,
              pass: sidecar?.pass !== undefined ? Boolean(sidecar.pass) : testPassed,
              expected: sidecar?.expected ?? "explicit",
            });
          }
        }
      }
    }
    rawProbes.push(...probes);
  }

  const probes = rawProbes.map((p, i) => normalizeProbe(p, i));

  const seen = new Set(probes.map((p) => p.control_id));
  const missingRequired = REQUIRED_ROUTE_PROBE_CONTROLS.filter((id) => !seen.has(id));
  const warnings = [];
  for (const id of missingRequired) {
    warnings.push({
      code: "ROUTE_PROBE_MISSING",
      control_id: id,
      message: `No route probe emitted for required control ${id}`,
    });
  }
  if (strict && missingRequired.length > 0) {
    const err = new Error(
      `authz-route-probes: strict mode — missing required probes: ${missingRequired.join(", ")}`,
    );
    err.code = "MISSING_ROUTE_PROBES";
    err.missing = missingRequired;
    throw err;
  }

  return {
    result: {
      source: "authz-route-probes",
      collected_at: collected_at ?? new Date().toISOString(),
      probes,
    },
    warnings,
    missing: missingRequired,
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

function printHelp() {
  process.stdout.write(
    `authz-route-probes — route-probe file / Playwright JSON → authz-adapter probes payload\n\n` +
      `Usage:\n` +
      `  node tests/evidence/adapters/authz-route-probes.mjs \\\n` +
      `    (--input <probes.json> | --playwright <reporter.json>) \\\n` +
      `    --output <route-probes.json> [--strict]\n\n` +
      `Covers AUTHZ controls: ${REQUIRED_ROUTE_PROBE_CONTROLS.join(", ")}\n`,
  );
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`authz-route-probes: ${err.message}\n`);
    process.exit(2);
  }
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.output) {
    process.stderr.write(`authz-route-probes: --output is required\n`);
    process.exit(2);
  }
  if (!args.input && !args.playwright) {
    process.stderr.write(`authz-route-probes: provide --input or --playwright\n`);
    process.exit(2);
  }

  let input = null;
  let playwright = null;
  try {
    if (args.input) input = { probes: loadInput(args.input) };
    if (args.playwright) {
      // loadPlaywright returns already-normalized-ish probes; funnel through
      // the input path by re-wrapping so translate() applies the same
      // normalization to every probe regardless of source.
      const probes = loadPlaywright(args.playwright);
      input = { probes: [...(input?.probes ?? []), ...probes] };
    }
  } catch (err) {
    process.stderr.write(`authz-route-probes: ${err.message}\n`);
    process.exit(1);
  }

  let out;
  try {
    out = translate({ input, playwright, strict: args.strict });
  } catch (err) {
    process.stderr.write(`authz-route-probes: ${err.message}\n`);
    process.exit(1);
  }

  mkdirSync(dirname(resolve(args.output)), { recursive: true });
  writeFileSync(resolve(args.output), JSON.stringify(out.result, null, 2));

  if (out.warnings.length) {
    for (const w of out.warnings) {
      process.stderr.write(`authz-route-probes: WARN ${w.code} ${w.control_id}: ${w.message}\n`);
    }
  }
  process.stdout.write(
    `authz-route-probes: wrote ${out.result.probes.length} probes → ${args.output}` +
      (out.missing.length ? ` (missing: ${out.missing.join(", ")})` : "") +
      `\n`,
  );
  process.exit(0);
}

const isCli =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main(process.argv.slice(2));
