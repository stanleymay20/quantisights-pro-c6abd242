// tests/evidence/__tests__/authz-route-probes.test.mjs
// EE-2B regression suite for the route-probe adapter.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  translate,
  parseArgs,
  REQUIRED_ROUTE_PROBE_CONTROLS,
} from "../adapters/authz-route-probes.mjs";
import { translate as authzTranslate } from "../adapters/authz-adapter.mjs";
import { buildEvidence } from "../pipelines/authorization.mjs";
import { STATUS } from "../lib/taxonomy.mjs";

// ---------- helpers ---------------------------------------------------------

function fullProbeSet(overrides = {}) {
  const base = [
    {
      control_id: "AUTHZ-004",
      route: "/auditability",
      role: "member",
      organization_id: "org_a",
      user_id: "user_a",
      expected: "allow",
      method: "GET",
      status_code: 200,
    },
    {
      control_id: "AUTHZ-007",
      route: "/dashboard",
      role: "member",
      organization_id: "org_a",
      user_id: "user_a",
      expected: "allow",
      method: "GET",
      status_code: 200,
    },
    {
      control_id: "AUTHZ-012",
      route: "/rest/v1/decision_ledger",
      role: "member",
      organization_id: "org_a",
      user_id: "user_a",
      table: "decision_ledger",
      expected: "allow",
      method: "POST",
      status_code: 201,
    },
    {
      control_id: "AUTHZ-015",
      route: "/rest/v1/decision_ledger",
      role: "member",
      organization_id: "org_b",
      user_id: "user_b",
      table: "decision_ledger",
      expected: "leak_check",
      method: "POST",
      status_code: 403,
    },
    {
      control_id: "AUTHZ-019",
      route: "/functions/v1/protected-example",
      role: "anonymous",
      expected: "api",
      method: "POST",
      status_code: 401,
    },
  ];
  return base.map((p) => ({ ...p, ...(overrides[p.control_id] ?? {}) }));
}

// ---------- CLI parsing -----------------------------------------------------

test("parseArgs recognizes all documented flags", () => {
  const args = parseArgs([
    "--input", "/tmp/in.json",
    "--playwright", "/tmp/pw.json",
    "--output", "/tmp/out.json",
    "--strict",
  ]);
  assert.equal(args.input, "/tmp/in.json");
  assert.equal(args.playwright, "/tmp/pw.json");
  assert.equal(args.output, "/tmp/out.json");
  assert.equal(args.strict, true);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]), /Unknown argument/);
});

test("REQUIRED_ROUTE_PROBE_CONTROLS matches the EE-2B contract", () => {
  assert.deepEqual([...REQUIRED_ROUTE_PROBE_CONTROLS].sort(), [
    "AUTHZ-004",
    "AUTHZ-007",
    "AUTHZ-012",
    "AUTHZ-015",
    "AUTHZ-019",
  ]);
});

// ---------- successful mapping ---------------------------------------------

test("full happy path: all required controls PASS in strict mode", () => {
  const out = translate({ input: { probes: fullProbeSet() }, strict: true });
  assert.equal(out.result.probes.length, 5);
  assert.equal(out.missing.length, 0);
  for (const p of out.result.probes) {
    assert.equal(p.pass, true, `${p.control_id} should be pass=true`);
  }
});

test("emitted schema has all required evidence fields per control", () => {
  const out = translate({ input: { probes: fullProbeSet() } });
  const fields = [
    "control_id", "route", "role", "organization_id", "user_id",
    "request", "response", "status_code", "redirect_chain",
    "console_errors", "network_failures", "screenshots", "recommendation",
  ];
  for (const p of out.result.probes) {
    for (const f of fields) {
      assert.ok(f in p, `probe ${p.control_id} missing field "${f}"`);
    }
  }
});

// ---------- missing required probe -----------------------------------------

test("strict mode fails when a required control is missing", () => {
  const probes = fullProbeSet().filter((p) => p.control_id !== "AUTHZ-015");
  assert.throws(
    () => translate({ input: { probes }, strict: true }),
    /missing required probes.*AUTHZ-015/,
  );
});

test("non-strict mode emits warnings for missing required controls", () => {
  const probes = fullProbeSet().filter((p) => p.control_id !== "AUTHZ-019");
  const out = translate({ input: { probes }, strict: false });
  assert.deepEqual(out.missing, ["AUTHZ-019"]);
  assert.equal(out.warnings.length, 1);
  assert.equal(out.warnings[0].code, "ROUTE_PROBE_MISSING");
});

// ---------- malformed input ------------------------------------------------

