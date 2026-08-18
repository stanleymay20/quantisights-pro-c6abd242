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

    // These fixtures model paying customers, not evaluation pilots. Using a
    // pilot_* subscription id would make useSubscription() set isPilot=true and
    // would silently test the wrong pricing/upgrade experience.
    const { error: subscriptionError } = await sb.from("subscriptions").insert({
      organization_id: org.id,
      stripe_customer_id: `client_acceptance_${runTag}_${tier}`,
      stripe_subscription_id: `client_acceptance_paid_${runTag}_${tier}`,
      tier,
      status: "active",
      current_period_end: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      billing_interval: "month",
    });
    if (subscriptionError) throw new Error(`Create ${tier} subscription: ${subscriptionError.message}`);

    const { data: decision, error: decisionError } = await sb
      .from("decision_ledger")
      .insert({
        organization_id: org.id,
        recommended_action: `Renegotiate the primary supplier agreement for ${tier}`,
        decision_type: "operational",
        decision_status: "pending",
        source_insight_summary: "Supplier cost increased 14% across two consecutive quarters.",
        recommendation_logic_type: "rule_based",
        raw_confidence: 79,
        capped_confidence: 72,
        confidence_at_decision: 72,
        confidence_cap_reason: "Only two quarters of history are available.",
        predicted_net_impact: 42000,
        predicted_roi_probability: 68,
        evidence_sources: [
          { source_type: "internal", source_name: `${runTag}-${tier}-evidence`, ref: "client-acceptance" },
        ],
        explanation_metadata: {
          source_data: {
            dataset_name: `${tier} supplier spend`,
            dataset_id: `client-acceptance-${tier}`,
            time_range: "Q1-Q2 2026",
            rows_analyzed: 1200,
            key_metrics: ["supplier_cost"],
          },
          statistical_basis: {
            method: "EWMA baseline deviation",
            z_score: 2.4,
            data_points_used: 180,
            note: "Supplier cost moved above its historical band.",
          },
          triggering_insight: {
            metric_name: "supplier_cost",
            description: "Supplier cost increased 14%.",
            change_value: "14%",
            change_direction: "increase",
          },
          reasoning: {
            what_happened: "Supplier cost increased.",
            why_it_matters: "Margins are exposed.",
            why_this_recommendation: "Renegotiation targets the concentrated spend.",
          },
          expected_impact: {
            range: "€30,000 – €55,000 annualized",
            basis: "Contract benchmark spread.",
          },
          assumptions: ["Benchmark pricing remains available."],
          limitations: ["Only two quarters of history are available."],
          confidence_explanation: {
            score: 72,
            meaning: "Moderate-to-high decision-time confidence.",
            capped: true,
            cap_reason: "Limited history.",
          },
        },
      })
      .select("id")
      .single();
    if (decisionError || !decision?.id) throw new Error(`Create ${tier} decision: ${decisionError?.message || "no id"}`);

    state.customers[tier].decision_id = decision.id;
    persist();
  }

  persist();
  console.log(`Seeded disposable paid client-acceptance customers for ${tiers.join(", ")}.`);
} catch (error) {
  persist();
  await cleanupPartial();
  throw error;
}
