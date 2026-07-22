// tests/tenant-isolation/run.mjs
// Enterprise tenant-isolation harness.
//
// ORDER OF OPERATIONS (fail-fast):
//   1. Guard environment (staging/preview only).
//   2. Load .state.json; refuse to start if any mandatory canary is missing.
//   3. Sign in user A and user B with password grant.
//   4. POSITIVE CONTROLS (must all pass, else FRAMEWORK_INVALID exit 1):
//        - A reads own decision_ledger canary (row present)
//        - B reads own decision_ledger canary (row present)
//        - A reads own audit_log canary (row present)
//        - B reads own audit_log canary (row present)
//        - A performs one allowed own-org write (insert decision_ledger)
//        - B performs one allowed own-org write (insert decision_ledger)
//   5. NEGATIVE CROSS-TENANT PROBES:
//        - A→B read decision_ledger (must return [] with HTTP 200)
//        - B→A read decision_ledger (must return [] with HTTP 200)
//        - A→B read audit_log       (must return [] with HTTP 200)
//        - B→A read audit_log       (must return [] with HTTP 200)
//        - A→B insert decision_ledger (must be EXPECTED_DENIAL)
//        - B→A insert decision_ledger (must be EXPECTED_DENIAL)
//
// Evidence surface: decision_ledger.evidence_sources JSONB (public.evidence_sources
// does not exist in this schema; the JSONB column is the real evidence store and
// is governed by decision_ledger RLS, so cross-tenant leaks of evidence are
// covered by the decision_ledger probes).
//
// Verdicts:
//   PASS              — probe returned exactly what a correct policy allows
//   CRITICAL_LEAK     — cross-tenant read returned rows OR cross-tenant write succeeded
//   EXPECTED_DENIAL   — cross-tenant write rejected by documented RLS/auth class
//   FRAMEWORK_INVALID — positive control failed, canary missing, or malformed response
//   API_FAILURE       — unexpected HTTP status (4xx/5xx not in the denial class)
//
// Exit codes:
//   0  every positive control passed AND every negative probe was PASS or EXPECTED_DENIAL
//   1  FRAMEWORK_INVALID or API_FAILURE present (no leaks) — run is not valid
//   2  at least one CRITICAL_LEAK
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardOrExit, must } from "./lib/guard.mjs";

guardOrExit();
const URL = must("LOAD_SUPABASE_URL");
const ANON = must("LOAD_SUPABASE_ANON_KEY");

const __dirname = dirname(fileURLToPath(import.meta.url));
let state;
try {
  state = JSON.parse(readFileSync(`${__dirname}/.state.json`, "utf8"));
} catch {
  console.error("Missing tests/tenant-isolation/.state.json — run seed.mjs first.");
  process.exit(1);
}

const REQUIRED_CANARIES = ["decision_ledger", "audit_log"];
const missing = [];
for (const side of ["a", "b"]) {
  const c = (state.seeded_rows || {})[side] || {};
  for (const t of REQUIRED_CANARIES) if (!c[t]) missing.push(`${side}.${t}`);
}
if (missing.length > 0) {
  console.error("FRAMEWORK_INVALID: missing canaries: " + missing.join(", "));
  process.exit(1);
}

const results = [];
let leaks = 0, frameworkInvalid = 0, apiFailures = 0;

function push(e) {
  results.push(e);
  if (e.verdict === "CRITICAL_LEAK") leaks++;
  else if (e.verdict === "FRAMEWORK_INVALID") frameworkInvalid++;
  else if (e.verdict === "API_FAILURE") apiFailures++;
}

