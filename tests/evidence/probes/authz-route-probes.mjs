#!/usr/bin/env node
// tests/evidence/probes/authz-route-probes.mjs
// EE-2C — Staging-safe route-probe emitter.
//
// Purpose:
//   Perform the actual HTTP observations that the pure translator
//   tests/evidence/adapters/authz-route-probes.mjs consumes. Emits JSON in
//   the exact `{ probes: [...] }` shape expected by that translator.
//
// Controls covered (contract-locked with the translator):
//     AUTHZ-004  Protected governance access
//     AUTHZ-007  Authenticated route access
//     AUTHZ-012  Own-tenant write allowed
//     AUTHZ-015  Cross-tenant write denied
//     AUTHZ-019  Edge function authorization
//
// Safety posture (fail-closed):
//   * LOAD_TARGET allow-list (staging|preview) via tests/tenant-isolation/lib/guard.mjs.
//   * Requires --yes to run destructive writes.
//   * Destructive writes require BOTH LOAD_ORG_A_ID and LOAD_ORG_B_ID to
//     start with `org_loadtest_` — no real customer org can be touched.
//   * Every insert stamps `test_run_id` in metadata for traceability.
//   * Never deletes rows. Never sends email. Never calls live AI.
//   * All required env vars validated up front; missing -> exit 1.
//   * Refuses production even when a caller shims LOAD_TARGET.
//
// Inputs (env):
//   LOAD_TARGET               staging | preview (required, allow-list)
//   LOAD_BASE_URL             Base URL of the app (e.g. https://staging.quantivis.io)
//   LOAD_SUPABASE_URL         Backend REST/auth endpoint
//   LOAD_SUPABASE_ANON_KEY    Anon key for the target env
//   LOAD_ORG_A_ID             Must start with org_loadtest_
//   LOAD_ORG_B_ID             Must start with org_loadtest_
//   LOAD_USER_A_EMAIL / LOAD_USER_A_PASSWORD
//   LOAD_USER_B_EMAIL / LOAD_USER_B_PASSWORD
//   AUTHZ_ROUTE_PROBE_OUTPUT  Output path (default /tmp/authz-route-probes.raw.json)
//
// CLI:
//   --yes         Explicit confirmation. Required.
//   --dry-run     Plan the probes, print them, do not fetch.
//   --help
//
// Output shape (compatible with tests/evidence/adapters/authz-route-probes.mjs):
//   {
//     "source": "authz-route-probe-emitter",
//     "collected_at": "<ISO-8601>",
//     "test_run_id": "<uuid>",
//     "probes": [ { control_id, route, expected, status_code, ... }, ... ]
//   }

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { guardOrExit } from "../../tenant-isolation/lib/guard.mjs";
import { REQUIRED_ROUTE_PROBE_CONTROLS } from "../adapters/authz-route-probes.mjs";

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export const REQUIRED_ENV = Object.freeze([
  "LOAD_TARGET",
  "LOAD_BASE_URL",
  "LOAD_SUPABASE_URL",
  "LOAD_SUPABASE_ANON_KEY",
  "LOAD_ORG_A_ID",
  "LOAD_ORG_B_ID",
  "LOAD_USER_A_EMAIL",
  "LOAD_USER_A_PASSWORD",
  "LOAD_USER_B_EMAIL",
  "LOAD_USER_B_PASSWORD",
]);

const PRODUCTION_TOKENS = ["production", "prod", "live", "main", "release"];
const LOADTEST_ORG_PREFIX = "org_loadtest_";

