// tests/tenant-isolation/teardown.mjs
// Deletes seeded rows, users, and the two orgs created by seed.mjs.
// Fails hard (exit 1) on ANY cleanup error so CI never silently leaves residue.
import { createClient } from "@supabase/supabase-js";
import { readFileSync, unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guardOrExit, must } from "./lib/guard.mjs";

guardOrExit();
const URL = must("LOAD_SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");

const __dirname = dirname(fileURLToPath(import.meta.url));
const statePath = `${__dirname}/.state.json`;
let state;
try { state = JSON.parse(readFileSync(statePath, "utf8")); }
catch { console.error("No .state.json — nothing to tear down."); process.exit(0); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const failures = [];

for (const org of [state.orgs.a.id, state.orgs.b.id]) {
  for (const table of ["audit_log", "decision_ledger", "organization_members"]) {
    const { error } = await sb.from(table).delete().eq("organization_id", org);
    if (error) failures.push({ op: `delete ${table}`, org, error: error.message });
  }
  const { error: oErr } = await sb.from("organizations").delete().eq("id", org);
  if (oErr) failures.push({ op: "delete organization", org, error: oErr.message });
}

for (const u of [state.users.a, state.users.b]) {
  if (!u.user_id) continue;
  const { error } = await sb.auth.admin.deleteUser(u.user_id);
  if (error) failures.push({ op: "delete user", email: u.email, error: error.message });
}

if (failures.length > 0) {
  console.error(`Teardown FAILED for run ${state.run_tag}:`);
  console.error(JSON.stringify(failures, null, 2));
  console.error("State file preserved at:", statePath);
  process.exit(1);
}

try { unlinkSync(statePath); } catch { /* ignore */ }
console.log(`Teardown complete for run ${state.run_tag}. 0 failures.`);
