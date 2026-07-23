// tests/tenant-isolation/seed.mjs
// Creates two isolated orgs, one admin user each, and mandatory canary rows.
// Staging/preview ONLY (allow-list enforced by lib/guard.mjs).
//
// Role choice: 'admin'.
//   - decision_ledger SELECT policy allows owner|admin|executive
//   - decision_ledger INSERT policy allows owner|admin
//   - audit_log SELECT policy allows owner|admin
//   'admin' is the minimum role that can exercise every policy this suite
//   probes (both positive controls and cross-tenant negatives).
//
// Evidence surface: public.evidence_sources does NOT exist in this schema.
// Evidence is stored as decision_ledger.evidence_sources (JSONB). The canary
// decision_ledger row is seeded with a non-empty evidence_sources array so
// evidence-surface isolation is verified transitively through decision_ledger
// RLS (the only surface that actually governs evidence in this app).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardOrExit, must } from "./lib/guard.mjs";

const TARGET = guardOrExit();
const URL = must("LOAD_SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");

const SEEDED_ROLE = "admin";
const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const pw = () => randomBytes(24).toString("hex");
const runTag = `ti-${Date.now().toString(36)}`;

async function upsertOrg(name) {
  const { data, error } = await sb.from("organizations")
    .insert({ name, industry: "loadtest" })
    .select("id, name")
    .single();
  if (error) { console.error(`FATAL org ${name}: ${error.message}`); process.exit(1); }
  return data;
}

async function seedUser(orgTag, orgId) {
  const email = `${runTag}-${orgTag}@quantivis.test`;
  const password = pw();
  const { data, error } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { is_demo: true, is_loadtest: true, org_tag: orgTag, run_tag: runTag },
  });
  if (error) { console.error(`FATAL user ${email}: ${error.message}`); process.exit(1); }
  const userId = data.user.id;
  const { error: mErr } = await sb.from("organization_members")
    .upsert({ organization_id: orgId, user_id: userId, role: SEEDED_ROLE });
  if (mErr) { console.error(`FATAL member ${email}: ${mErr.message}`); process.exit(1); }
  return { email, password, user_id: userId, role: SEEDED_ROLE };
}

// Canary rows are MANDATORY. Any failure exits non-zero and no .state.json
// is written. This prevents vacuous "0 rows" isolation results.
async function seedRows(orgId, userId, orgTag) {
  const rows = {};

  const evidencePayload = [
    { source_type: "internal", source_name: `${runTag}-${orgTag}-evidence`, ref: "canary" },
  ];
  const { data: dec, error: decErr } = await sb.from("decision_ledger").insert({
    organization_id: orgId,
    title: `${runTag} canary ${orgTag}`,
    decision_type: "operational",
    status: "pending",
    created_by: userId,
    evidence_sources: evidencePayload,
  }).select("id, evidence_sources").single();
  if (decErr || !dec?.id) {
    console.error(`FATAL canary decision_ledger ${orgTag}: ${decErr?.message || "no id returned"}`);
    process.exit(1);
  }
  if (!Array.isArray(dec.evidence_sources) || dec.evidence_sources.length === 0) {
    console.error(`FATAL canary decision_ledger ${orgTag}: evidence_sources JSONB was not persisted`);
    process.exit(1);
  }
  rows.decision_ledger = dec.id;

  const { data: audit, error: auditErr } = await sb.from("audit_log").insert({
    organization_id: orgId,
    actor_id: userId,
    actor_type: "user",
    action_type: "tenant_isolation_seed",
    resource_type: "test",
    payload: { run_tag: runTag, org_tag: orgTag },
  }).select("id").single();
  if (auditErr || !audit?.id) {
    console.error(`FATAL canary audit_log ${orgTag}: ${auditErr?.message || "no id returned"}`);
    process.exit(1);
  }
  rows.audit_log = audit.id;

  return rows;
}

console.log(`Seeding tenant-isolation test (run=${runTag}, target=${TARGET}, role=${SEEDED_ROLE})…`);

const orgA = await upsertOrg(`org_loadtest_a_${runTag}`);
const orgB = await upsertOrg(`org_loadtest_b_${runTag}`);

const userA = await seedUser("a", orgA.id);
const userB = await seedUser("b", orgB.id);

const rowsA = await seedRows(orgA.id, userA.user_id, "a");
const rowsB = await seedRows(orgB.id, userB.user_id, "b");

const artifact = {
  run_tag: runTag,
  target: TARGET,
  seeded_role: SEEDED_ROLE,
  evidence_surface: "decision_ledger.evidence_sources (jsonb)",
  created_at: new Date().toISOString(),
  orgs: { a: orgA, b: orgB },
  users: { a: userA, b: userB },
  seeded_rows: { a: rowsA, b: rowsB },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname, { recursive: true });
writeFileSync(`${__dirname}/.state.json`, JSON.stringify(artifact, null, 2));
console.log(
  `Seeded orgs A=${orgA.id} B=${orgB.id} role=${SEEDED_ROLE}. ` +
  `State → tests/tenant-isolation/.state.json`,
);
