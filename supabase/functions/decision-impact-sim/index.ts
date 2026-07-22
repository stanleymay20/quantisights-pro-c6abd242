import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyAdaptiveConfidenceWithFetch, computeVariance } from "../_shared/adaptive-confidence.ts";
import { enforceDatasetContract } from "../_shared/dataset-contract.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const datasetContract = await enforceDatasetContract(body, svc);
    if (datasetContract.response) return datasetContract.response;

    const organization_id = datasetContract.organization_id;
    const dataset_id = datasetContract.dataset_id;

    const decision_id = typeof body.decision_id === "string" ? body.decision_id : null;
    const revenue_delta_pct = toBoundedNumber(body.revenue_delta_pct, 0, -95, 300);
    const cost_delta_pct = toBoundedNumber(body.cost_delta_pct, 0, -95, 300);
    const churn_change_pct = toBoundedNumber(body.churn_change_pct, 0, -95, 300);
    const implementation_cost = toBoundedNumber(body.implementation_cost, 0, 0, 1_000_000_000);
    const time_to_impact_months = Math.max(1, Math.min(60, Math.round(toBoundedNumber(body.time_to_impact_months, 3, 1, 60))));
    const simulation_runs = Math.max(100, Math.min(50000, Math.round(toBoundedNumber(body.simulation_runs, 10000, 100, 50000))));

    const { data: isMember } = await svc.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch historical metrics scoped to dataset
    const metricTypes = ["revenue", "cost", "churn_rate"];
    const metricData: Record<string, number[]> = {};

    for (const mt of metricTypes) {
      const { data } = await svc
        .from("metrics")
        .select("value")
        .eq("organization_id", organization_id)
        .eq("dataset_id", dataset_id)
        .eq("metric_type", mt)
        .order("date", { ascending: true });
      metricData[mt] = (data || []).map((m) => Number(m.value));
    }

    const revenueValues = metricData.revenue;
    const costValues = metricData.cost;
    const churnValues = metricData.churn_rate;

    // ENTERPRISE INTEGRITY: Refuse to simulate without real baseline data
    const hasRevenue = revenueValues.length >= 3;
    const hasCost = costValues.length >= 3;
    const hasChurn = churnValues.length >= 3;

    if (!hasRevenue && !hasCost && !hasChurn) {
      return new Response(
        JSON.stringify({
          error: null,
          simulation_refused: true,
          reason: "Simulation unavailable: insufficient baseline metrics in dataset. At least 3 data points required for revenue, cost, or churn_rate metrics.",
          missing_metrics: {
            revenue: { available: revenueValues.length, required: 3 },
            cost: { available: costValues.length, required: 3 },
            churn_rate: { available: churnValues.length, required: 3 },
          },
          recommendation: "Upload time-series data with revenue, cost, or churn_rate metrics to enable Monte Carlo simulation.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use only metrics with sufficient data; refuse to fabricate missing baselines
    const baseRevenue = hasRevenue ? revenueValues[revenueValues.length - 1] : null;
    const baseCost = hasCost ? costValues[costValues.length - 1] : null;
    const baseChurn = hasChurn ? churnValues[churnValues.length - 1] : null;

    const sampleSize = Math.min(
      hasRevenue ? revenueValues.length : Infinity,
      hasCost ? costValues.length : Infinity,
      hasChurn ? churnValues.length : Infinity
    );

    const revenueVol = hasRevenue ? computeLogVolatility(revenueValues) : 0;
    const costVol = hasCost ? computeLogVolatility(costValues) : 0;
    const churnVol = hasChurn ? computeLogVolatility(churnValues) : 0;

    const runs = Math.min(simulation_runs, 50000);
    const steps = time_to_impact_months;
    const correlations = { revenue_cost: 0.6, revenue_churn: -0.3 };

    const netImpacts: number[] = [];

    // Use real baselines only — null means metric unavailable (not simulated)
    const effRevenue = baseRevenue ?? 0;
    const effCost = baseCost ?? 0;
    const effChurn = baseChurn ?? 0;

    for (let r = 0; r < runs; r++) {
      const z1 = randn();
      const z2 = correlations.revenue_cost * z1 + Math.sqrt(1 - correlations.revenue_cost ** 2) * randn();
      const z3 = correlations.revenue_churn * z1 + Math.sqrt(1 - correlations.revenue_churn ** 2) * randn();

      const simRevenue = hasRevenue
        ? effRevenue * Math.exp(((revenue_delta_pct / 100) / steps) * steps + (revenueVol / 100) * Math.sqrt(steps) * z1)
        : 0;
      const simCost = hasCost
        ? effCost * Math.exp(((cost_delta_pct / 100) / steps) * steps + (costVol / 100) * Math.sqrt(steps) * z2)
        : 0;

      let simChurn = effChurn;
      if (hasChurn) {
        const churnDelta = effChurn * (churn_change_pct / 100) + (churnVol / 100) * effChurn * z3;
        simChurn = Math.max(0, Math.min(100, effChurn + churnDelta));
      }

      const retentionFactor = Math.pow(1 - simChurn / 100, steps);
      const baselineProfit = (effRevenue * Math.pow(1 - effChurn / 100, steps)) - effCost;
      const simProfit = (simRevenue * retentionFactor) - simCost - implementation_cost;
      const netImpact = simProfit - baselineProfit;

      netImpacts.push(netImpact);
    }

    netImpacts.sort((a, b) => a - b);

    const percentile = (arr: number[], p: number) => {
      const idx = Math.floor(p * arr.length);
      return arr[Math.min(idx, arr.length - 1)];
    };

    const expectedNet = netImpacts.reduce((s, v) => s + v, 0) / netImpacts.length;
    const medianNet = percentile(netImpacts, 0.5);
    const p10 = percentile(netImpacts, 0.1);
    const p50 = percentile(netImpacts, 0.5);
    const p90 = percentile(netImpacts, 0.9);
    const probPositiveRoi = netImpacts.filter((v) => v > 0).length / netImpacts.length;
    const probCashStress = netImpacts.filter((v) => v < -implementation_cost * 0.5).length / netImpacts.length;
    const riskAdjustedEV = expectedNet * probPositiveRoi;

    // Confidence governance via universal helper
    const allValues = [...revenueValues, ...costValues, ...churnValues];
    const varianceScore = computeVariance(allValues.length > 1 ? allValues : [1, 1]);
    const rawConf = Math.max(30, Math.min(95, 85 - varianceScore * 0.4));

    // Learning adjustment from past simulations
    const { data: pastSims } = await svc
      .from("decision_simulations")
      .select("calibration_delta")
      .eq("organization_id", organization_id)
      .not("calibration_delta", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);

    let learningAdjustment = 0;
    if (pastSims && pastSims.length >= 5) {
      const avgCalDelta = pastSims.reduce((s, p) => s + Number(p.calibration_delta), 0) / pastSims.length;
      learningAdjustment = -avgCalDelta * 0.1;
    }

    const adjustedRawConf = Math.max(20, Math.min(95, rawConf + learningAdjustment));
    const conf = await applyAdaptiveConfidenceWithFetch(
      { rawConfidence: adjustedRawConf, sampleSize, variance: varianceScore },
      supabaseUrl, serviceKey, organization_id,
    );

    const result = {
      organization_id,
      decision_id: decision_id || null,
      revenue_delta_pct,
      cost_delta_pct,
      churn_change_pct,
      implementation_cost,
      time_to_impact_months: steps,
      expected_net_impact: round2(expectedNet),
      median_net_impact: round2(medianNet),
      p10_impact: round2(p10),
      p50_impact: round2(p50),
      p90_impact: round2(p90),
      probability_positive_roi: round2(probPositiveRoi * 100),
      probability_cashflow_stress: round2(probCashStress * 100),
      risk_adjusted_expected_value: round2(riskAdjustedEV),
      raw_confidence: conf.raw_confidence,
      capped_confidence: conf.capped_confidence,
      confidence_cap_reason: conf.confidence_cap_reason,
      variance_score: conf.variance_score,
      sample_size: sampleSize,
      data_sufficiency: conf.data_sufficiency,
      correlation_assumptions: correlations,
      model_version: 1,
      simulation_runs: runs,
      created_by: user.id,
    };


    const baselines_used = {
      revenue: baseRevenue !== null ? { value: baseRevenue, source: "dataset", data_points: revenueValues.length } : { value: null, source: "unavailable" },
      cost: baseCost !== null ? { value: baseCost, source: "dataset", data_points: costValues.length } : { value: null, source: "unavailable" },
      churn_rate: baseChurn !== null ? { value: baseChurn, source: "dataset", data_points: churnValues.length } : { value: null, source: "unavailable" },
    };


    // Extended metadata for response only (not stored in DB)
    const responseMeta = {
      confidence: conf.confidence,
      adaptive_calibration_applied: conf.adaptive_calibration_applied,
      calibration_model_version: conf.calibration_model_version,
      calibration_band_used: conf.calibration_band_used,
      calibration_correction_applied_pp: conf.calibration_correction_applied_pp,
      calibration_low_sample_band: conf.calibration_low_sample_band,
      confidence_source: conf.confidence_source,
    };

    const { data: inserted, error: insertErr } = await svc
      .from("decision_simulations")
      .insert(result)
      .select("id")
      .single();

    if (insertErr) throw insertErr;

    if (decision_id) {
      await svc
        .from("decision_ledger")
        .update({
          decision_simulation_id: inserted.id,
          predicted_roi_probability: round2(probPositiveRoi * 100),
          predicted_net_impact: round2(expectedNet),
        })
        .eq("id", decision_id);
    }

    return new Response(
      JSON.stringify({ success: true, simulation_id: inserted.id, ...result, dataset_id, baselines_used, ...responseMeta }),

      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("decision-impact-sim error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function computeLogVolatility(values: number[]): number {
  if (values.length < 2) return 20;
  const logReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0 && values[i] > 0) {
      logReturns.push(Math.log(values[i] / values[i - 1]));
    }
  }
  if (logReturns.length < 2) return 20;
  const mean = logReturns.reduce((s, v) => s + v, 0) / logReturns.length;
  const variance = logReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
