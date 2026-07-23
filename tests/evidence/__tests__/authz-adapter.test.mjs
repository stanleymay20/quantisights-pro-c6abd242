// tests/evidence/__tests__/authz-adapter.test.mjs
// EE-2 regression suite for the Authorization adapter (translator only).

import { test } from "node:test";
import assert from "node:assert/strict";
import { translate, parseArgs } from "../adapters/authz-adapter.mjs";
import { AUTHZ_REQUIRED_CONTROL_IDS } from "../pipelines/lib/authz-controls.mjs";
import { buildEvidence } from "../pipelines/authorization.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

test("parseArgs supports all documented flags", () => {
  const args = parseArgs([
    "--tenant-isolation", "/tmp/ti.json",
    "--browser", "/tmp/br.json",
    "--route-probes", "/tmp/rp.json",
    "--output", "/tmp/out.json",
    "--strict",
  ]);
  assert.equal(args.tenantIsolation, "/tmp/ti.json");
  assert.equal(args.browser, "/tmp/br.json");
  assert.equal(args.routeProbes, "/tmp/rp.json");
  assert.equal(args.output, "/tmp/out.json");
  assert.equal(args.strict, true);
});

test("no inputs → every required control emitted as SKIP", () => {
  const out = translate({});
  for (const id of AUTHZ_REQUIRED_CONTROL_IDS) {
    assert.equal(out.result.controls[id].status, "SKIP", `${id} should be SKIP`);
  }
  assert.equal(out.missing.length, 20);
});

test("strict mode with missing controls throws", () => {
  assert.throws(() => translate({ strict: true }), /Missing AUTHZ controls/);
});

test("tenant-isolation summary projects to positive/negative tenant controls", () => {
  const orgA = "org_a", orgB = "org_b";
  const summary = {
    orgs: { a: { id: orgA }, b: { id: orgB } },
    results: [
      { kind: "positive_read", actor: "a@x", actor_org: orgA, target_org: orgA, table: "decision_ledger", op: "GET", status: 200, verdict: "PASS" },
      { kind: "positive_read", actor: "a@x", actor_org: orgA, target_org: orgA, table: "audit_log", op: "GET", status: 200, verdict: "PASS" },
      { kind: "positive_read", actor: "b@x", actor_org: orgB, target_org: orgB, table: "decision_ledger", op: "GET", status: 200, verdict: "PASS" },
      { kind: "positive_read", actor: "b@x", actor_org: orgB, target_org: orgB, table: "audit_log", op: "GET", status: 200, verdict: "PASS" },
      { kind: "positive_write", actor: "a@x", actor_org: orgA, target_org: orgA, table: "decision_ledger", op: "POST", status: 201, verdict: "PASS" },
      { kind: "positive_write", actor: "b@x", actor_org: orgB, target_org: orgB, table: "decision_ledger", op: "POST", status: 201, verdict: "PASS" },
      { kind: "negative_read", actor: "a@x", actor_org: orgA, target_org: orgB, table: "decision_ledger", op: "GET", status: 200, row_count: 0, verdict: "PASS" },
      { kind: "negative_read", actor: "a@x", actor_org: orgA, target_org: orgB, table: "audit_log", op: "GET", status: 200, row_count: 0, verdict: "PASS" },
      { kind: "negative_read", actor: "b@x", actor_org: orgB, target_org: orgA, table: "decision_ledger", op: "GET", status: 200, row_count: 0, verdict: "PASS" },
      { kind: "negative_read", actor: "b@x", actor_org: orgB, target_org: orgA, table: "audit_log", op: "GET", status: 200, row_count: 0, verdict: "PASS" },
      { kind: "negative_write", actor: "a@x", actor_org: orgA, target_org: orgB, table: "decision_ledger", op: "POST", status: 403, verdict: "EXPECTED_DENIAL" },
      { kind: "negative_write", actor: "b@x", actor_org: orgB, target_org: orgA, table: "decision_ledger", op: "POST", status: 403, verdict: "EXPECTED_DENIAL" },
    ],
  };
  const { result } = translate({ tenantIsolation: summary });
  for (const id of ["AUTHZ-008", "AUTHZ-009", "AUTHZ-010", "AUTHZ-011", "AUTHZ-012", "AUTHZ-013", "AUTHZ-014", "AUTHZ-015", "AUTHZ-016"]) {
    assert.equal(result.controls[id].status, "PASS", `${id} should be PASS`);
  }
});

