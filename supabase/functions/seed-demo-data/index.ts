import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing auth");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) throw new Error("Unauthorized");

    // Get org
    const { data: profile } = await userClient.from("profiles").select("organization_id").eq("user_id", user.id).maybeSingle();
    if (!profile?.organization_id) throw new Error("No organization");
    const orgId = profile.organization_id;

    // Admin client for inserting into restricted tables
    const admin = createClient(supabaseUrl, serviceKey);

    // ─── Guard: demo seeding is only allowed on demo-owned organizations ───
    // Prevents silent corruption of real customer workspaces (rename, industry,
    // revenue/size-band overwrite). Real users who want a sandbox should create
    // a separate demo workspace via the /demo flow.
    const { data: org, error: orgFetchErr } = await admin
      .from("organizations")
      .select("created_by")
      .eq("id", orgId)
      .maybeSingle();
    if (orgFetchErr || !org?.created_by) {
      return new Response(
        JSON.stringify({ error: "Organization not found." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: ownerData, error: ownerErr } = await admin.auth.admin.getUserById(org.created_by);
    const ownerIsDemo = Boolean(ownerData?.user?.user_metadata?.is_demo);
    if (ownerErr || !ownerIsDemo) {
      return new Response(
        JSON.stringify({
          error: "Demo seeding is only allowed for demo organizations.",
          hint: "Create a sandbox via the Try Demo flow to explore sample data without altering your real workspace.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Demo-only: refresh org metadata (safe — caller is a demo user)
    await admin.from("organizations").update({
      name: "Meridian Analytics Inc.",
      industry: "SaaS / B2B Software",
      revenue_band: "$5M-$20M",
      size_band: "51-200",
      onboarding_completed: true,
    }).eq("id", orgId);

    // ─── 1. Metrics (15 months of data) ───
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
          organization_id: orgId,
          metric_type: mt,
          date: dateStr,
          value: Math.round(base[mt] * 100) / 100,
          source_type: "demo_seed",
          quality_score: 85 + Math.round(Math.random() * 15),
        });
      }
    }
    await admin.from("metrics").delete().eq("organization_id", orgId).eq("source_type", "demo_seed");
    await admin.from("metrics").insert(metricRows);

    // ─── 2. Executive Risk Index (4 roles) ───
    await admin.from("executive_risk_index").delete().eq("organization_id", orgId);
    const roleRisks = [
      { role_type: "ceo", score: 62, components: { deviation: 18, trend: 22, volatility: 12, forecast: 10 }, escalation_required: false },
      { role_type: "cfo", score: 78, components: { deviation: 25, trend: 18, volatility: 20, forecast: 15 }, escalation_required: true, escalation_reason: "Cash burn rate accelerating beyond Q3 projections" },
      { role_type: "cmo", score: 45, components: { deviation: 12, trend: 8, volatility: 15, forecast: 10 }, escalation_required: false },
      { role_type: "coo", score: 54, components: { deviation: 14, trend: 15, volatility: 10, forecast: 15 }, escalation_required: false },
    ];
    await admin.from("executive_risk_index").insert(
      roleRisks.map(r => ({ organization_id: orgId, ...r }))
    );

    // ─── 3. Convergence Index ───
    await admin.from("executive_convergence_index").delete().eq("organization_id", orgId);
    await admin.from("executive_convergence_index").insert({
      organization_id: orgId,
      score: 64,
      alignment_status: "partial_alignment",
      dispersion: 18.3,
      conflict_penalty: 8,
      volatility_divergence: 12.5,
    });

    // ─── 4. Executive Conflicts ───
    await admin.from("executive_conflicts").delete().eq("organization_id", orgId);
    await admin.from("executive_conflicts").insert([
      {
        organization_id: orgId,
        role_1: "cfo",
        role_2: "cmo",
        severity: "high",
        rule_triggered: "budget_allocation_conflict",
        description: "CFO recommends 15% marketing budget reduction while CMO projects require 20% increase for Q3 pipeline targets. Revenue forecast diverges by $340K depending on resolution.",
      },
      {
        organization_id: orgId,
        role_1: "ceo",
        role_2: "coo",
        severity: "medium",
        rule_triggered: "capacity_growth_mismatch",
        description: "CEO growth targets imply 30% headcount increase but COO operational capacity models show diminishing returns beyond 15% expansion in current quarter.",
      },
    ]);

    // ─── 5. Decision Ledger ───
    await admin.from("decision_ledger").delete().eq("organization_id", orgId);
    const decisions = [
      {
        organization_id: orgId,
        recommended_action: "Expand enterprise sales team by 4 AEs focused on $100K+ ACV deals",
        decision_type: "growth",
        decision_status: "approved",
        execution_status: "in_progress",
        chosen_action: "Approved with modified timeline — hiring 3 AEs in Q2, 1 in Q3",
        capped_confidence: 68,
        raw_confidence: 82,
        confidence_cap_reason: "Limited historical data on enterprise segment conversion rates; sample size below threshold",
        predicted_net_impact: 420000,
        predicted_roi_probability: 72,
        probability_of_success: 68,
        baseline_value: 850000,
        expected_value_at_decision: 1270000,
      },
      {
        organization_id: orgId,
        recommended_action: "Implement automated onboarding reducing time-to-value from 14 days to 3 days",
        decision_type: "retention",
        decision_status: "approved",
        execution_status: "completed",
        chosen_action: "Approved — deployed self-serve onboarding with guided tutorial",
        capped_confidence: 74,
        raw_confidence: 88,
        confidence_cap_reason: "Churn attribution model has moderate variance; NPS correlation not yet validated",
        predicted_net_impact: 180000,
        predicted_roi_probability: 81,
        probability_of_success: 76,
        outcome_delta: 145000,
        actual_value: 995000,
        baseline_value: 850000,
        prediction_accuracy_score: 80,
      },
      {
        organization_id: orgId,
        recommended_action: "Reduce infrastructure costs by migrating to serverless architecture",
        decision_type: "cost_optimization",
        decision_status: "pending",
        execution_status: "not_started",
        capped_confidence: 55,
        raw_confidence: 71,
        confidence_cap_reason: "Migration complexity estimates based on comparable companies; variance exceeds 25%",
        predicted_net_impact: 95000,
        predicted_roi_probability: 63,
        probability_of_success: 58,
      },
      {
        organization_id: orgId,
        recommended_action: "Launch product-led growth motion targeting SMB segment with freemium tier",
        decision_type: "growth",
        decision_status: "rejected",
        execution_status: "not_started",
        chosen_action: "Rejected — board determined PLG motion dilutes enterprise positioning",
        capped_confidence: 42,
        raw_confidence: 65,
        confidence_cap_reason: "No internal PLG data; projections based on industry benchmarks with high variance",
        predicted_net_impact: 280000,
        predicted_roi_probability: 48,
        probability_of_success: 42,
      },
      {
        organization_id: orgId,
        recommended_action: "Negotiate multi-year contracts with top 20 customers for revenue predictability",
        decision_type: "retention",
        decision_status: "approved",
        execution_status: "completed",
        chosen_action: "Approved — offered 10% discount for 2-year commitments",
        capped_confidence: 78,
        raw_confidence: 85,
        confidence_cap_reason: "Customer willingness data from survey with 60% response rate",
        predicted_net_impact: 310000,
        predicted_roi_probability: 82,
        probability_of_success: 78,
        outcome_delta: 340000,
        actual_value: 1160000,
        baseline_value: 850000,
        prediction_accuracy_score: 91,
      },
    ];
    await admin.from("decision_ledger").insert(decisions);

    // ─── 6. Simulation Results ───
    await admin.from("simulation_results").delete().eq("organization_id", orgId);
    const sims = [
      {
        organization_id: orgId,
        metric_type: "revenue",
        expected_value: 1250000,
        median_value: 1220000,
        p10_value: 980000,
        p25_value: 1080000,
        p75_value: 1380000,
        p90_value: 1520000,
        probability_negative: 8,
        sample_size: 90,
        data_sufficiency: "sufficient",
        simulation_runs: 10000,
        forecast_horizon: 6,
        raw_confidence: 82,
        capped_confidence: 72,
        confidence_cap_reason: "Revenue growth assumptions incorporate macro uncertainty; capped per epistemic governance rules",
        volatility: 0.18,
        mean_growth_rate: 0.04,
        variance_score: 15.2,
        created_by: user.id,
      },
      {
        organization_id: orgId,
        metric_type: "churn_rate",
        expected_value: 3.8,
        median_value: 3.6,
        p10_value: 5.2,
        p25_value: 4.5,
        p75_value: 3.1,
        p90_value: 2.4,
        probability_negative: 0,
        sample_size: 90,
        data_sufficiency: "sufficient",
        simulation_runs: 10000,
        forecast_horizon: 6,
        raw_confidence: 76,
        capped_confidence: 68,
        confidence_cap_reason: "Churn model trained on 15 months of data; limited seasonal coverage",
        volatility: 0.22,
        mean_growth_rate: -0.02,
        variance_score: 18.7,
        created_by: user.id,
      },
      {
        organization_id: orgId,
        metric_type: "mrr",
        expected_value: 104000,
        median_value: 102000,
        p10_value: 82000,
        p25_value: 91000,
        p75_value: 114000,
        p90_value: 128000,
        probability_negative: 3,
        sample_size: 90,
        data_sufficiency: "sufficient",
        simulation_runs: 10000,
        forecast_horizon: 6,
        raw_confidence: 80,
        capped_confidence: 71,
        confidence_cap_reason: "MRR projection depends on enterprise deal pipeline; conversion variance is elevated",
        volatility: 0.15,
        mean_growth_rate: 0.035,
        variance_score: 12.8,
        created_by: user.id,
      },
    ];
    await admin.from("simulation_results").insert(sims);

    // ─── 7. Advisory Instances ───
    await admin.from("advisory_instances").delete().eq("organization_id", orgId);
    const advisories = [
      {
        organization_id: orgId,
        title: "CFO Risk Score Approaching Escalation Threshold",
        action: "Review cash burn projections and schedule CFO-CEO alignment meeting within 5 business days",
        advisory_type: "prescriptive",
        priority: "high",
        category: "risk_management",
        status: "open",
        rationale: "CFO risk index has increased 23 points over the past 60 days, driven by accelerating infrastructure costs and declining gross margin. If trajectory continues, escalation threshold (85) will be breached within 3 weeks.",
        impact_score: 78,
        capped_confidence: 72,
        raw_confidence: 84,
        confidence_cap_reason: "Cost trajectory extrapolation based on 4-month trend; seasonal adjustments not yet validated",
        source_evidence: JSON.stringify([
          { type: "metric_trend", metric: "cost", direction: "increasing", magnitude: "12% above forecast" },
          { type: "risk_score", role: "cfo", current: 78, threshold: 85 },
        ]),
        data_quality_index: 88,
      },
      {
        organization_id: orgId,
        title: "Churn Velocity Anomaly in Mid-Market Segment",
        action: "Deploy targeted retention campaign for mid-market accounts with usage decline >20% in past 30 days",
        advisory_type: "prescriptive",
        priority: "high",
        category: "retention",
        status: "open",
        rationale: "Mid-market segment churn velocity has increased 1.8x compared to trailing 6-month average. 14 accounts showing pre-churn behavior patterns (declining logins, reduced feature adoption, support ticket escalation).",
        impact_score: 65,
        capped_confidence: 64,
        raw_confidence: 78,
        confidence_cap_reason: "Churn prediction model accuracy is 73% on validation set; some false positives expected",
        source_evidence: JSON.stringify([
          { type: "anomaly", metric: "churn_rate", segment: "mid_market", z_score: 2.3 },
          { type: "behavioral", accounts_at_risk: 14, avg_usage_decline: "34%" },
        ]),
        data_quality_index: 82,
      },
      {
        organization_id: orgId,
        title: "Revenue-Cost Divergence Creating Margin Compression",
        action: "Conduct unit economics review and identify top 3 cost reduction levers without impacting product velocity",
        advisory_type: "diagnostic",
        priority: "medium",
        category: "strategic",
        status: "open",
        rationale: "Revenue growth is +4.2% MoM while costs are growing at +6.1% MoM. Gross margin has contracted from 38.8% to 35.2% over the past quarter. Current trajectory will push margin below 30% within 4 months.",
        impact_score: 58,
        capped_confidence: 70,
        raw_confidence: 80,
        confidence_cap_reason: "Cost categorization has some ambiguity in shared infrastructure allocation",
        source_evidence: JSON.stringify([
          { type: "trend_divergence", metric_1: "revenue", metric_2: "cost", gap_widening: true },
          { type: "margin_trend", current: "35.2%", prior_quarter: "38.8%", projected_4mo: "29.8%" },
        ]),
        data_quality_index: 90,
      },
      {
        organization_id: orgId,
        title: "NPS Decline Correlates with Feature Release Cadence",
        action: "Evaluate whether recent feature velocity is degrading user experience; consider quality sprint",
        advisory_type: "diagnostic",
        priority: "medium",
        category: "product",
        status: "open",
        rationale: "NPS dropped from 48 to 38 over 3 months. Correlation analysis shows inverse relationship with deployment frequency (r = -0.72). Customer verbatims indicate complexity and performance concerns.",
        impact_score: 45,
        capped_confidence: 58,
        raw_confidence: 72,
        confidence_cap_reason: "NPS sample size is 120 responses; correlation does not imply causation",
        source_evidence: JSON.stringify([
          { type: "correlation", metric_1: "nps", metric_2: "deployment_frequency", r_value: -0.72 },
          { type: "survey", sample_size: 120, top_complaint: "product complexity" },
        ]),
        data_quality_index: 75,
      },
    ];
    await admin.from("advisory_instances").insert(advisories);

    // ─── 7. AICIS Intelligence Items (demo signals across domains) ───
    await admin.from("aicis_intelligence_items").delete().eq("organization_id", orgId).eq("source_surface", "demo_seed");
    const intelDomains = [
      { domain: "regulatory", severity: "high", urgency: "high", title: "EU AI Act enforcement guidance updated", summary: "Article 6 high-risk classifications now require quarterly bias audits effective Q2.", geography: ["EU", "DE"], crit: 82 },
      { domain: "market", severity: "high", urgency: "normal", title: "Mid-market SaaS churn rising 14% QoQ", summary: "Benchmark cohort shows accelerated churn in 50-200 employee segment, driven by tooling consolidation.", geography: ["US"], crit: 74 },
      { domain: "competitive", severity: "critical", urgency: "high", title: "Primary competitor announces governed AI tier", summary: "Direct overlap with our positioning; pricing 22% below current tier.", geography: ["US", "EU"], crit: 88 },
      { domain: "operational", severity: "high", urgency: "high", title: "Customer success ticket backlog at SLA breach", summary: "P2 backlog grew 38% in 14 days; auto-escalation rules not firing for enterprise accounts.", geography: ["US"], crit: 79 },
      { domain: "financial", severity: "medium", urgency: "normal", title: "FX exposure on EUR receivables widening", summary: "Hedging coverage at 41%; below 60% policy floor.", geography: ["EU"], crit: 58 },
      { domain: "regulatory", severity: "medium", urgency: "normal", title: "DSGVO subprocessor disclosure window narrows", summary: "Updated guidance shortens notification window from 30 to 14 days for material subprocessor changes.", geography: ["DE", "EU"], crit: 62 },
      { domain: "market", severity: "high", urgency: "high", title: "Enterprise procurement freeze signals in Q4 RFPs", summary: "Cycle length extended 23 days median; legal review now blocking 4 of 7 active deals.", geography: ["US"], crit: 76 },
      { domain: "operational", severity: "critical", urgency: "immediate", title: "Production deployment regression in EU region", summary: "Latency p95 doubled post-deploy; rollback partial; 3 enterprise customers affected.", geography: ["EU"], crit: 91 },
      { domain: "competitive", severity: "medium", urgency: "normal", title: "Adjacent vendor acquires governance startup", summary: "Likely 6-9 month integration window; opportunity to consolidate evaluations.", geography: ["US"], crit: 55 },
      { domain: "financial", severity: "high", urgency: "high", title: "CAC payback extending past 16 months", summary: "Mid-market segment CAC payback breached 16-month threshold; LTV/CAC degrading.", geography: ["US"], crit: 77 },
      { domain: "regulatory", severity: "high", urgency: "high", title: "NIST AI RMF alignment gaps flagged in audit", summary: "GOVERN-1.1 and MAP-2.3 controls require documented evidence linkage.", geography: ["US"], crit: 80 },
      { domain: "operational", severity: "medium", urgency: "normal", title: "Internal data quality regression on KPI rollups", summary: "Aggregation job missed 2 of last 7 runs; downstream KPI freshness degraded.", geography: ["US", "EU"], crit: 60 },
    ];
    const intelRows = intelDomains.map((d, i) => ({
      organization_id: orgId,
      source_surface: "demo_seed",
      source_ref: `demo-${i + 1}`,
      content_hash: `demo-${orgId.slice(0, 8)}-${i + 1}`,
      severity: d.severity,
      urgency: d.urgency,
      domain: d.domain,
      geography: d.geography,
      entities: [],
      payload: { demo: true },
      title: d.title,
      summary: d.summary,
      global_criticality_score: d.crit,
      occurred_at: new Date(Date.now() - (i + 1) * 6 * 3600_000).toISOString(),
      ingested_at: new Date(Date.now() - (i + 1) * 6 * 3600_000).toISOString(),
    }));
    await admin.from("aicis_intelligence_items").insert(intelRows);

    // ─── 8. Chain downstream pipeline (best-effort; reports per-step result) ───
    const pipeline: Array<{ step: string; ok: boolean; status: number; error?: string }> = [];
    const chain = [
      "executive-brief-generator",
      "narrative-fusion-engine",
      "intervention-priority-engine",
      "build-operational-graph",
      "compute-graph-topology",
      "compress-graph-attention",
    ];
    for (const fn of chain) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ organization_id: orgId }),
        });
        const txt = await r.text();
        pipeline.push({ step: fn, ok: r.ok, status: r.status, error: r.ok ? undefined : txt.slice(0, 200) });
      } catch (e) {
        pipeline.push({ step: fn, ok: false, status: 0, error: String(e).slice(0, 200) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      summary: {
        metrics: metricRows.length,
        risk_indices: 4,
        convergence: 1,
        conflicts: 2,
        decisions: decisions.length,
        simulations: sims.length,
        advisories: advisories.length,
        intelligence_items: intelRows.length,
        pipeline,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

