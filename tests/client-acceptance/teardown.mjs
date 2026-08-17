import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, rmSync } from "node:fs";

const must = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

const TARGET = must("LOAD_TARGET");
const URL = must("LOAD_SUPABASE_URL");
const SERVICE_KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const STATE = process.env.CLIENT_ACCEPTANCE_STATE || "tests/client-acceptance/.state.json";
const STAGING_URL = "https://cmnihsbdbpubznlkmjbc.supabase.co";

if (TARGET !== "staging" || URL !== STAGING_URL) {
  throw new Error(`Refusing client-acceptance teardown outside approved staging (${TARGET}, ${URL})`);
}
if (!existsSync(STATE)) {
  console.log("No client-acceptance state found; nothing to teardown.");
  process.exit(0);
}

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const state = JSON.parse(readFileSync(STATE, "utf8"));
let failed = false;

for (const customer of Object.values(state.customers || {})) {
  if (customer.org_id) {
    for (const table of ["decision_ledger", "subscriptions", "organization_members"]) {
      const { error } = await sb.from(table).delete().eq("organization_id", customer.org_id);
      if (error) {
        failed = true;
        console.error(`teardown ${table} ${customer.org_id}: ${error.message}`);
      }
    }
    const { error: orgError } = await sb.from("organizations").delete().eq("id", customer.org_id);
    if (orgError) {
      failed = true;
      console.error(`teardown organization ${customer.org_id}: ${orgError.message}`);
    }
  }
  if (customer.user_id) {
    const { error: userError } = await sb.auth.admin.deleteUser(customer.user_id);
    if (userError && !String(userError.message).toLowerCase().includes("not found")) {
      failed = true;
      console.error(`teardown auth user ${customer.user_id}: ${userError.message}`);
    }
  }
}

if (failed) throw new Error("Client-acceptance teardown was incomplete");
rmSync(STATE, { force: true });
console.log("Client-acceptance fixtures removed cleanly.");
