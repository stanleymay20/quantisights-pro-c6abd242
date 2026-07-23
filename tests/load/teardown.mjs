// tests/load/teardown.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const must = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(1); } return v; };
const URL = must("LOAD_SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const TARGET = must("LOAD_TARGET");
const ORG_A = must("LOAD_ORG_A_ID");
const ORG_B = must("LOAD_ORG_B_ID");
if (TARGET === "production") { console.error("Refusing teardown in production."); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const file = process.env.LOAD_USERS_FILE || "tests/load/.users.json";
const users = JSON.parse(readFileSync(file, "utf8"));

for (const org of [ORG_A, ORG_B]) {
  for (const table of ["evidence_sources", "audit_log", "reports", "intelligence_audit_trail", "decision_ledger"]) {
    const { error } = await sb.from(table).delete().eq("organization_id", org);
    if (error) console.error(`delete ${table} (${org}):`, error.message);
  }
}
for (const u of users) {
  if (!u.user_id) continue;
  await sb.auth.admin.deleteUser(u.user_id).catch((e) => console.error("delete user", u.email, e.message));
}
console.log(`Teardown complete: ${users.length} users.`);
