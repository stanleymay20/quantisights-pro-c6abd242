/**
 * ai-kpi-analysis — Pure statistical KPI analysis engine.
 * 
 * NO LLM DEPENDENCY. All analysis is computed from mathematical
 * foundations: trend detection, seasonality, volatility, anomalies,
 * and forecasting using the platform's own ML engine.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

// ═══════════════════════════════════════════════════════
// STATISTICAL UTILITIES
// ═══════════════════════════════════════════════════════

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;
  
  // R² calculation
  const m = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (values[i] - m) ** 2;
    ssRes += (values[i] - (intercept + slope * i)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

function coefficientOfVariation(arr: number[]): number {
  const m = mean(arr);
  return m !== 0 ? stdDev(arr) / Math.abs(m) : 0;
}

function detectAnomalies(values: number[]): number[] {
  const m = mean(values);
  const sd = stdDev(values);
  if (sd === 0) return [];
  return values.map((v, i) => Math.abs(v - m) > 2.5 * sd ? i : -1).filter(i => i >= 0);
}

function holtsSmoothing(values: number[], alpha = 0.3, beta = 0.1, horizons = 3): number[] {
  if (values.length < 2) return new Array(horizons).fill(values[0] || 0);
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const newLevel = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (newLevel - level) + (1 - beta) * trend;
    level = newLevel;
  }
  return Array.from({ length: horizons }, (_, h) => level + trend * (h + 1));
}

/** Server-side confidence cap based on data volume */
function capConfidence(rawScore: number, dataPointCount: number): number {
  let maxAllowed = 90;
  if (dataPointCount < 12) maxAllowed = 60;
  else if (dataPointCount < 30) maxAllowed = 75;
  return Math.min(rawScore, maxAllowed);
}

function determineTrend(slope: number, r2: number, cv: number): { trend: string; percentage: number } {
  const absSlope = Math.abs(slope);
  if (r2 < 0.1 || absSlope < 0.001) {
    if (cv > 0.3) return { trend: "volatile", percentage: 0 };
    return { trend: "stable", percentage: 0 };
  }
  return { trend: slope > 0 ? "up" : "down", percentage: slope };
}

function determineRisk(cv: number, trendDir: string, anomalyCount: number, targetGap: number | null): string {
  let riskScore = 0;
  if (cv > 0.3) riskScore += 2;
  else if (cv > 0.15) riskScore += 1;
  if (trendDir === "down") riskScore += 2;
  if (anomalyCount >= 2) riskScore += 1;
  if (targetGap !== null && targetGap < -10) riskScore += 2;
  
  if (riskScore >= 4) return "high";
  if (riskScore >= 2) return "medium";
  return "low";
}

