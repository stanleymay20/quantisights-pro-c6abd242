import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  // Rate limit: 15 demo sessions per IP per hour (generous for demos/testing)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { allowed, retryAfterMs } = checkRateLimit(`demo:${clientIp}`, 15, 3600_000);
  if (!allowed) return rateLimitResponse(retryAfterMs, req);

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

    // Poll for profile creation (trigger-based) with timeout
    let orgId: string | null = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const { data: profile } = await admin
        .from("profiles")
        .select("organization_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile?.organization_id) {
        orgId = profile.organization_id;
        break;
      }
    }
    if (!orgId) throw new Error("Profile not created after 5s — trigger may have failed");

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
    const { error: metricsErr } = await admin.from("metrics").insert(metricRows);
    if (metricsErr) throw new Error("Failed to seed demo metrics: " + metricsErr.message);

    // Dashboard first paint depends on precomputed summaries. Without this,
    // demo data exists but the dashboard still reads hasData=false and shows
    // the empty-state CTA again.
    const { error: summaryErr } = await admin.rpc("refresh_metric_summaries", {
      _org_id: orgId,
      _dataset_id: datasetId,
    });
    if (summaryErr) throw new Error("Failed to prepare demo metric summaries: " + summaryErr.message);

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
    const { error: dlErr } = await admin.from("decision_ledger").insert([
      {
        organization_id: orgId, recommended_action: "Expand enterprise sales team by 4 AEs focused on $100K+ ACV deals",
        decision_type: "growth", decision_status: "approved", execution_status: "in_progress",
        chosen_action: "Approved with modified timeline — hiring 3 AEs in Q2, 1 in Q3",
        capped_confidence: 68, raw_confidence: 82, predicted_net_impact: 420000,
        confidence_cap_reason: "Limited historical data on enterprise segment conversion rates",
      },
      {
        organization_id: orgId, recommended_action: "Implement automated onboarding reducing time-to-value from 14 days to 3 days",
        decision_type: "retention", decision_status: "approved", execution_status: "completed",
        chosen_action: "Deployed self-serve onboarding with guided tutorial",
        capped_confidence: 74, raw_confidence: 88, predicted_net_impact: 180000,
        outcome_delta: 145000, actual_value: 995000, baseline_value: 850000, prediction_accuracy_score: 80,
        confidence_cap_reason: "Churn attribution model has moderate variance",
      },
      {
        organization_id: orgId, recommended_action: "Reduce infrastructure costs by migrating to serverless architecture",
        decision_type: "cost_optimization", decision_status: "pending", execution_status: "not_started",
        capped_confidence: 55, raw_confidence: 71, predicted_net_impact: 95000,
        confidence_cap_reason: "Migration complexity estimates based on comparable companies",
      },
    ]);
    if (dlErr) console.error("Decision ledger seed error:", dlErr.message);

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

    // ─── Phase 5E.5: Additional intelligence signals (16–24 total) ───
    // Increases semantic density naturally so topology activation happens
    // WITHOUT lowering governance thresholds or fabricating relationships.
    await admin.from("insights").insert([
      {
        organization_id: orgId, severity: "high", dataset_id: datasetId,
        message: "Enterprise pipeline coverage dropped to 2.6x — below the 3.5x healthy threshold. Three enterprise opportunities ($340K combined ACV) slipped from Q2 to Q3 due to procurement delays. Sales cycle elongated from 87 to 112 days.",
        category: "sales", confidence_score: 76, raw_confidence: 84, capped_confidence: 76,
        data_quality_index: 85, sample_size: 14,
        confidence_cap_reason: "Limited enterprise deal sample over the last quarter",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "Engineering velocity declined 18% over the last 6 sprints. Cycle time from PR open to merge increased from 1.4 to 2.1 days. The single largest contributor is review latency on the platform team (4 PRs blocked >5 days).",
        category: "operations", confidence_score: 72, raw_confidence: 81, capped_confidence: 72,
        data_quality_index: 78, sample_size: 6,
        confidence_cap_reason: "Velocity attribution moderately confounded by holiday window",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "Two contract renewals (combined $96K ARR) approach their auto-renew window in 21 days with NPS scores below 30. Without a structured save-motion, base-case loss probability is 55%.",
        category: "retention", confidence_score: 68, raw_confidence: 76, capped_confidence: 68,
        data_quality_index: 82, sample_size: 2,
        confidence_cap_reason: "Small n; loss probability uses peer-benchmarked priors",
      },
      {
        organization_id: orgId, severity: "info", dataset_id: datasetId,
        message: "Self-serve trial activation rate improved 14% after onboarding redesign (37% → 42%). Time-to-first-value dropped from 14 days to 9 days for SMB cohort. Mid-market cohort still lags at 17 days.",
        category: "activation", confidence_score: 80, raw_confidence: 87, capped_confidence: 80,
        data_quality_index: 88, sample_size: 24,
        confidence_cap_reason: "Cohort split limits per-segment precision",
      },
      {
        organization_id: orgId, severity: "high", dataset_id: datasetId,
        message: "Compliance attention required: 4 of 12 sub-processors are missing renewed DPAs as of last review. DSGVO Art. 28 exposure if not refreshed before next quarterly procurement review.",
        category: "governance", confidence_score: 88, raw_confidence: 95, capped_confidence: 85,
        data_quality_index: 92, sample_size: 12,
        confidence_cap_reason: "Directly observed; capped per governance policy",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "Support deflection rate from the help center dropped from 38% to 29% over 8 weeks. Three high-traffic articles fall outside their freshness window; the team has not opened maintenance tickets.",
        category: "support", confidence_score: 70, raw_confidence: 78, capped_confidence: 70,
        data_quality_index: 80, sample_size: 8,
        confidence_cap_reason: "Deflection attribution is partly inferential",
      },
      {
        organization_id: orgId, severity: "info", dataset_id: datasetId,
        message: "Outbound campaign A/B test concluded: variant B (value-led messaging) outperformed variant A (feature-led) by 31% in reply rate at p<0.05 over 1,420 sends.",
        category: "marketing", confidence_score: 83, raw_confidence: 90, capped_confidence: 83,
        data_quality_index: 89, sample_size: 1420,
        confidence_cap_reason: "Large n, controlled experiment",
      },
      {
        organization_id: orgId, severity: "medium", dataset_id: datasetId,
        message: "Hiring funnel conversion from screen → offer dropped from 7% to 4% over the last two quarters. Time-to-fill on senior engineering roles is now 71 days vs. 49 day target. Two roles open >120 days.",
        category: "people", confidence_score: 74, raw_confidence: 82, capped_confidence: 74,
        data_quality_index: 81, sample_size: 38,
        confidence_cap_reason: "Funnel attribution sensitive to role-mix shifts",
      },
    ]);

    await admin.from("advisory_instances").insert([
      {
        organization_id: orgId, title: "Sub-processor DPA Refresh — DSGVO Art. 28 Window Closing",
        action: "Initiate DPA renewal with the four flagged sub-processors before the next quarterly review",
        advisory_type: "prescriptive", priority: "high", category: "compliance", status: "open",
        rationale: "Four sub-processors lack renewed DPAs. Under DSGVO Art. 28 controllers must maintain current processor agreements. Procurement reviews on a quarterly cadence and the next window closes in 38 days.",
        expected_impact: "Closes a high-visibility procurement audit finding before it surfaces in DE enterprise reviews.",
        impact_score: 70, capped_confidence: 75, raw_confidence: 84, data_quality_index: 90,
        confidence_cap_reason: "Directly observed registry state; governance cap applied.",
        dataset_id: datasetId,
        source_evidence: [
          { type: "registry", description: "subprocessor_registry rows missing renewal", weight: 0.6 },
          { type: "policy", description: "DSGVO Art. 28 quarterly cadence", weight: 0.4 },
        ],
        playbook_steps: [
          { step: 1, action: "Pull current sub-processor registry snapshot", owner: "DPO" },
          { step: 2, action: "Draft renewal request emails to the four vendors", owner: "DPO" },
          { step: 3, action: "Log renewal status in registry as evidence", owner: "DPO" },
        ],
      },
      {
        organization_id: orgId, title: "Engineering Throughput — Review Latency Bottleneck",
        action: "Rebalance platform-team PR review load and introduce a 2-day review SLA for blocking reviews",
        advisory_type: "prescriptive", priority: "medium", category: "operations", status: "open",
        rationale: "Engineering cycle time increased 50% over six sprints. The root cause is concentrated: four blocking PRs await review for >5 days, all on the platform team. Re-distributing review load is a single-step intervention.",
        expected_impact: "Return cycle time to the 1.5-day target within two sprints.",
        impact_score: 55, capped_confidence: 62, raw_confidence: 73, data_quality_index: 78,
        confidence_cap_reason: "Velocity attribution moderately confounded.",
        dataset_id: datasetId,
        source_evidence: [
          { type: "metric_trend", description: "Cycle time 1.4d → 2.1d over 6 sprints", weight: 0.5 },
          { type: "concentration", description: "4 of 7 blocked PRs on platform team", weight: 0.5 },
        ],
        playbook_steps: [
          { step: 1, action: "Open the four blocked PRs in a single review session", owner: "Eng Manager" },
          { step: 2, action: "Publish a 2-day review SLA for blocking reviews", owner: "Eng Manager" },
          { step: 3, action: "Track cycle time weekly until 1.5-day target restored", owner: "Eng Manager" },
        ],
      },
      {
        organization_id: orgId, title: "Mid-Market Activation Gap — Replicate SMB Onboarding Playbook",
        action: "Port the SMB onboarding flow into the mid-market segment with one tailoring change per persona",
        advisory_type: "strategic", priority: "medium", category: "activation", status: "open",
        rationale: "SMB activation improved 14% after redesign. Mid-market time-to-first-value remains nearly 2x SMB. The redesign is portable and has measured uplift in the adjacent segment.",
        expected_impact: "Cut mid-market time-to-first-value from 17 to 11 days, reducing 60-day churn risk.",
        impact_score: 48, capped_confidence: 56, raw_confidence: 67, data_quality_index: 80,
        confidence_cap_reason: "Cross-segment portability is partly inferential.",
        dataset_id: datasetId,
        source_evidence: [
          { type: "experiment", description: "SMB activation +14% post-redesign", weight: 0.6 },
          { type: "benchmark", description: "Mid-market TTV nearly 2x SMB", weight: 0.4 },
        ],
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

    // ─── Portfolio Companies (demo) ───
    await admin.from("portfolio_companies").insert([
      {
        organization_id: orgId, dataset_id: datasetId, name: "NovaPay Solutions",
        sector: "Fintech", investment_amount: 4200000, ownership_pct: 22,
        current_valuation: 18500000, revenue_ltm: 3800000, ebitda_ltm: 680000,
        revenue_growth_pct: 34, ebitda_margin_pct: 17.9, cash_runway_months: 18,
        headcount: 62, risk_score: 35, risk_trend: "improving", health_status: "healthy",
        fund_name: "Growth Fund I",
      },
      {
        organization_id: orgId, dataset_id: datasetId, name: "CloudMetrics AG",
        sector: "Enterprise SaaS", investment_amount: 2800000, ownership_pct: 15,
        current_valuation: 12000000, revenue_ltm: 2200000, ebitda_ltm: 220000,
        revenue_growth_pct: 18, ebitda_margin_pct: 10.0, cash_runway_months: 14,
        headcount: 45, risk_score: 52, risk_trend: "stable", health_status: "watch",
        fund_name: "Growth Fund I",
      },
      {
        organization_id: orgId, dataset_id: datasetId, name: "DataBridge Systems",
        sector: "Data Infrastructure", investment_amount: 6500000, ownership_pct: 28,
        current_valuation: 32000000, revenue_ltm: 7100000, ebitda_ltm: 1420000,
        revenue_growth_pct: 42, ebitda_margin_pct: 20.0, cash_runway_months: 24,
        headcount: 110, risk_score: 22, risk_trend: "improving", health_status: "healthy",
        fund_name: "Growth Fund II",
      },
      {
        organization_id: orgId, dataset_id: datasetId, name: "SupplyChain.io",
        sector: "Supply Chain / Logistics", investment_amount: 3100000, ownership_pct: 18,
        current_valuation: 8500000, revenue_ltm: 1900000, ebitda_ltm: -120000,
        revenue_growth_pct: 8, ebitda_margin_pct: -6.3, cash_runway_months: 9,
        headcount: 38, risk_score: 78, risk_trend: "worsening", health_status: "at_risk",
        fund_name: "Growth Fund I",
      },
    ]);

    // ─── Activation pipeline (background; do NOT block sign-in) ───
    // Fires downstream engines so the dashboard the user lands on actually
    // has narrative clusters, pressure snapshots, graph nodes/edges, and
    // prioritised interventions — instead of empty panels.
    const activationChain = [
      "refresh-aggregates",
      "executive-brief-generator",
      "narrative-fusion-engine",
      "compute-organizational-pressure",
      "intervention-priority-engine",
      "build-operational-graph",
      "compute-graph-topology",
      "compress-graph-attention",
    ];
    const runActivation = async () => {
      for (const fn of activationChain) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(fn === "refresh-aggregates"
              ? { organization_id: orgId, dataset_id: datasetId, workspace_id: workspaceId }
              : { organization_id: orgId }),
          });
        } catch (e) {
          console.error(`[demo-activation] ${fn} failed:`, (e as Error).message);
        }
      }
    };
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(runActivation());
    } else {
      // Fallback: fire-and-forget (still returns response promptly)
      runActivation();
    }

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
