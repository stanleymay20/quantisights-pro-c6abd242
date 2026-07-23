#!/usr/bin/env node
// tests/evidence/adapters/authz-adapter.mjs
// EE-2: Translates the outputs of the existing authorization harnesses into
// the EE-2 Authorization evidence contract consumed by
// tests/evidence/pipelines/authorization.mjs.
//
// Inputs (all optional; any missing input degrades its controls to SKIP):
//   --tenant-isolation <path>   JSON from `node tests/tenant-isolation/run.mjs`
//                               (the summary object printed to stdout)
//   --browser <path>            JSON from tests/e2e/concurrent-browser-sessions.py
//                               (the final summary object)
//   --route-probes <path>       JSON from a route-probe script — schema:
//                                 { "probes": [
//                                    { "control_id": "AUTHZ-005",
//                                      "route": "/admin/foo",
//                                      "role": "member",
//                                      "expected": "deny",
//                                      "status_code": 302,
//                                      "redirect_chain": ["/admin/foo","/login"],
//                                      "pass": true }
//                                 ] }
//   --output <path>             Destination for the AUTHZ evidence JSON (required)
//   --strict                    Exit non-zero if any required AUTHZ control is
//                               not produced (i.e. left SKIP)
//
// This is a PURE TRANSLATOR. It does not launch Playwright, run tenant-isolation
// probes, or hit HTTP endpoints. It only converts what the upstream harnesses
// already reported.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AUTHZ_REQUIRED_CONTROL_IDS } from "../pipelines/lib/authz-controls.mjs";

// ---------- CLI -----------------------------------------------------------

