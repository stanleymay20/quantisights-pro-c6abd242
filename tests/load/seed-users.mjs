// tests/load/seed-users.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

const must = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}`); process.exit(1); } return v; };
const URL = must("LOAD_SUPABASE_URL");
const KEY = must("SUPABASE_SERVICE_ROLE_KEY");
const ORG_A = must("LOAD_ORG_A_ID");
const ORG_B = must("LOAD_ORG_B_ID");
const TARGET = must("LOAD_TARGET");
const COUNT = Number(process.env.LOAD_USER_COUNT || 1000);
if (TARGET === "production") { console.error("Refusing to seed in production."); process.exit(1); }

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const pw = () => randomBytes(16).toString("hex");
const out = [];

async function seed(orgTag, orgId, n) {
  for (let i = 0; i < n; i++) {
    const email = `loadtest-${orgTag}+${i}@quantivis.test`;
    const password = pw();
    const { data, error } = await sb.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { is_demo: true, is_loadtest: true, org_tag: orgTag },
    });
    if (error && !String(error.message).includes("already")) {
      console.error(`seed ${email}:`, error.message); continue;
    }
    const userId = data?.user?.id;
    if (userId) {
      await sb.from("organization_members").upsert({ organization_id: orgId, user_id: userId, role: "member" });
    }
    out.push({ email, password, org: orgTag, user_id: userId });
    if (i % 100 === 0) console.log(`${orgTag}: seeded ${i}/${n}`);
  }
}

const perOrg = Math.floor(COUNT / 2);
await seed("a", ORG_A, perOrg);
await seed("b", ORG_B, perOrg);
mkdirSync("tests/load", { recursive: true });
writeFileSync(process.env.LOAD_USERS_FILE || "tests/load/.users.json", JSON.stringify(out, null, 2));
console.log(`Seeded ${out.length} users.`);