test("cross-tenant read leak surfaces as CRITICAL_LEAK in pipeline", () => {
  const summary = {
    orgs: { a: { id: "org_a" }, b: { id: "org_b" } },
    results: [
      { kind: "negative_read", actor: "a@x", actor_org: "org_a", target_org: "org_b", table: "decision_ledger", op: "GET", status: 200, row_count: 3, verdict: "CRITICAL_LEAK" },
    ],
  };
  const { result } = translate({ tenantIsolation: summary });
  assert.equal(result.controls["AUTHZ-010"].status, "FAIL");
  const evidence = buildEvidence(result);
  assert.equal(evidence.status, STATUS.CRITICAL_LEAK);
});

test("API_FAILURE denial class fails AUTHZ-016 (aggregated RLS)", () => {
  const summary = {
    orgs: { a: { id: "org_a" }, b: { id: "org_b" } },
    results: [
      { kind: "negative_write", actor: "a@x", actor_org: "org_a", target_org: "org_b", table: "decision_ledger", op: "POST", status: 500, verdict: "API_FAILURE" },
    ],
  };
  const { result } = translate({ tenantIsolation: summary });
  assert.equal(result.controls["AUTHZ-016"].status, "FAIL");
});

test("browser summary projects to AUTHZ-001..004, 006, 007", () => {
  const browser = {
    base_url: "http://localhost:8080",
    users: 2,
    passed_all_routes: 2,
    logout_ok: 2,
    total_console_errors: 0,
    total_http_errors: 0,
    results: [
      { user: 0, routes: { "/dashboard": "ok", "/decisions": "ok", "/auditability": "ok", "/reports": "ok" }, errors: [], http_errors: [], logout: true, logout_redirected_to_login: true },
      { user: 1, routes: { "/dashboard": "ok", "/decisions": "ok", "/auditability": "ok", "/reports": "ok" }, errors: [], http_errors: [], logout: true, logout_redirected_to_login: true },
    ],
  };
  const { result } = translate({ browser });
  for (const id of ["AUTHZ-001", "AUTHZ-002", "AUTHZ-003", "AUTHZ-004", "AUTHZ-006", "AUTHZ-007"]) {
    assert.equal(result.controls[id].status, "PASS", `${id} should be PASS`);
  }
});

test("browser: any user missing a route fails that route's control", () => {
  const browser = {
    base_url: "http://localhost:8080", users: 1,
    passed_all_routes: 0, logout_ok: 1,
    total_console_errors: 0, total_http_errors: 0,
    results: [
      { user: 0, routes: { "/dashboard": "selector_timeout", "/decisions": "ok", "/auditability": "ok", "/reports": "ok" }, errors: [], http_errors: [], logout: true, logout_redirected_to_login: true },
    ],
  };
  const { result } = translate({ browser });
  assert.equal(result.controls["AUTHZ-001"].status, "FAIL");
  assert.equal(result.controls["AUTHZ-002"].status, "PASS");
});

