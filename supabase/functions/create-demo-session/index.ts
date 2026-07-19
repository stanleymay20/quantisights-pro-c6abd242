import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  // Rate limit: 5 demo sessions per IP per hour
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(`demo:${clientIp}`, 5, 3600_000);
  if (!allowed) return rateLimitResponse(retryAfterMs);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const demoId = crypto.randomUUID().slice(0, 8);
    const email = `demo-${demoId}@demo.quantivis.io`;
    const password = crypto.randomUUID();

    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Demo User", is_demo: true },
    });
    if (authErr) throw authErr;
    const userId = authData.user.id;

    await new Promise(r => setTimeout(r, 1500));

    const { data: profile } = await admin
      .from("profiles")
      .select("organization_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.organization_id) throw new Error("Profile not created");
    const orgId = profile.organization_id;

    // Get default workspace
    const { data: workspace } = await admin
      .from("workspaces")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1)
      .single();
    const workspaceId = workspace?.id;

    // CRITICAL: Add demo user as workspace member so WorkspaceContext can resolve
    if (workspaceId) {
      await admin.from("workspace_members").upsert(
        { workspace_id: workspaceId, user_id: userId, role: "workspace_admin" },
        { onConflict: "workspace_id,user_id" }
      );
    }

    await admin.from("organizations").update({
      name: "Acme Corp (Demo)",
      industry: "SaaS / B2B Software",
      revenue_band: "$5M-$20M",
      size_band: "51-200",
      onboarding_completed: true,
    }).eq("id", orgId);

    // ─── Create Dataset + Project (critical for data contract) ───
    const { data: dataset, error: dsErr } = await admin.from("datasets").insert({
      organization_id: orgId,
      name: "Acme Corp — 15 Month Operating Data",
      uploaded_by: userId,
      status: "active",
      row_count: 90,
      workspace_id: workspaceId,
    }).select("id").single();
    if (dsErr || !dataset) throw new Error("Failed to create dataset: " + (dsErr?.message || "unknown"));
    const datasetId = dataset.id;

    const { data: project, error: projErr } = await admin.from("projects").insert({
      organization_id: orgId,
      name: "Acme Corp Demo",
      description: "Pre-loaded demo with 15 months of B2B SaaS operational data",
      created_by: userId,
      active_dataset_id: datasetId,
      workspace_id: workspaceId,
    }).select("id").single();
    if (projErr || !project) throw new Error("Failed to create project: " + (projErr?.message || "unknown"));

    // Attach dataset to project
    await admin.from("project_datasets").insert({
      project_id: project.id,
      dataset_id: datasetId,
      added_by: userId,
    });

    // ─── Seed Metrics (15 months) ───
    const metricTypes = ["revenue", "cost", "churn_rate", "customer_count", "mrr", "nps"];
    const metricRows: any[] = [];
    const now = new Date();
    for (let m = 14; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const dateStr = d.toISOString().split("T")[0];
      const base: Record<string, number> = {
        revenue: 850000 + m * 12000 + Math.round((Math.random() - 0.4) * 40000),
        cost: 520000 + m * 5000 + Math.round((Math.random() - 0.5) * 20000),
        churn_rate: 4.2 + (Math.random() - 0.5) * 1.5,
        customer_count: 420 + m * 8 + Math.round(Math.random() * 15),
        mrr: 71000 + m * 1000 + Math.round((Math.random() - 0.4) * 5000),
        nps: 42 + Math.round((Math.random() - 0.3) * 12),
      };
      for (const mt of metricTypes) {
        metricRows.push({
          organization_id: orgId, metric_type: mt, date: dateStr,
          value: Math.round(base[mt] * 100) / 100,
          source_type: "demo_seed", quality_score: 85 + Math.round(Math.random() * 15),
          dataset_id: datasetId,
        });
      }
    }
    await admin.from("metrics").insert(metricRows);

    // ─── Executive Risk Index ───
    await admin.from("executive_risk_index").insert([
      { organization_id: orgId, role_type: "ceo", score: 62, components: { deviation: 18, trend: 22, volatility: 12, forecast: 10 }, escalation_required: false },
      { organization_id: orgId, role_type: "cfo", score: 78, components: { deviation: 25, trend: 18, volatility: 20, forecast: 15 }, escalation_required: true, escalation_reason: "Cash burn rate accelerating beyond Q3 projections" },
      { organization_id: orgId, role_type: "cmo", score: 45, components: { deviation: 12, trend: 8, volatility: 15, forecast: 10 }, escalation_required: false },
      { organization_id: orgId, role_type: "coo", score: 54, components: { deviation: 14, trend: 15, volatility: 10, forecast: 15 }, escalation_required: false },
    ]);

    // ─── Convergence Index ───
    await admin.from("executive_convergence_index").insert({
      organization_id: orgId, score: 64, alignment_status: "partial_alignment",
      dispersion: 18.3, conflict_penalty: 8, volatility_divergence: 12.5,
    });

    // ─── Conflicts ───
    await admin.from("executive_conflicts").insert([
      {
        organization_id: orgId, role_1: "cfo", role_2: "cmo", severity: "high",
        rule_triggered: "budget_allocation_conflict",
        description: "CFO recommends 15% marketing budget reduction while CMO projects require 20% increase for Q3 pipeline targets.",
      },
      {
        organization_id: orgId, role_1: "ceo", role_2: "coo", severity: "medium",
        rule_triggered: "capacity_growth_mismatch",
        description: "CEO growth targets imply 30% headcount increase but COO capacity models show diminishing returns beyond 15%.",
      },
    ]);

    // ─── Decision Ledger ───
    const demoDecisions = [
      {
        organization_id: orgId, recommended_action: "Expand enterprise sales team by 4 AEs focused on $100K+ ACV deals",
        decision_type: "growth", decision_status: "approved", execution_status: "in_progress",
        chosen_action: "Approved with modified timeline — hiring 3 AEs in Q2, 1 in Q3",
        capped_confidence: 68, raw_confidence: 82, predicted_net_impact: 420000,
        confidence_cap_reason: "Limited historical data on enterprise segment conversion rates",
        dataset_id: datasetId,
      },
      {
        organization_id: orgId, recommended_action: "Implement automated onboarding reducing time-to-value from 14 days to 3 days",
        decision_type: "retention", decision_status: "approved", execution_status: "completed",
        chosen_action: "Deployed self-serve onboarding with guided tutorial",
        capped_confidence: 74, raw_confidence: 88, predicted_net_impact: 180000,
        outcome_delta: 145000, actual_value: 995000, baseline_value: 850000, prediction_accuracy_score: 80,
        confidence_cap_reason: "Churn attribution model has moderate variance",
        dataset_id: datasetId,
      },
      {
        organization_id: orgId, recommended_action: "Reduce infrastructure costs by migrating to serverless architecture",
        decision_type: "cost_optimization", decision_status: "pending", execution_status: "not_started",
        capped_confidence: 55, raw_confidence: 71, predicted_net_impact: 95000,
        confidence_cap_reason: "Migration complexity estimates based on comparable companies",
        dataset_id: datasetId,
      },
    ];
    for (const [index, decision] of demoDecisions.entries()) {
      if (decision.decision_status === "pending") {
        const { error } = await admin.from("decision_ledger").insert(decision);
        if (error) throw error;
      } else {
        const { error } = await admin.rpc("create_predecided_decision", {
          _decision: decision,
          _idempotency_key: `create-demo-session:${orgId}:${index}`,
        });
        if (error) throw error;
      }
    }

    // ─── Advisory Instances ───
    await admin.from("advisory_instances").insert([
      {
        organization_id: orgId, title: "CFO Risk Score Approaching Escalation Threshold",
        action: "Review cash burn projections and schedule CFO-CEO alignment meeting within 48 hours",
        advisory_type: "prescriptive", priority: "high", category: "risk_management", status: "open",
        rationale: "The CFO risk index increased 23 points over 60 days, driven primarily by a 12% increase in operating expenses without corresponding revenue growth. At the current trajectory, the escalation threshold of 85/100 will be breached within 3 weeks.",
        expected_impact: "Prevent board escalation and stabilize cash runway from 11 months back to 14+ months",
        impact_score: 78, capped_confidence: 72, raw_confidence: 84, data_quality_index: 88,
        confidence_cap_reason: "Cost trajectory extrapolation based on 4-month trend with R² = 0.83",
        dataset_id: datasetId,
        source_evidence: [
          { type: "metric_trend", description: "OpEx growth rate 18% vs revenue growth 7%", weight: 0.4 },
          { type: "anomaly", description: "Cloud spend anomaly detected in last 3 billing cycles", weight: 0.3 },
          { type: "benchmark", description: "Burn multiple 2.4x vs industry median 1.6x for stage", weight: 0.3 }
        ],
        playbook_steps: [
          { step: 1, action: "Pull detailed P&L breakdown by cost center for last 90 days", owner: "CFO" },
          { step: 2, action: "Identify top 5 variable cost drivers exceeding budget by >10%", owner: "CFO" },
          { step: 3, action: "Schedule CFO-CEO alignment meeting to present cost optimization plan", owner: "CFO" },
          { step: 4, action: "Implement hiring freeze on non-revenue roles for 30 days", owner: "CEO" },
          { step: 5, action: "Run infrastructure cost audit with engineering leads", owner: "CTO" }
        ],
      },
      {
        organization_id: orgId, title: "Churn Velocity Anomaly in Mid-Market Segment",
        action: "Deploy targeted retention campaign for 14 mid-market accounts showing pre-churn behavioral patterns",
        advisory_type: "prescriptive", priority: "high", category: "retention", status: "open",
        rationale: "Mid-market churn velocity increased 1.8x vs the trailing 6-month average. 14 accounts ($42K MRR at risk) show pre-churn behavioral patterns: login frequency down 45%, API usage down 62%, support tickets up 40%.",
        expected_impact: "Retain 9-11 of 14 at-risk accounts, preserving $27K-33K MRR ($324K-$396K ARR)",
        impact_score: 65, capped_confidence: 64, raw_confidence: 78, data_quality_index: 82,
        confidence_cap_reason: "Churn prediction model accuracy is 73% on validation set; mid-market sample size n=86",
        dataset_id: datasetId,
        source_evidence: [
          { type: "behavioral", description: "Login frequency dropped 45% for flagged accounts", weight: 0.35 },
          { type: "survey", description: "NPS mid-market segment declined 14 points in 90 days", weight: 0.25 },
          { type: "usage", description: "API call volume down 62% for at-risk cohort", weight: 0.25 },
          { type: "support", description: "Avg resolution time for mid-market tickets: 4.2 days vs 1.8 day SLA", weight: 0.15 }
        ],
        playbook_steps: [
          { step: 1, action: "Segment the 14 accounts by churn probability tier (high/medium)", owner: "CS Lead" },
          { step: 2, action: "Schedule executive sponsor calls for top 5 highest-ARR accounts", owner: "VP Sales" },
          { step: 3, action: "Deploy in-app guided onboarding flow for integration setup", owner: "Product" },
          { step: 4, action: "Offer complimentary onboarding session + dedicated CSM for 60 days", owner: "CS Lead" },
          { step: 5, action: "Track weekly engagement metrics and adjust intervention intensity", owner: "CS Lead" }
        ],
      },
      {
        organization_id: orgId, title: "Revenue Growth Deceleration — Strategic Pivot Window",
        action: "Evaluate product-led growth motion to complement sales-led pipeline",
        advisory_type: "strategic", priority: "medium", category: "growth", status: "open",
        rationale: "Month-over-month revenue growth decelerated from 4.2% to 1.8% over the last quarter. Benchmarking against 127 comparable B2B SaaS companies in the $5M-$20M ARR band shows companies with hybrid PLG+Sales motions grow 2.1x faster at this stage.",
        expected_impact: "Accelerate growth rate to 3.5-4.5% MoM and reduce CAC payback to 9-11 months",
        impact_score: 58, capped_confidence: 52, raw_confidence: 68, data_quality_index: 79,
        confidence_cap_reason: "Strategic recommendations rely on industry benchmark analogy; direct A/B testing not yet possible",
        dataset_id: datasetId,
        source_evidence: [
          { type: "trend", description: "Revenue growth rate declining: 4.2% → 3.1% → 2.4% → 1.8%", weight: 0.35 },
          { type: "benchmark", description: "Peer companies with PLG motion grow 2.1x faster at $5M-$20M ARR", weight: 0.35 },
          { type: "funnel", description: "Sales pipeline coverage ratio dropped from 3.8x to 2.6x", weight: 0.3 }
        ],
      },
    ]);

    // ─── Real AI Insights (pre-generated quality) ───
    await admin.from("insights").insert([
      {
        organization_id: orgId, severity: "high", dataset_id: datasetId,
        message: "Revenue growth is decelerating: MoM growth dropped from 4.2% to 1.8% over the last quarter. At this trajectory, you'll plateau at ~$1.15M MRR within 4 months. The primary driver is pipeline coverage declining from 3.8x to 2.6x — your sales team is closing deals but the top-of-funnel isn't replenishing fast enough.",
        category: "growth", confidence_score: 78, raw_confidence: 85, capped_confidence: 78,
        data_quality_index: 88, sample_size: 15,
        confidence_cap_reason: "Growth extrapolation confidence limited by 15-month data window",
      },
      {
        organization_id: orgId, severity: "high", dataset_id: datasetId,
        message: "Cost structure anomaly: Operating expenses grew 18% while revenue grew only 7% over the same period. Engineering headcount (+18% vs planned +12%) and cloud infrastructure (+31% due to unoptimized pipelines) are the two largest contributors. Gross margin will compress from 38.8% to 33.2% by end of Q3 if uncorrected.",
        category: "cost", confidence_score: 82, raw_confidence: 90, capped_confidence: 82,
        data_quality_index: 92, sample_size: 15,
        confidence_cap_reason: "High confidence — direct measurement from financial metrics",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "Mid-market churn velocity spiked 1.8x vs trailing average. 14 accounts ($42K MRR at risk) show pre-churn behavioral patterns: login frequency down 45%, API usage down 62%, support tickets up 40%. Root cause: onboarding friction — time-to-first-value for mid-market is 21 days vs 8 days for SMB.",
        category: "retention", confidence_score: 71, raw_confidence: 80, capped_confidence: 71,
        data_quality_index: 84, sample_size: 86,
        confidence_cap_reason: "Churn model validated on n=86 mid-market accounts",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "NPS declined 14 points (52→38) in the mid-market segment over 90 days, while SMB NPS remained stable at 48. Strongest predictor: support ticket resolution time — mid-market tickets average 4.2 days vs the 1.8-day SLA. This segment generates 62% of total ARR but receives proportionally less CS coverage.",
        category: "satisfaction", confidence_score: 74, raw_confidence: 82, capped_confidence: 74,
        data_quality_index: 80, sample_size: 86,
        confidence_cap_reason: "NPS survey response rate 41% — potential non-response bias",
      },
      {
        organization_id: orgId, severity: "info", dataset_id: datasetId,
        message: "Positive signal: Customer acquisition cost (CAC) for SMB segment improved 22% over 6 months ($1,840→$1,435) driven by organic search growth (+34%) and improved trial-to-paid conversion (8.2%→11.1%). The SMB flywheel is working. Consider replicating the SMB onboarding playbook for mid-market.",
        category: "acquisition", confidence_score: 85, raw_confidence: 91, capped_confidence: 85,
        data_quality_index: 90, sample_size: 15,
        confidence_cap_reason: "Strong signal — consistent trend across 6 data points",
      },
    ]);

    // ─── Simulation Results ───
    await admin.from("simulation_results").insert([
      {
        organization_id: orgId, metric_type: "revenue", expected_value: 1250000, median_value: 1220000,
        p10_value: 980000, p25_value: 1080000, p75_value: 1380000, p90_value: 1520000,
        probability_negative: 8, sample_size: 90, data_sufficiency: "sufficient", simulation_runs: 10000,
        forecast_horizon: 6, raw_confidence: 82, capped_confidence: 72, volatility: 0.18,
        mean_growth_rate: 0.04, variance_score: 15.2, created_by: userId,
        confidence_cap_reason: "Revenue growth assumptions incorporate macro uncertainty",
      },
    ]);

    // ─── Executive Briefs ───
    await admin.from("executive_briefs").insert([
      {
        organization_id: orgId, role_type: "ceo", generated_by: "system",
        risk_score: 62,
        summary_json: {
          headline: "Growth Deceleration Requires Strategic Response Within 30 Days",
          executive_summary: "Acme Corp's revenue trajectory shows a clear deceleration pattern, with MoM growth dropping from 4.2% to 1.8% over the last quarter. While the business remains fundamentally healthy — gross margin at 38.8%, customer count growing, and SMB acquisition costs improving — the top-line growth slowdown demands attention before it becomes structural.",
          key_metrics: [
            { label: "MRR", value: "$86K", trend: "up", delta: "+1.8% MoM (decelerating)" },
            { label: "Gross Margin", value: "38.8%", trend: "down", delta: "-2.1pp vs last quarter" },
            { label: "Net Revenue Retention", value: "104%", trend: "stable", delta: "At-risk if mid-market churns" },
            { label: "CAC Payback", value: "14 months", trend: "up", delta: "Above 10-month industry median" }
          ],
          top_risks: [
            "Cash burn rate accelerating — CFO risk score at 78/100, approaching escalation threshold",
            "Mid-market churn velocity 1.8x above baseline — $504K ARR at risk",
            "Pipeline coverage ratio declining (3.8x → 2.6x) — insufficient top-of-funnel"
          ],
          recommended_actions: [
            "Schedule CFO alignment meeting this week to review cost optimization plan",
            "Approve targeted retention campaign for 14 at-risk mid-market accounts",
            "Commission PLG feasibility study to unlock new growth channel within 60 days"
          ],
        },
      },
    ]);

    // ─── Notification Preferences ───
    await admin.from("notification_preferences").insert([
      {
        organization_id: orgId, role_type: "ceo",
        email_enabled: true, email_recipients: [email],
        slack_enabled: true, alert_threshold: 50,
        escalation_threshold: 85, weekly_brief_enabled: true,
      },
      {
        organization_id: orgId, role_type: "cfo",
        email_enabled: true, email_recipients: [email],
        slack_enabled: true, alert_threshold: 40,
        escalation_threshold: 80, weekly_brief_enabled: true,
      },
    ]);

    // Sign in
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey);
    const { data: session, error: sessErr } = await userClient.auth.signInWithPassword({ email, password });
    if (sessErr) throw sessErr;

    return new Response(JSON.stringify({
      success: true,
      access_token: session.session?.access_token,
      refresh_token: session.session?.refresh_token,
      email,
      org_id: orgId,
      workspace_id: workspaceId,
      project_id: project.id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Demo session error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