function generateInsights(
  kpiName: string, values: number[], dates: string[],
  reg: { slope: number; r2: number }, cv: number,
  anomalies: number[], targetValue: number | null
): string[] {
  const insights: string[] = [];
  const latest = values[values.length - 1];
  const latestDate = dates[dates.length - 1];
  const n = values.length;
  
  // Trend insight
  if (reg.r2 > 0.3) {
    const dir = reg.slope > 0 ? "increasing" : "decreasing";
    const pctChange = values[0] !== 0 ? ((values[n - 1] - values[0]) / Math.abs(values[0]) * 100) : 0;
    insights.push(`${kpiName} shows a ${dir} trend (R²=${reg.r2.toFixed(2)}), changing ${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}% over ${n} data points.`);
  } else {
    insights.push(`${kpiName} shows no strong linear trend (R²=${reg.r2.toFixed(2)}).`);
  }
  
  // Latest value
  insights.push(`Latest value: ${latest.toFixed(2)} on ${latestDate}.`);
  
  // Volatility
  if (cv > 0.3) {
    insights.push(`High volatility detected (CV=${(cv * 100).toFixed(1)}%). Consider investigating sources of variability.`);
  }
  
  // Anomalies
  if (anomalies.length > 0) {
    const anomalyDetails = anomalies.slice(0, 3).map(i => `${dates[i]}: ${values[i].toFixed(2)}`);
    insights.push(`${anomalies.length} anomalous data point(s) detected: ${anomalyDetails.join(", ")}.`);
  }
  
  // Target comparison
  if (targetValue !== null) {
    const gap = ((latest - targetValue) / Math.abs(targetValue)) * 100;
    if (gap >= 0) {
      insights.push(`Currently ${gap.toFixed(1)}% above target (${targetValue}).`);
    } else {
      insights.push(`Currently ${Math.abs(gap).toFixed(1)}% below target (${targetValue}). Remediation needed.`);
    }
  }
  
  // Recent momentum (last 3 vs prior 3)
  if (n >= 6) {
    const recent3 = mean(values.slice(-3));
    const prior3 = mean(values.slice(-6, -3));
    const momentum = prior3 !== 0 ? ((recent3 - prior3) / Math.abs(prior3)) * 100 : 0;
    if (Math.abs(momentum) > 5) {
      const dir = momentum > 0 ? "accelerating" : "decelerating";
      insights.push(`Short-term momentum is ${dir}: recent average ${recent3.toFixed(2)} vs prior ${prior3.toFixed(2)} (${momentum > 0 ? "+" : ""}${momentum.toFixed(1)}%).`);
    }
  }
  
  return insights;
}

function generateRecommendations(
  trendDir: string, riskLevel: string, cv: number,
  anomalyCount: number, targetGap: number | null, n: number
): string[] {
  const recs: string[] = [];
  
  if (trendDir === "down" && riskLevel !== "low") {
    recs.push("Investigate root causes of the declining trend. Consider convening a cross-functional review.");
  }
  if (cv > 0.3) {
    recs.push("Reduce variability by standardizing processes or identifying external drivers of volatility.");
  }
  if (anomalyCount > 0) {
    recs.push("Review anomalous data points for data quality issues or exceptional business events.");
  }
  if (targetGap !== null && targetGap < -10) {
    recs.push("Current performance is significantly below target. Develop a corrective action plan with 30-day milestones.");
  }
  if (n < 12) {
    recs.push("Collect more data points to improve analysis reliability (minimum 12 recommended).");
  }
  if (trendDir === "up" && riskLevel === "low") {
    recs.push("Positive trajectory. Consider setting stretch targets to maintain momentum.");
  }
  if (recs.length === 0) {
    recs.push("Continue monitoring. No immediate action required based on current data.");
  }
  
  return recs;
}

