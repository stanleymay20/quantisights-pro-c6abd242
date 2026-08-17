import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

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
  throw new Error(`Refusing client-acceptance seeding outside approved staging (${TARGET}, ${URL})`);
}

const sb = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const runTag = `ca-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
const tiers = ["starter", "growth", "enterprise"];
const state = { run_tag: runTag, target: TARGET, created_at: new Date().toISOString(), customers: {} };

const persist = () => {
  mkdirSync("tests/client-acceptance", { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2), { mode: 0o600 });
};

async function cleanupPartial() {
  for (const customer of Object.values(state.customers)) {
    if (customer.org_id) {
      await sb.from("decision_ledger").delete().eq("organization_id", customer.org_id);
      await sb.from("subscriptions").delete().eq("organization_id", customer.org_id);
      await sb.from("organization_members").delete().eq("organization_id", customer.org_id);
      await sb.from("organizations").delete().eq("id", customer.org_id);
    }
    if (customer.user_id) await sb.auth.admin.deleteUser(customer.user_id).catch(() => {});
  }
}

try {
  for (const tier of tiers) {
    const { data: org, error: orgError } = await sb
      .from("organizations")
      .insert({ name: `Client Acceptance ${tier} ${runTag}`, industry: "client-acceptance" })
      .select("id")
      .single();
    if (orgError || !org?.id) throw new Error(`Create ${tier} org: ${orgError?.message || "no id"}`);

    const password = randomBytes(18).toString("base64url") + "!Aa7";
    const email = `${runTag}-${tier}@quantivis.test`;
    const { data: userData, error: userError } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_client_acceptance: true, acceptance_tier: tier, run_tag: runTag },
    });
    if (userError || !userData?.user?.id) throw new Error(`Create ${tier} user: ${userError?.message || "no id"}`);
    const userId = userData.user.id;

    state.customers[tier] = { tier, org_id: org.id, user_id: userId, email, password };
    persist();

    const { error: memberError } = await sb.from("organization_members").insert({
      organization_id: org.id,
      user_id: userId,
      role: "admin",
    });
    if (memberError) throw new Error(`Create ${tier} membership: ${memberError.message}`);

    const { error: subscriptionError } = await sb.from("subscriptions").insert({
      organization_id: org.id,
      stripe_customer_id: `client_acceptance_${runTag}_${tier}`,
      stripe_subscription_id: `pilot_client_acceptance_${runTag}_${tier}`,
      tier,
      status: "active",
      current_period_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      billing_interval: "month",
    });
    if (subscriptionError) throw new Error(`Create ${tier} subscription: ${subscriptionError.message}`);

    const { error: decisionError } = await sb.from("decision_ledger").insert({
      organization_id: org.id,
      recommended_action: `Client acceptance decision for ${tier}`,
      decision_type: "operational",
      decision_status: "pending",
      decided_by: userId,
      evidence_sources: [{ source_type: "internal", source_name: `${runTag}-${tier}-evidence`, ref: "client-acceptance" }],
    });
    if (decisionError) throw new Error(`Create ${tier} decision: ${decisionError.message}`);
  }

  persist();
  console.log(`Seeded disposable client-acceptance customers for ${tiers.join(", ")}.`);
} catch (error) {
  persist();
  await cleanupPartial();
  throw error;
}