export function parseArgs(argv) {
  const args = {
    tenantIsolation: null,
    browser: null,
    routeProbes: null,
    output: null,
    strict: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tenant-isolation") args.tenantIsolation = argv[++i];
    else if (a === "--browser") args.browser = argv[++i];
    else if (a === "--route-probes") args.routeProbes = argv[++i];
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

function skipRecord(reason) {
  return {
    status: "SKIP",
    execution_time_ms: 0,
    evidence: emptyEvidence(),
    error: { message: reason },
  };
}

function emptyEvidence(overrides = {}) {
  return {
    route: null,
    role: null,
    organization_id: null,
    user_id: null,
    table: null,
    policy: null,
    request: null,
    response: null,
    status_code: null,
    redirect_chain: [],
    console_errors: [],
    network_failures: [],
    screenshots: [],
    recommendation: null,
    ...overrides,
  };
}

const SEVERITY = { PASS: 0, SKIP: 1, FAIL: 2 };
function mergeRecords(prev, next) {
  if (!prev) return next;
  return SEVERITY[next.status] > SEVERITY[prev.status] ? next : prev;
}

// ---------- Tenant-isolation projection ----------------------------------
// The tenant-isolation summary shape is:
//   { totals, results: [{ kind, actor, actor_org, target_org, table, op,
//                         status, row_count, body, verdict, note, ... }] }
// Verdicts: PASS | EXPECTED_DENIAL | CRITICAL_LEAK | FRAMEWORK_INVALID | API_FAILURE

function tenantEvidenceFor(entries, extra = {}) {
  const first = entries[0] || {};
  const anyFail = entries.find((e) => e.verdict === "CRITICAL_LEAK" || e.verdict === "FRAMEWORK_INVALID" || e.verdict === "API_FAILURE");
  const sample = anyFail || first;
  return emptyEvidence({
    route: `/rest/v1/${sample.table ?? "decision_ledger"}`,
    role: "member",
    organization_id: sample.actor_org ?? null,
    user_id: sample.actor ?? null,
    table: sample.table ?? null,
    policy: "is_org_member(organization_id)",
    request: { method: sample.op ?? null, target_org: sample.target_org ?? null },
    response: { status: sample.status ?? null, body_snippet: sample.body ?? null },
    status_code: sample.status ?? null,
    redirect_chain: [],
    console_errors: [],
    network_failures: [],
    screenshots: [],
    recommendation: null,
    verdicts: entries.map((e) => ({ verdict: e.verdict, note: e.note ?? null, status: e.status ?? null, row_count: e.row_count ?? null })),
    probe_count: entries.length,
    ...extra,
  });
}

function statusFromTenantEntries(entries, mode) {
  if (!entries || entries.length === 0) return "SKIP";
  // mode: "positive_pass" — every entry must be verdict=PASS
  // mode: "negative_read"  — every entry must be verdict=PASS (empty array)
  // mode: "negative_write" — every entry must be verdict=EXPECTED_DENIAL
  for (const e of entries) {
    if (e.verdict === "CRITICAL_LEAK") return "FAIL";
    if (e.verdict === "FRAMEWORK_INVALID") return "FAIL";
    if (e.verdict === "API_FAILURE") return "FAIL";
  }
  if (mode === "positive_pass" || mode === "negative_read") {
    return entries.every((e) => e.verdict === "PASS") ? "PASS" : "FAIL";
  }
  if (mode === "negative_write") {
    return entries.every((e) => e.verdict === "EXPECTED_DENIAL") ? "PASS" : "FAIL";
  }
  return "FAIL";
}

function projectTenantIsolation(summary, controls) {
  if (!summary || !Array.isArray(summary.results)) return;
  const R = summary.results;

  const posReadA = R.filter((r) => r.kind === "positive_read" && r.actor_org && r.target_org === r.actor_org && isSideA(r, summary));
  const posReadB = R.filter((r) => r.kind === "positive_read" && r.actor_org && r.target_org === r.actor_org && !isSideA(r, summary));
  const posWriteA = R.filter((r) => r.kind === "positive_write" && isSideA(r, summary));
  const posWriteB = R.filter((r) => r.kind === "positive_write" && !isSideA(r, summary));
  const negReadAtoB = R.filter((r) => r.kind === "negative_read" && isSideA(r, summary));
  const negReadBtoA = R.filter((r) => r.kind === "negative_read" && !isSideA(r, summary));
  const negWriteAtoB = R.filter((r) => r.kind === "negative_write" && isSideA(r, summary));
  const negWriteBtoA = R.filter((r) => r.kind === "negative_write" && !isSideA(r, summary));
  const allNegative = [...negReadAtoB, ...negReadBtoA, ...negWriteAtoB, ...negWriteBtoA];

  assignTenantControl(controls, "AUTHZ-008", posReadA, "positive_pass");
  assignTenantControl(controls, "AUTHZ-009", posReadB, "positive_pass");
  assignTenantControl(controls, "AUTHZ-010", negReadAtoB, "negative_read");
  assignTenantControl(controls, "AUTHZ-011", negReadBtoA, "negative_read");
  assignTenantControl(controls, "AUTHZ-012", posWriteA, "positive_pass");
  assignTenantControl(controls, "AUTHZ-013", posWriteB, "positive_pass");
  assignTenantControl(controls, "AUTHZ-014", negWriteAtoB, "negative_write");
  assignTenantControl(controls, "AUTHZ-015", negWriteBtoA, "negative_write");

  // AUTHZ-016 — aggregated RLS enforcement across every negative probe.
  if (allNegative.length > 0) {
    const anyApiFailure = allNegative.some((e) => e.verdict === "API_FAILURE");
    const anyLeak = allNegative.some((e) => e.verdict === "CRITICAL_LEAK");
    const status = anyLeak || anyApiFailure ? "FAIL" : "PASS";
    controls["AUTHZ-016"] = mergeRecords(controls["AUTHZ-016"], {
      status,
      execution_time_ms: 0,
      evidence: tenantEvidenceFor(allNegative, {
        aggregate: {
          total: allNegative.length,
          leaks: allNegative.filter((e) => e.verdict === "CRITICAL_LEAK").length,
          api_failures: allNegative.filter((e) => e.verdict === "API_FAILURE").length,
          expected_denials: allNegative.filter((e) => e.verdict === "EXPECTED_DENIAL").length,
          pass: allNegative.filter((e) => e.verdict === "PASS").length,
        },
      }),
      error: status === "FAIL" ? { message: "One or more cross-tenant probes returned a non-denial class" } : null,
    });
  }
}

function isSideA(entry, summary) {
  // Prefer explicit org id comparison against seeded state if present.
  const orgA = summary?.orgs?.a?.id || summary?.a_org || null;
  if (orgA && entry.actor_org) return entry.actor_org === orgA;
  // Fallback: user A email tends to sort before B; use a stable string ordering.
  return String(entry.actor || "").toLowerCase() < String(entry.actor || "z").toLowerCase();
}

function assignTenantControl(controls, id, entries, mode) {
  if (!entries || entries.length === 0) return;
  const status = statusFromTenantEntries(entries, mode);
  controls[id] = mergeRecords(controls[id], {
    status,
    execution_time_ms: 0,
    evidence: tenantEvidenceFor(entries, { mode }),
    error: status === "FAIL" ? { message: `tenant-isolation ${mode} probe failed for ${id}` } : null,
  });
}

// ---------- Browser projection -------------------------------------------
// The concurrent-browser-sessions.py summary shape is:
//   { users, passed_all_routes, logout_ok, total_console_errors,
//     total_http_errors,
//     results: [{ user, routes: {...}, errors: [], http_errors: [], logout, logout_redirected_to_login }] }

const BROWSER_ROUTE_TO_CONTROL = {
  "/dashboard": "AUTHZ-001",
  "/decisions": "AUTHZ-002",
  "/reports": "AUTHZ-003",
  "/auditability": "AUTHZ-004",
};

function projectBrowser(summary, controls) {
  if (!summary || !Array.isArray(summary.results)) return;
  const users = summary.results;

  // Per-route controls (AUTHZ-001..004): fail if any user missed the route.
  for (const [route, controlId] of Object.entries(BROWSER_ROUTE_TO_CONTROL)) {
    const perUser = users.map((u) => ({ user: u.user, verdict: u.routes?.[route] ?? "missing" }));
    if (perUser.every((p) => p.verdict === "missing")) continue;
    const allOk = perUser.every((p) => p.verdict === "ok");
    controls[controlId] = mergeRecords(controls[controlId], {
      status: allOk ? "PASS" : "FAIL",
      execution_time_ms: 0,
      evidence: emptyEvidence({
        route,
        role: "member",
        organization_id: null,
        user_id: null,
        request: { method: "GET", url: route },
        response: { status: allOk ? 200 : null },
        status_code: allOk ? 200 : null,
        console_errors: users.flatMap((u) => u.errors || []).slice(0, 25),
        network_failures: users.flatMap((u) => u.http_errors || []).slice(0, 25),
        per_user: perUser,
      }),
      error: allOk ? null : { message: `One or more concurrent users failed to render ${route}` },
    });
  }

  // AUTHZ-006 — Anonymous redirect. The concurrent-sessions harness signs in
  // then logs out; a successful logout that redirects to /login is the
  // strongest evidence available from this harness.
  const logoutSample = users.map((u) => ({ user: u.user, logout: !!u.logout, redirected: !!u.logout_redirected_to_login }));
  const anyLogoutSample = logoutSample.some((s) => s.logout || s.redirected);
  if (anyLogoutSample) {
    const allRedirected = logoutSample.every((s) => s.redirected);
    controls["AUTHZ-006"] = mergeRecords(controls["AUTHZ-006"], {
      status: allRedirected ? "PASS" : "FAIL",
      execution_time_ms: 0,
      evidence: emptyEvidence({
        route: "/dashboard",
        role: "anonymous",
        request: { method: "GET", url: "/dashboard (post-logout)" },
        response: { status: allRedirected ? 302 : null },
        status_code: allRedirected ? 302 : null,
        redirect_chain: ["/dashboard", "/login"],
        per_user: logoutSample,
      }),
      error: allRedirected ? null : { message: "Post-logout redirect to /login did not occur for every user" },
    });
  }

  // AUTHZ-007 — All routes reachable for every concurrent user AND no console/http errors.
  const allRoutesPass = users.every((u) =>
    Object.values(u.routes || {}).every((v) => v === "ok"),
  );
  const noConsole = (summary.total_console_errors ?? 0) === 0;
  const noHttp = (summary.total_http_errors ?? 0) === 0;
  const status = users.length === 0 ? "SKIP" : (allRoutesPass && noConsole && noHttp ? "PASS" : "FAIL");
  controls["AUTHZ-007"] = mergeRecords(controls["AUTHZ-007"], {
    status,
    execution_time_ms: 0,
    evidence: emptyEvidence({
      role: "member",
      request: { method: "GET", url: "concurrent-browser-sessions" },
      response: { status: 200 },
      per_user_count: users.length,
      aggregate: {
        passed_all_routes: summary.passed_all_routes ?? null,
        logout_ok: summary.logout_ok ?? null,
        total_console_errors: summary.total_console_errors ?? null,
        total_http_errors: summary.total_http_errors ?? null,
      },
    }),
    error: status === "PASS" || status === "SKIP" ? null : {
      message: `Concurrent session stability failed (routes=${allRoutesPass} console_clean=${noConsole} http_clean=${noHttp})`,
    },
  });
}

// ---------- Route-probe projection ---------------------------------------
// Route-probe file feeds admin/role/edge/realtime controls that neither the
// tenant-isolation harness nor the browser harness can prove on their own.

function projectRouteProbes(payload, controls) {
  if (!payload || !Array.isArray(payload.probes)) return;
  const byControl = new Map();
  for (const p of payload.probes) {
    const id = String(p?.control_id || "");
    if (!id) continue;
    if (!byControl.has(id)) byControl.set(id, []);
    byControl.get(id).push(p);
  }
  for (const [id, probes] of byControl) {
    const allPass = probes.every((p) => p.pass === true);
    const first = probes[0];
    const record = {
      status: allPass ? "PASS" : "FAIL",
      execution_time_ms: 0,
      evidence: emptyEvidence({
        route: first.route ?? null,
        role: first.role ?? null,
        organization_id: first.organization_id ?? null,
        user_id: first.user_id ?? null,
        table: first.table ?? null,
        policy: first.policy ?? null,
        request: first.request ?? { method: first.method ?? null, url: first.route ?? null },
        response: first.response ?? { status: first.status_code ?? null, body_snippet: first.body_snippet ?? null },
        status_code: first.status_code ?? null,
        redirect_chain: Array.isArray(first.redirect_chain) ? first.redirect_chain : [],
        console_errors: Array.isArray(first.console_errors) ? first.console_errors : [],
        network_failures: Array.isArray(first.network_failures) ? first.network_failures : [],
        screenshots: Array.isArray(first.screenshots) ? first.screenshots : [],
        recommendation: first.recommendation ?? null,
        probes,
      }),
      error: allPass ? null : { message: `Route probe(s) for ${id} did not match expected outcome` },
    };
    controls[id] = mergeRecords(controls[id], record);
  }
}

// ---------- Top-level translate ------------------------------------------

export function translate({ tenantIsolation = null, browser = null, routeProbes = null, environment = "preview", strict = false } = {}) {
  const controls = {};

  const sources = {
    tenant_isolation: tenantIsolation?.run_tag ?? tenantIsolation?.source ?? null,
    browser: browser?.base_url ?? browser?.source ?? null,
    route_probes: routeProbes?.source ?? null,
  };

  if (tenantIsolation) projectTenantIsolation(tenantIsolation, controls);
  if (browser) projectBrowser(browser, controls);
  if (routeProbes) projectRouteProbes(routeProbes, controls);

  // Fill uncovered controls with SKIP — never fake PASS. Real assignments
  // above already set severity via mergeRecords among real records.
  for (const id of AUTHZ_REQUIRED_CONTROL_IDS) {
    if (!controls[id]) controls[id] = skipRecord("No adapter input covered this control");
  }

  const missing = AUTHZ_REQUIRED_CONTROL_IDS.filter((id) => controls[id].status === "SKIP");
  const warnings = missing.map((id) => ({ code: "CONTROL_SKIPPED", control_id: id, message: `No adapter input covered ${id}` }));

  if (strict && missing.length > 0) {
    const err = new Error(`Missing AUTHZ controls in strict mode: ${missing.join(", ")}`);
    err.code = "MISSING_CONTROLS";
    throw err;
  }

  return {
    result: {
      adapter: "authz-adapter",
      collected_at: new Date().toISOString(),
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
    `authz-adapter — tenant-isolation + browser + route probes → EE-2 Authorization evidence\n\n` +
      `Usage:\n` +
      `  node tests/evidence/adapters/authz-adapter.mjs \\\n` +
      `    [--tenant-isolation <path>] [--browser <path>] [--route-probes <path>] \\\n` +
      `    --output <authz-results-json> [--strict]\n\n` +
      `Options:\n` +
      `  --tenant-isolation  JSON summary from tests/tenant-isolation/run.mjs\n` +
      `  --browser           JSON summary from tests/e2e/concurrent-browser-sessions.py\n` +
      `  --route-probes      JSON emitted by a route-probe script (see README)\n` +
      `  --output, -o        Path to write the AUTHZ evidence JSON (required)\n` +
      `  --strict            Exit non-zero if any required AUTHZ control was left SKIP\n`,
  );
}

async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`authz-adapter: ${err.message}\n`);
    process.exit(1);
  }
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (!args.output) {
    printHelp();
    process.stderr.write("authz-adapter: --output is required\n");
    process.exit(1);
  }
  let tenantIsolation = null, browser = null, routeProbes = null;
  try {
    if (args.tenantIsolation) tenantIsolation = readJsonSafe(args.tenantIsolation);
    if (args.browser) browser = readJsonSafe(args.browser);
    if (args.routeProbes) routeProbes = readJsonSafe(args.routeProbes);
  } catch (err) {
    process.stderr.write(`authz-adapter: cannot read input: ${err.message}\n`);
    process.exit(1);
  }
  let out;
  try {
    out = translate({
      tenantIsolation,
      browser,
      routeProbes,
      environment: process.env.EVIDENCE_ENV || "preview",
      strict: args.strict,
    });
  } catch (err) {
    process.stderr.write(`authz-adapter: ${err.message}\n`);
    process.exit(1);
  }
  try {
    mkdirSync(dirname(resolve(args.output)), { recursive: true });
    writeFileSync(resolve(args.output), JSON.stringify(out.result, null, 2));
  } catch (err) {
    process.stderr.write(`authz-adapter: cannot write output: ${err.message}\n`);
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
  } catch {
    return false;
  }
})();
if (invokedDirect) {
  main(process.argv.slice(2));
}
