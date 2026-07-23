// tests/load/integrity/verify-integrity.mjs
import { createClient } from "@supabase/supabase-js";

const must = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(1); } return v; };
const sb = createClient(must("LOAD_SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const ORG_A = must("LOAD_ORG_A_ID");
const ORG_B = must("LOAD_ORG_B_ID");

const issues = [];
async function check(label, fn) {
  try { const n = await fn(); if (n) issues.push(`${label}: ${n}`); else console.log(`${label}: ok`); }
  catch (e) { issues.push(`${label}: ${e.message}`); }
}

await check("duplicate decision titles (org A)", async () => {
  const { data } = await sb.from("decision_ledger").select("title").eq("organization_id", ORG_A);
  const seen = new Set(); let dup = 0;
  for (const r of data || []) { if (seen.has(r.title)) dup++; seen.add(r.title); }
  return dup;
});

await check("orphan organization_id in decision_ledger", async () => {
  const { data } = await sb.from("decision_ledger").select("organization_id").is("organization_id", null);
  return (data || []).length;
});

await check("audit_log rows missing entity_id", async () => {
  const { data } = await sb.from("audit_log").select("id").in("organization_id", [ORG_A, ORG_B]).is("entity_id", null);
  return (data || []).length;
});

if (issues.length) { console.error("Integrity issues:\n" + issues.map((i) => " - " + i).join("\n")); process.exit(1); }
console.log("Integrity verified.");