export function parseArgs(argv) {
  const args = { yes: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--yes") args.yes = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

export function validateEnv(env) {
  const errors = [];
  for (const k of REQUIRED_ENV) {
    if (!env[k] || String(env[k]).trim() === "") errors.push(`missing:${k}`);
  }
  const target = String(env.LOAD_TARGET || "").trim().toLowerCase();
  if (target && PRODUCTION_TOKENS.includes(target)) {
    errors.push(`production_refused:LOAD_TARGET=${target}`);
  }
  if (target && !["staging", "preview"].includes(target)) {
    errors.push(`unknown_target:${target}`);
  }
  const base = String(env.LOAD_BASE_URL || "");
  if (base && /(^|\/\/)(www\.)?quantivis\.io(\/|$)/i.test(base)) {
    errors.push(`production_refused:LOAD_BASE_URL=${base}`);
  }
  const a = String(env.LOAD_ORG_A_ID || "");
  const b = String(env.LOAD_ORG_B_ID || "");
  if (a && !a.startsWith(LOADTEST_ORG_PREFIX)) errors.push(`unsafe_org:LOAD_ORG_A_ID=${a}`);
  if (b && !b.startsWith(LOADTEST_ORG_PREFIX)) errors.push(`unsafe_org:LOAD_ORG_B_ID=${b}`);
  if (a && b && a === b) errors.push("orgs_must_differ");
  return errors;
}

/**
 * Plan the probes to run. Pure — no I/O.
 * Returns an ordered list of probe descriptors; each becomes exactly one
 * output row keyed by control_id.
 */
export function planProbes(env, { testRunId }) {
  const base = env.LOAD_BASE_URL.replace(/\/$/, "");
  const rest = env.LOAD_SUPABASE_URL.replace(/\/$/, "");
  return [
    {
      control_id: "AUTHZ-004",
      description: "Anonymous GET /auditability must redirect to /login",
      route: "/auditability",
      method: "GET",
      auth: "none",
      target_url: `${base}/auditability`,
      expected: "deny",
      organization_id: null,
      user_id: null,
      role: "anonymous",
    },
    {
      control_id: "AUTHZ-007",
      description: "User A GET /dashboard reaches the app shell",
      route: "/dashboard",
      method: "GET",
      auth: "user_a",
      target_url: `${base}/dashboard`,
      expected: "allow",
      organization_id: env.LOAD_ORG_A_ID,
      user_id: "user_a",
      role: "member",
    },
    {
      control_id: "AUTHZ-012",
      description: "User A INSERT decision_ledger in own org must succeed",
      route: "/rest/v1/decision_ledger",
      method: "POST",
      auth: "user_a",
      target_url: `${rest}/rest/v1/decision_ledger`,
      expected: "allow",
      organization_id: env.LOAD_ORG_A_ID,
      user_id: "user_a",
      role: "admin",
      body: {
        organization_id: env.LOAD_ORG_A_ID,
        title: `authz-probe own-write ${testRunId}`,
        status: "pending",
        metadata: { test_run_id: testRunId, probe: "AUTHZ-012" },
      },
    },
    {
      control_id: "AUTHZ-015",
      description: "User A INSERT decision_ledger in Org B must be denied",
      route: "/rest/v1/decision_ledger",
      method: "POST",
      auth: "user_a",
      target_url: `${rest}/rest/v1/decision_ledger`,
      expected: "leak_check",
      organization_id: env.LOAD_ORG_B_ID,
      user_id: "user_a",
      role: "admin",
      body: {
        organization_id: env.LOAD_ORG_B_ID,
        title: `authz-probe CROSS-TENANT ${testRunId}`,
        status: "pending",
        metadata: { test_run_id: testRunId, probe: "AUTHZ-015" },
      },
    },
    {
      control_id: "AUTHZ-019",
      description: "Edge function invocation without JWT must be denied",
      route: "/functions/v1/prescriptive-advisory",
      method: "POST",
      auth: "none",
      target_url: `${rest}/functions/v1/prescriptive-advisory`,
      expected: "api",
      organization_id: null,
      user_id: null,
      role: "anonymous",
      body: { probe: "AUTHZ-019", metadata: { test_run_id: testRunId, probe: "AUTHZ-019" } },
    },
  ];
}

/**
 * Assert every REQUIRED_ROUTE_PROBE_CONTROLS id is present in the plan.
 * Pure — used both at runtime and in tests.
 */
export function assertPlanCoversRequiredControls(plan) {
  const ids = new Set(plan.map((p) => p.control_id));
  const missing = REQUIRED_ROUTE_PROBE_CONTROLS.filter((c) => !ids.has(c));
  if (missing.length > 0) {
    throw new Error(`plan_missing_required_controls: ${missing.join(",")}`);
  }
  return true;
}

/**
 * Convert a fetch Response + descriptor into the probe row consumed by
 * tests/evidence/adapters/authz-route-probes.mjs.
 * Pure over its inputs.
 */
export function formatProbeRow(descriptor, {
  statusCode,
  redirectChain = [],
  responseSnippet = "",
  consoleErrors = [],
  networkFailures = [],
  screenshots = [],
  notes = "",
  requestSummary,
}) {
  return {
    control_id: descriptor.control_id,
    route: descriptor.route,
    role: descriptor.role,
    organization_id: descriptor.organization_id,
    user_id: descriptor.user_id,
    method: descriptor.method,
    expected: descriptor.expected,
    status_code: statusCode,
    redirect_chain: redirectChain,
    request: requestSummary || {
      method: descriptor.method,
      url: descriptor.target_url,
      auth: descriptor.auth,
    },
    response: { snippet: String(responseSnippet).slice(0, 300) },
    console_errors: consoleErrors,
    network_failures: networkFailures,
    screenshots,
    notes: notes || descriptor.description,
  };
}

// ---------------------------------------------------------------------------
// Runtime (network) — invoked only from main()
// ---------------------------------------------------------------------------

async function signIn(env, email, password) {
  const res = await fetch(`${env.LOAD_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.LOAD_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`sign-in failed for ${email}: HTTP ${res.status}`);
  }
  const j = await res.json();
  return j.access_token;
}

async function executeProbe(env, descriptor, tokens) {
  const headers = { "Content-Type": "application/json" };
  if (descriptor.auth === "user_a") {
    headers.apikey = env.LOAD_SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${tokens.a}`;
    headers.Prefer = "return=minimal";
  } else if (descriptor.auth === "user_b") {
    headers.apikey = env.LOAD_SUPABASE_ANON_KEY;
    headers.Authorization = `Bearer ${tokens.b}`;
    headers.Prefer = "return=minimal";
  }
  const init = { method: descriptor.method, headers, redirect: "manual" };
  if (descriptor.body) init.body = JSON.stringify(descriptor.body);
  const redirectChain = [];
  let res;
  try {
    res = await fetch(descriptor.target_url, init);
  } catch (e) {
    return formatProbeRow(descriptor, {
      statusCode: 0,
      responseSnippet: `network_error: ${e.message}`,
      networkFailures: [{ url: descriptor.target_url, error: e.message }],
      notes: "fetch failed",
    });
  }
  const loc = res.headers.get("location");
  if (loc) redirectChain.push(loc);
  const text = await res.text().catch(() => "");
  return formatProbeRow(descriptor, {
    statusCode: res.status,
    redirectChain,
    responseSnippet: text,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node tests/evidence/probes/authz-route-probes.mjs --yes [--dry-run]");
    return;
  }
  // Guard first — refuses non-staging.
  guardOrExit();
  const errs = validateEnv(process.env);
  if (errs.length > 0) {
    console.error("env_validation_failed:", errs.join(", "));
    process.exit(1);
  }
  if (!args.yes) {
    console.error("refusing to run: pass --yes to acknowledge destructive writes.");
    process.exit(1);
  }
  const testRunId = randomUUID();
  const plan = planProbes(process.env, { testRunId });
  assertPlanCoversRequiredControls(plan);

  const outPath = process.env.AUTHZ_ROUTE_PROBE_OUTPUT || "/tmp/authz-route-probes.raw.json";
  if (args.dryRun) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({
      source: "authz-route-probe-emitter",
      mode: "dry-run",
      collected_at: new Date().toISOString(),
      test_run_id: testRunId,
      probes: plan.map((d) => formatProbeRow(d, {
        statusCode: null,
        notes: `DRY RUN — ${d.description}`,
      })),
    }, null, 2));
    console.log(`dry-run plan written: ${outPath} (${plan.length} probes)`);
    return;
  }

  const tokens = {
    a: await signIn(process.env, process.env.LOAD_USER_A_EMAIL, process.env.LOAD_USER_A_PASSWORD),
    b: await signIn(process.env, process.env.LOAD_USER_B_EMAIL, process.env.LOAD_USER_B_PASSWORD),
  };
  const probes = [];
  for (const d of plan) probes.push(await executeProbe(process.env, d, tokens));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({
    source: "authz-route-probe-emitter",
    collected_at: new Date().toISOString(),
    test_run_id: testRunId,
    probes,
  }, null, 2));
  console.log(`wrote ${probes.length} probes -> ${outPath}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => { console.error(e.stack || e.message); process.exit(1); });
}