async function signIn(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.error(`FRAMEWORK_INVALID: sign-in failed for ${email}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const j = await res.json();
  return j.access_token;
}
function headers(token) {
  return { apikey: ANON, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}
async function readBody(res) {
  const text = await res.text();
  let parsed = null;
  try { parsed = text.length > 0 ? JSON.parse(text) : null; } catch { /* leave null */ }
  return { text, parsed };
}
function bodySnippet(text) { return (text || "").slice(0, 300); }

// ---------------------------------------------------------------------------
// Positive controls
// ---------------------------------------------------------------------------
async function positiveRead(token, actorEmail, actorOrgId, table, canaryId) {
  const url = `${URL}/rest/v1/${table}?organization_id=eq.${actorOrgId}&id=eq.${canaryId}&limit=1`;
  const base = {
    kind: "positive_read", actor: actorEmail, actor_org: actorOrgId, target_org: actorOrgId,
    table, op: "GET", canary_id: canaryId,
  };
  let res;
  try { res = await fetch(url, { headers: headers(token) }); }
  catch (e) { push({ ...base, status: 0, body: `network_error: ${e.message}`, verdict: "FRAMEWORK_INVALID" }); return false; }
  const { text, parsed } = await readBody(res);
  if (res.status !== 200) {
    push({ ...base, status: res.status, body: bodySnippet(text), verdict: "FRAMEWORK_INVALID",
      note: `own-org read expected 200; got ${res.status}` });
    return false;
  }
  if (!Array.isArray(parsed)) {
    push({ ...base, status: 200, body: bodySnippet(text), verdict: "FRAMEWORK_INVALID",
      note: "own-org read: body not a JSON array" });
    return false;
  }
  const found = parsed.some((r) => r && r.id === canaryId);
  if (!found) {
    push({ ...base, status: 200, row_count: parsed.length, body: bodySnippet(text),
      verdict: "FRAMEWORK_INVALID", note: "own-org read: canary row not visible to seeded user" });
    return false;
  }
  push({ ...base, status: 200, row_count: parsed.length, verdict: "PASS" });
  return true;
}

async function positiveWrite(token, actorEmail, actorOrgId) {
  const url = `${URL}/rest/v1/decision_ledger`;
  const base = {
    kind: "positive_write", actor: actorEmail, actor_org: actorOrgId, target_org: actorOrgId,
    table: "decision_ledger", op: "POST",
  };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...headers(token), Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: actorOrgId,
        title: `own-org-write-canary-${Date.now()}`,
        decision_type: "operational",
        status: "pending",
      }),
    });
  } catch (e) {
    push({ ...base, status: 0, body: `network_error: ${e.message}`, verdict: "FRAMEWORK_INVALID" });
    return false;
  }
  const { text, parsed } = await readBody(res);
  if (res.status >= 200 && res.status < 300 && Array.isArray(parsed) && parsed[0]?.id) {
    push({ ...base, status: res.status, inserted_id: parsed[0].id, verdict: "PASS" });
    return true;
  }
  push({ ...base, status: res.status, body: bodySnippet(text), verdict: "FRAMEWORK_INVALID",
    note: `own-org insert expected 2xx with row; got ${res.status}` });
  return false;
}

// ---------------------------------------------------------------------------
// Negative cross-tenant probes
// ---------------------------------------------------------------------------
async function negativeRead(token, actorEmail, actorOrgId, targetOrgId, table) {
  const url = `${URL}/rest/v1/${table}?organization_id=eq.${targetOrgId}&limit=5`;
  const base = { kind: "negative_read", actor: actorEmail, actor_org: actorOrgId, target_org: targetOrgId, table, op: "GET" };
  let res;
  try { res = await fetch(url, { headers: headers(token) }); }
  catch (e) { push({ ...base, status: 0, body: `network_error: ${e.message}`, verdict: "FRAMEWORK_INVALID" }); return; }
  const { text, parsed } = await readBody(res);
  if (res.status !== 200) {
    push({ ...base, status: res.status, body: bodySnippet(text), verdict: "API_FAILURE",
      note: `expected 200 with empty array; got ${res.status}` });
    return;
  }
  if (!Array.isArray(parsed)) {
    push({ ...base, status: 200, body: bodySnippet(text), verdict: "FRAMEWORK_INVALID",
      note: "200 but body is not a JSON array" });
    return;
  }
  if (parsed.length === 0) {
    push({ ...base, status: 200, row_count: 0, verdict: "PASS" });
    return;
  }
  push({ ...base, status: 200, row_count: parsed.length, body: bodySnippet(text), verdict: "CRITICAL_LEAK" });
}

function classifyWriteDenial(status, parsed, text) {
  if (status >= 200 && status < 300) {
    return { verdict: "CRITICAL_LEAK", note: "cross-tenant insert accepted" };
  }
  const code = parsed && typeof parsed === "object" ? String(parsed.code || "") : "";
  const msg = parsed && typeof parsed === "object" ? String(parsed.message || "") : text || "";
  const looksLikeRls =
    code === "42501" ||
    /row-level security|row level security|insufficient.privilege|permission denied/i.test(msg);
  if (status === 401 || status === 403 || looksLikeRls) {
    return { verdict: "EXPECTED_DENIAL", note: `rls_reject status=${status} code=${code || "-"}` };
  }
  return { verdict: "API_FAILURE", note: `unexpected denial class: status=${status} code=${code || "-"}` };
}

async function negativeWrite(token, actorEmail, actorOrgId, targetOrgId) {
  const url = `${URL}/rest/v1/decision_ledger`;
  const base = {
    kind: "negative_write", actor: actorEmail, actor_org: actorOrgId, target_org: targetOrgId,
    table: "decision_ledger", op: "POST",
  };
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...headers(token), Prefer: "return=representation" },
      body: JSON.stringify({
        organization_id: targetOrgId,
        title: `cross-tenant-write-probe-${Date.now()}`,
        decision_type: "operational",
        status: "pending",
      }),
    });
  } catch (e) {
    push({ ...base, status: 0, body: `network_error: ${e.message}`, verdict: "FRAMEWORK_INVALID" });
    return;
  }
  const { text, parsed } = await readBody(res);
  const cls = classifyWriteDenial(res.status, parsed, text);
  push({ ...base, status: res.status, body: bodySnippet(text), ...cls });
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------
const tokenA = await signIn(state.users.a.email, state.users.a.password);
const tokenB = await signIn(state.users.b.email, state.users.b.password);

// 1) Positive controls FIRST — abort on any failure.
const pos = [];
pos.push(await positiveRead(tokenA, state.users.a.email, state.orgs.a.id, "decision_ledger", state.seeded_rows.a.decision_ledger));
pos.push(await positiveRead(tokenB, state.users.b.email, state.orgs.b.id, "decision_ledger", state.seeded_rows.b.decision_ledger));
pos.push(await positiveRead(tokenA, state.users.a.email, state.orgs.a.id, "audit_log",       state.seeded_rows.a.audit_log));
pos.push(await positiveRead(tokenB, state.users.b.email, state.orgs.b.id, "audit_log",       state.seeded_rows.b.audit_log));
pos.push(await positiveWrite(tokenA, state.users.a.email, state.orgs.a.id));
pos.push(await positiveWrite(tokenB, state.users.b.email, state.orgs.b.id));

if (pos.some((ok) => !ok)) {
  const summary = {
    run_tag: state.run_tag,
    seeded_role: state.seeded_role,
    evidence_surface: state.evidence_surface,
    aborted: "positive_controls_failed",
    totals: countTotals(results),
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.error("\nFRAMEWORK_INVALID: one or more positive controls failed; negative probes not run. Exit 1.");
  process.exit(1);
}

// 2) Negative cross-tenant probes.
for (const t of REQUIRED_CANARIES) {
  await negativeRead(tokenA, state.users.a.email, state.orgs.a.id, state.orgs.b.id, t);
  await negativeRead(tokenB, state.users.b.email, state.orgs.b.id, state.orgs.a.id, t);
}
await negativeWrite(tokenA, state.users.a.email, state.orgs.a.id, state.orgs.b.id);
await negativeWrite(tokenB, state.users.b.email, state.orgs.b.id, state.orgs.a.id);

function countTotals(rs) {
  const t = { probes: rs.length, PASS: 0, EXPECTED_DENIAL: 0, CRITICAL_LEAK: 0, FRAMEWORK_INVALID: 0, API_FAILURE: 0 };
  for (const r of rs) if (t[r.verdict] != null) t[r.verdict]++;
  return t;
}

const summary = {
  run_tag: state.run_tag,
  seeded_role: state.seeded_role,
  evidence_surface: state.evidence_surface,
  totals: countTotals(results),
  results,
};
console.log(JSON.stringify(summary, null, 2));

if (leaks > 0) {
  console.error(`\nCRITICAL: ${leaks} cross-tenant leak(s). Exit 2.`);
  process.exit(2);
}
if (frameworkInvalid > 0 || apiFailures > 0) {
  console.error(
    `\nINVALID: ${frameworkInvalid} FRAMEWORK_INVALID, ${apiFailures} API_FAILURE. Not a valid PASS. Exit 1.`,
  );
  process.exit(1);
}
console.log(`\nPASS: ${results.length} probes — all positive controls PASS and all cross-tenant probes correctly denied.`);
