// tests/evidence/__tests__/authz-route-probes-emitter.test.mjs
// EE-2C — Regression suite for the route-probe emitter.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseArgs,
  validateEnv,
  planProbes,
  assertPlanCoversRequiredControls,
  formatProbeRow,
  REQUIRED_ENV,
} from "../probes/authz-route-probes.mjs";
import { REQUIRED_ROUTE_PROBE_CONTROLS } from "../adapters/authz-route-probes.mjs";
import { translate as translateRouteProbes } from "../adapters/authz-route-probes.mjs";

function goodEnv(overrides = {}) {
  return {
    LOAD_TARGET: "staging",
    LOAD_BASE_URL: "https://staging.example.test",
    LOAD_SUPABASE_URL: "https://xyz.supabase.test",
    LOAD_SUPABASE_ANON_KEY: "anon-xyz",
    LOAD_ORG_A_ID: "org_loadtest_a",
    LOAD_ORG_B_ID: "org_loadtest_b",
    LOAD_USER_A_EMAIL: "a@load.test",
    LOAD_USER_A_PASSWORD: "pw-a",
    LOAD_USER_B_EMAIL: "b@load.test",
    LOAD_USER_B_PASSWORD: "pw-b",
    ...overrides,
  };
}

test("parseArgs: recognizes --yes and --dry-run", () => {
  const a = parseArgs(["--yes", "--dry-run"]);
  assert.equal(a.yes, true);
  assert.equal(a.dryRun, true);
});

test("parseArgs: rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]));
});

test("REQUIRED_ENV: contract locked and non-empty", () => {
  assert.ok(REQUIRED_ENV.length >= 10);
  for (const k of [
    "LOAD_TARGET", "LOAD_BASE_URL", "LOAD_SUPABASE_URL", "LOAD_SUPABASE_ANON_KEY",
    "LOAD_ORG_A_ID", "LOAD_ORG_B_ID",
    "LOAD_USER_A_EMAIL", "LOAD_USER_A_PASSWORD",
    "LOAD_USER_B_EMAIL", "LOAD_USER_B_PASSWORD",
  ]) assert.ok(REQUIRED_ENV.includes(k), `missing required env: ${k}`);
});

test("validateEnv: happy path returns no errors", () => {
  assert.deepEqual(validateEnv(goodEnv()), []);
});

test("validateEnv: missing env vars all reported", () => {
  const errs = validateEnv({});
  for (const k of REQUIRED_ENV) assert.ok(errs.includes(`missing:${k}`), `missing:${k} not reported`);
});

test("validateEnv: refuses LOAD_TARGET=production", () => {
  const errs = validateEnv(goodEnv({ LOAD_TARGET: "production" }));
  assert.ok(errs.some((e) => e.startsWith("production_refused:LOAD_TARGET=")));
});

test("validateEnv: refuses prod-like LOAD_BASE_URL", () => {
  const errs = validateEnv(goodEnv({ LOAD_BASE_URL: "https://www.quantivis.io" }));
  assert.ok(errs.some((e) => e.startsWith("production_refused:LOAD_BASE_URL=")));
});

test("validateEnv: refuses unknown target", () => {
  const errs = validateEnv(goodEnv({ LOAD_TARGET: "qa" }));
  assert.ok(errs.some((e) => e.startsWith("unknown_target:")));
});

test("validateEnv: org IDs must start with org_loadtest_", () => {
  const errs = validateEnv(goodEnv({ LOAD_ORG_A_ID: "org_customer_acme" }));
  assert.ok(errs.some((e) => e.startsWith("unsafe_org:LOAD_ORG_A_ID=")));
});

test("validateEnv: orgs must differ", () => {
  const errs = validateEnv(goodEnv({ LOAD_ORG_B_ID: "org_loadtest_a" }));
  assert.ok(errs.includes("orgs_must_differ"));
});

test("planProbes: covers all 5 required controls and stamps test_run_id", () => {
  const plan = planProbes(goodEnv(), { testRunId: "run-xyz" });
  const ids = plan.map((p) => p.control_id).sort();
  assert.deepEqual(ids, [...REQUIRED_ROUTE_PROBE_CONTROLS].sort());
  const writes = plan.filter((p) => p.body);
  assert.ok(writes.length > 0);
  for (const w of writes) assert.equal(w.body.metadata.test_run_id, "run-xyz");
});

test("planProbes: cross-tenant write targets Org B with User A auth", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" });
  const cross = plan.find((p) => p.control_id === "AUTHZ-015");
  assert.equal(cross.auth, "user_a");
  assert.equal(cross.organization_id, "org_loadtest_b");
  assert.equal(cross.body.organization_id, "org_loadtest_b");
  assert.equal(cross.expected, "leak_check");
});

test("planProbes: edge-fn probe is unauthenticated", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" });
  const edge = plan.find((p) => p.control_id === "AUTHZ-019");
  assert.equal(edge.auth, "none");
  assert.equal(edge.expected, "api");
});

test("planProbes: no probe hits a delete verb", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" });
  for (const p of plan) assert.notEqual(p.method, "DELETE");
});

test("assertPlanCoversRequiredControls: throws when a required id is missing", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" }).filter((p) => p.control_id !== "AUTHZ-019");
  assert.throws(() => assertPlanCoversRequiredControls(plan), /plan_missing_required_controls/);
});

test("formatProbeRow: yields translator-compatible shape", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" });
  const rows = plan.map((d) => formatProbeRow(d, {
    statusCode: d.expected === "allow" ? 200 : d.expected === "leak_check" ? 403 : 401,
    responseSnippet: "ok",
  }));
  const translated = translateRouteProbes({ input: { probes: rows } });
  assert.equal(translated.result.probes.length, plan.length);
  for (const p of translated.result.probes) assert.equal(typeof p.pass, "boolean");
});

test("formatProbeRow: truncates response snippet to 300 chars", () => {
  const plan = planProbes(goodEnv(), { testRunId: "r1" });
  const row = formatProbeRow(plan[0], {
    statusCode: 200,
    responseSnippet: "x".repeat(1000),
  });
  assert.equal(row.response.snippet.length, 300);
});