// ═══════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { kpi_id, dataset_id } = await req.json();
    if (!kpi_id) {
      return new Response(JSON.stringify({ error: "kpi_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required (Active Data Contract)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = applyRateLimit(req, kpi_id, "intelligence", "ai-kpi-analysis");
    if (rl) return rl;

    // Fetch KPI
    const { data: kpi } = await serviceClient
      .from("kpis").select("*").eq("id", kpi_id).single();
    if (!kpi) {
      return new Response(JSON.stringify({ error: "KPI not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: userId, _org_id: kpi.organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify dataset ownership
    const { data: dataset } = await serviceClient.from("datasets")
      .select("id").eq("id", dataset_id).eq("organization_id", kpi.organization_id).maybeSingle();
    if (!dataset) {
      return new Response(
        JSON.stringify({ error: "Dataset not found or not owned by this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch KPI values
    const { data: values } = await serviceClient
      .from("kpi_values").select("date, value")
      .eq("kpi_id", kpi_id).eq("organization_id", kpi.organization_id)
      .order("date", { ascending: true }).limit(365);

    if (!values || values.length < 2) {
      return new Response(
        JSON.stringify({ error: "Not enough KPI data for analysis (minimum 2 data points)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch targets
    const { data: targets } = await serviceClient
      .from("kpi_targets").select("target_value, target_date")
      .eq("kpi_id", kpi_id).eq("organization_id", kpi.organization_id)
      .order("target_date", { ascending: true });

    // ═══════════ PURE STATISTICAL ANALYSIS ═══════════
    const numericValues = values.map((v: any) => Number(v.value));
    const dates = values.map((v: any) => v.date);
    const n = numericValues.length;

    // Core statistics
    const reg = linearRegression(numericValues);
    const cv = coefficientOfVariation(numericValues);
    const anomalies = detectAnomalies(numericValues);
    const { trend, percentage } = determineTrend(reg.slope, reg.r2, cv);

    // Target gap
    const latestTarget = targets?.length ? Number(targets[targets.length - 1].target_value) : null;
    const latest = numericValues[n - 1];
    const targetGap = latestTarget !== null ? ((latest - latestTarget) / Math.abs(latestTarget)) * 100 : null;

    // Risk assessment
    const riskLevel = determineRisk(cv, trend, anomalies.length, targetGap);

    // Trend percentage (total change over period)
    const trendPercentage = numericValues[0] !== 0
      ? ((numericValues[n - 1] - numericValues[0]) / Math.abs(numericValues[0])) * 100
      : 0;

    // Generate insights and recommendations
    const insights = generateInsights(kpi.name, numericValues, dates, reg, cv, anomalies, latestTarget);
    const recommendations = generateRecommendations(trend, riskLevel, cv, anomalies.length, targetGap, n);

    // Forecast
    const forecast = holtsSmoothing(numericValues, 0.3, 0.1, 3);

    // Confidence calculation
    let rawConfidence = 40;
    if (n >= 30) rawConfidence += 25;
    else if (n >= 12) rawConfidence += 15;
    if (reg.r2 > 0.5) rawConfidence += 15;
    else if (reg.r2 > 0.2) rawConfidence += 8;
    if (cv < 0.15) rawConfidence += 10;
    rawConfidence = Math.min(rawConfidence, 95);
    const confidence = capConfidence(rawConfidence, n);

    // Build summary
    const trendDesc = trend === "up" ? "upward" : trend === "down" ? "downward" : trend;
    const summary = `${kpi.name} shows a ${trendDesc} trajectory across ${n} data points. ` +
      `Latest value: ${latest.toFixed(2)} (${dates[n - 1]}). ` +
      (targetGap !== null
        ? `Currently ${targetGap >= 0 ? "above" : "below"} target by ${Math.abs(targetGap).toFixed(1)}%.`
        : `Mean: ${mean(numericValues).toFixed(2)}, StdDev: ${stdDev(numericValues).toFixed(2)}.`);

    const limitations: string[] = [];
    if (n < 12) limitations.push("Limited data points (<12) reduce analysis confidence.");
    if (anomalies.length > n * 0.1) limitations.push("High anomaly rate may indicate data quality issues.");
    if (reg.r2 < 0.2) limitations.push("Weak linear fit — trend direction is uncertain.");

    const analysis = {
      summary,
      trend,
      trend_percentage: Math.round(trendPercentage * 10) / 10,
      risk_level: riskLevel,
      insights,
      recommendations,
      confidence_score: confidence,
      data_points_analyzed: n,
      limitations,
      forecast,
      statistics: {
        mean: Math.round(mean(numericValues) * 100) / 100,
        std_dev: Math.round(stdDev(numericValues) * 100) / 100,
        cv: Math.round(cv * 1000) / 1000,
        r_squared: Math.round(reg.r2 * 1000) / 1000,
        slope: Math.round(reg.slope * 1000) / 1000,
        anomaly_count: anomalies.length,
      },
      engine: "statistical", // No LLM used
    };

    console.log(JSON.stringify({
      event: "ai_kpi_analysis",
      kpi_id, dataset_id,
      organization_id: kpi.organization_id,
      data_points: n,
      engine: "statistical",
      confidence: confidence,
    }));

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("ai-kpi-analysis error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
