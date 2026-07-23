// tests/load/verify-teardown.mjs
import { createClient } from "@supabase/supabase-js";

const must = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(1); } return v; };
const sb = createClient(must("LOAD_SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const ORG_A = must("LOAD_ORG_A_ID");
const ORG_B = must("LOAD_ORG_B_ID");

let failed = false;
async function expectZero(label, q) {
  const { count, error } = await q;
  if (error) { console.error(`${label}: query error`, error.message); failed = true; return; }
  if ((count ?? 0) > 0) { console.error(`${label}: ${count} rows remain`); failed = true; }
  else console.log(`${label}: 0 ✓`);
}

for (const org of [ORG_A, ORG_B]) {
  for (const t of ["decision_ledger", "evidence_sources", "audit_log", "reports", "intelligence_audit_trail"]) {
    await expectZero(`${t}@${org}`, sb.from(t).select("*", { count: "exact", head: true }).eq("organization_id", org));
  }
}
const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const stragglers = (data?.users || []).filter((u) => u.email?.startsWith("loadtest-"));
if (stragglers.length) { console.error(`loadtest users remain: ${stragglers.length}`); failed = true; }
else console.log("loadtest users: 0 ✓");

if (failed) process.exit(1);
console.log("Teardown verified.");