test("malformed top-level input is a structural error (always fatal)", () => {
  assert.throws(
    () => translate({ input: { notProbes: [] } }),
    /expected \{ probes/,
  );
});

test("probe missing control_id is a structural error", () => {
  assert.throws(
    () => translate({ input: { probes: [{ route: "/x", expected: "allow" }] } }),
    /control_id missing/,
  );
});

test("probe missing route is a structural error", () => {
  assert.throws(
    () => translate({ input: { probes: [{ control_id: "AUTHZ-004", expected: "allow" }] } }),
    /route missing/,
  );
});

test("probe with unknown expected keyword is a structural error", () => {
  assert.throws(
    () =>
      translate({
        input: {
          probes: [{ control_id: "AUTHZ-004", route: "/x", expected: "banana" }],
        },
      }),
    /expected "banana" unknown/,
  );
});

// ---------- unknown control ID --------------------------------------------

test("probe referencing unknown AUTHZ control ID is a structural error", () => {
  assert.throws(
    () =>
      translate({
        input: {
          probes: [{ control_id: "AUTHZ-999", route: "/x", expected: "allow", status_code: 200 }],
        },
      }),
    /not a known AUTHZ control/,
  );
});

// ---------- expected denial mapping ----------------------------------------

test("AUTHZ-015 cross-tenant write with 403 is PASS (leak_check semantics)", () => {
  const p = translate({
    input: {
      probes: [
        {
          control_id: "AUTHZ-015",
          route: "/rest/v1/decision_ledger",
          table: "decision_ledger",
          organization_id: "org_a",
          expected: "leak_check",
          method: "POST",
          status_code: 403,
        },
      ],
    },
  }).result.probes[0];
  assert.equal(p.pass, true);
});

test("AUTHZ-015 accepts Postgres 42501 as expected denial", () => {
  const p = translate({
    input: {
      probes: [
        {
          control_id: "AUTHZ-015",
          route: "/rest/v1/decision_ledger",
          expected: "leak_check",
          method: "POST",
          status_code: 42501,
        },
      ],
    },
  }).result.probes[0];
  assert.equal(p.pass, true);
});

test("AUTHZ-006 anonymous browser redirect to /login is PASS via deny semantics", () => {
  const p = translate({
    input: {
      probes: [
        {
          control_id: "AUTHZ-006",
          route: "/dashboard",
          role: "anonymous",
          expected: "deny",
          method: "GET",
          status_code: 302,
          redirect_chain: ["/dashboard", "/login"],
        },
      ],
    },
  }).result.probes[0];
  assert.equal(p.pass, true);
});

// ---------- critical leak mapping ------------------------------------------

test("AUTHZ-015 cross-tenant write returning 201 is a CRITICAL_LEAK signal", () => {
  const routeProbes = translate({
    input: {
      probes: [
        {
          control_id: "AUTHZ-015",
          route: "/rest/v1/decision_ledger",
          table: "decision_ledger",
          expected: "leak_check",
          method: "POST",
          status_code: 201, // accepted — leak
        },
      ],
    },
  }).result;

  // Feed through authz-adapter → authorization pipeline and verify projection.
  const adapter = authzTranslate({ routeProbes });
  const evidence = buildEvidence(adapter.result);
  const rec = evidence.negative_controls.find((c) => c.name === "AUTHZ-015");
  assert.ok(rec, "AUTHZ-015 must appear in negative controls");
  assert.equal(rec.status, STATUS.CRITICAL_LEAK);
  assert.equal(evidence.status, STATUS.CRITICAL_LEAK);
});

// ---------- API failure mapping --------------------------------------------

test("AUTHZ-019 edge function returning 200 without JWT is SECURITY_FAILURE", () => {
  const routeProbes = translate({
    input: {
      probes: [
        {
          control_id: "AUTHZ-019",
          route: "/functions/v1/protected-example",
          expected: "api",
          method: "POST",
          status_code: 200,
        },
      ],
    },
  }).result;
  const adapter = authzTranslate({ routeProbes });
  const evidence = buildEvidence(adapter.result);
  const rec = evidence.negative_controls.find((c) => c.name === "AUTHZ-019");
  assert.equal(rec.status, STATUS.SECURITY_FAILURE);
});

// ---------- adapter integration --------------------------------------------

test("adapter integration: happy path feeds authz-adapter cleanly", () => {
  const routeProbes = translate({ input: { probes: fullProbeSet() } }).result;
  const adapter = authzTranslate({ routeProbes });
  const evidence = buildEvidence(adapter.result);
  // The 5 required controls should be positive.
  for (const id of REQUIRED_ROUTE_PROBE_CONTROLS) {
    const rec =
      evidence.positive_controls.find((c) => c.name === id) ||
      evidence.negative_controls.find((c) => c.name === id);
    assert.ok(rec, `${id} missing from pipeline evidence`);
    assert.equal(rec.status, STATUS.PASS, `${id} should PASS after happy-path translation`);
  }
});

// ---------- Playwright reporter input --------------------------------------

test("Playwright reporter annotations are translated into probes", () => {
  const playwrightReport = {
    suites: [
      {
        specs: [
          {
            title: "auditability renders for members",
            tests: [
              {
                annotations: [{ type: "authz-control", description: "AUTHZ-004" }],
                results: [
                  {
                    status: "passed",
                    attachments: [
                      {
                        name: "authz-probe",
                        contentType: "application/json",
                        body: Buffer.from(
                          JSON.stringify({
                            route: "/auditability",
                            role: "member",
                            expected: "allow",
                            status_code: 200,
                          }),
                        ).toString("base64"),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const out = translate({ playwright: playwrightReport });
  assert.equal(out.result.probes.length, 1);
  assert.equal(out.result.probes[0].control_id, "AUTHZ-004");
  assert.equal(out.result.probes[0].pass, true);
});