test("route probes project to admin/role/edge/realtime controls", () => {
  const routeProbes = {
    probes: [
      { control_id: "AUTHZ-005", route: "/admin/foo", role: "member", status_code: 302, redirect_chain: ["/admin/foo", "/login"], pass: true },
      { control_id: "AUTHZ-017", route: "rpc:list_users", role: "viewer", status_code: 403, pass: true },
      { control_id: "AUTHZ-018", route: "user_roles", role: "member", status_code: 403, pass: true },
      { control_id: "AUTHZ-019", route: "/functions/v1/private-fn", role: "anonymous", status_code: 401, pass: true },
      { control_id: "AUTHZ-020", route: "realtime:decision_ledger", role: "cross-tenant", status_code: 200, pass: true },
    ],
  };
  const { result } = translate({ routeProbes });
  for (const id of ["AUTHZ-005", "AUTHZ-017", "AUTHZ-018", "AUTHZ-019", "AUTHZ-020"]) {
    assert.equal(result.controls[id].status, "PASS", `${id} should be PASS`);
  }
});

test("route probe failure surfaces per-control FAIL", () => {
  const routeProbes = {
    probes: [
      { control_id: "AUTHZ-018", route: "user_roles", role: "member", status_code: 201, pass: false },
    ],
  };
  const { result } = translate({ routeProbes });
  assert.equal(result.controls["AUTHZ-018"].status, "FAIL");
  const evidence = buildEvidence(result);
  // AUTHZ-018 is severity=critical_leak → whole pipeline is CRITICAL_LEAK.
  assert.equal(evidence.status, STATUS.CRITICAL_LEAK);
});

test("combined inputs cover the full control matrix without SKIPs", () => {
  const orgA = "org_a", orgB = "org_b";
  const tenantIsolation = {
    orgs: { a: { id: orgA }, b: { id: orgB } },
    results: [
      { kind: "positive_read", actor: "a@x", actor_org: orgA, target_org: orgA, table: "decision_ledger", verdict: "PASS", status: 200 },
      { kind: "positive_read", actor: "b@x", actor_org: orgB, target_org: orgB, table: "decision_ledger", verdict: "PASS", status: 200 },
      { kind: "positive_write", actor: "a@x", actor_org: orgA, target_org: orgA, table: "decision_ledger", verdict: "PASS", status: 201 },
      { kind: "positive_write", actor: "b@x", actor_org: orgB, target_org: orgB, table: "decision_ledger", verdict: "PASS", status: 201 },
      { kind: "negative_read", actor: "a@x", actor_org: orgA, target_org: orgB, table: "decision_ledger", verdict: "PASS", status: 200, row_count: 0 },
      { kind: "negative_read", actor: "b@x", actor_org: orgB, target_org: orgA, table: "decision_ledger", verdict: "PASS", status: 200, row_count: 0 },
      { kind: "negative_write", actor: "a@x", actor_org: orgA, target_org: orgB, table: "decision_ledger", verdict: "EXPECTED_DENIAL", status: 403 },
      { kind: "negative_write", actor: "b@x", actor_org: orgB, target_org: orgA, table: "decision_ledger", verdict: "EXPECTED_DENIAL", status: 403 },
    ],
  };
  const browser = {
    base_url: "http://localhost:8080", users: 1,
    passed_all_routes: 1, logout_ok: 1,
    total_console_errors: 0, total_http_errors: 0,
    results: [{
      user: 0,
      routes: { "/dashboard": "ok", "/decisions": "ok", "/auditability": "ok", "/reports": "ok" },
      errors: [], http_errors: [], logout: true, logout_redirected_to_login: true,
    }],
  };
  const routeProbes = { probes: [
    { control_id: "AUTHZ-005", pass: true },
    { control_id: "AUTHZ-017", pass: true },
    { control_id: "AUTHZ-018", pass: true },
    { control_id: "AUTHZ-019", pass: true },
    { control_id: "AUTHZ-020", pass: true },
  ]};
  const { result, missing } = translate({ tenantIsolation, browser, routeProbes });
  assert.equal(missing.length, 0, `unmapped controls: ${missing.join(",")}`);
  const evidence = buildEvidence(result);
  assert.equal(evidence.status, STATUS.PASS);
});
