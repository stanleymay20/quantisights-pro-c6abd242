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
// AWS SES's documented mailbox simulator accepts mail without delivering it to
// a person. Unlike provider-specific Resend test recipients, its domain also
// passes Supabase hosted Auth's public recovery-address validation.
const RECOVERY_TEST_EMAIL = "success@simulator.amazonses.com";

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

async function cleanupStaleRecoveryFixture() {
  const perPage = 100;
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Inspect stale recovery fixture: ${error.message}`);

    const users = data?.users ?? [];
    const stale = users.find((user) => user.email?.toLowerCase() === RECOVERY_TEST_EMAIL);
    if (stale) {
      if (stale.user_metadata?.is_client_acceptance !== true) {
        throw new Error(`Refusing to replace non-acceptance user at ${RECOVERY_TEST_EMAIL}`);
      }
      const { error: deleteError } = await sb.auth.admin.deleteUser(stale.id);
      if (deleteError) throw new Error(`Remove stale recovery fixture: ${deleteError.message}`);
      return;
    }

    if (users.length < perPage) return;
  }

  throw new Error("Unable to prove the recovery test address is free after scanning staging Auth users");
}

async function resolveSignupOrganization(userId) {
  // auth.admin.createUser exercises the same database trigger as a real signup.
  // The trigger creates the user's canonical organization, profile and owner
  // membership synchronously. Reuse that organization instead of manufacturing
  // a second tenant that the application would not select as the profile org.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: profile, error } = await sb
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Resolve signup profile: ${error.message}`);
    if (profile?.organization_id) return profile.organization_id;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Signup trigger did not create a canonical organization for the client-acceptance user");
}

try {
  // This address is intentionally stable because AWS documents the exact
  // mailbox as its successful-delivery simulator. Client Acceptance is
  // serialized, and this cleanup makes a cancelled prior run recoverable
  // without ever deleting a real staging user.
  await cleanupStaleRecoveryFixture();

  for (const tier of tiers) {
    const password = randomBytes(18).toString("base64url") + "!Aa7";
    const email = tier === "starter"
      ? RECOVERY_TEST_EMAIL
      : `${runTag}-${tier}@quantivis.test`;
    const { data: userData, error: userError } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_client_acceptance: true, acceptance_tier: tier, run_tag: runTag },
    });
    if (userError || !userData?.user?.id) throw new Error(`Create ${tier} user: ${userError?.message || "no id"}`);
    const userId = userData.user.id;

    state.customers[tier] = { tier, user_id: userId, email, password };
    persist();

    const orgId = await resolveSignupOrganization(userId);
    state.customers[tier].org_id = orgId;
    persist();

    // Client-acceptance tier fixtures represent established paying customers,
    // not first-login prospects. Keep onboarding out of paid-session/auth tests
    // so those journeys exercise the application state they claim to certify.
    const { error: orgError } = await sb
      .from("organizations")
      .update({
        name: `Client Acceptance ${tier} ${runTag}`,
        industry: "client-acceptance",
        onboarding_completed: true,
      })
      .eq("id", orgId);
    if (orgError) throw new Error(`Prepare ${tier} org: ${orgError.message}`);

    const { data: membership, error: membershipError } = await sb
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (membershipError || !membership) {
      throw new Error(`Verify ${tier} signup membership: ${membershipError?.message || "missing membership"}`);
    }

    // These fixtures model paying customers, not evaluation pilots. Using a
    // pilot_* subscription id would make useSubscription() set isPilot=true and
    // would silently test the wrong pricing/upgrade experience.
    const { error: subscriptionError } = await sb.from("subscriptions").insert({
      organization_id: orgId,
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
        organization_id: orgId,
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
  console.log(`Seeded disposable paid client-acceptance customers for ${tiers.join(", ")} using their canonical signup organizations.`);
} catch (error) {
  persist();
  await cleanupPartial();
  throw error;
}
