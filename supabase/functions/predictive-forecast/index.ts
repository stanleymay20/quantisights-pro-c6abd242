import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireFeatureAccess } from "../_shared/feature-access.ts";

// ── Server-side statistical helpers ──

function linearRegression(points: { x: number; y: number }[]) {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function stdDev(values: number[]) {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/** Simple Exponential Smoothing with Trend (Holt's method) */
function holtSmoothing(values: number[], alpha = 0.3, beta = 0.1) {
  if (values.length < 2) return { level: values[0] ?? 0, trend: 0 };
  let level = values[0];
  let trend = values[1] - values[0];
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (prevLevel + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend };
}

/** Aggregate irregular data into monthly buckets */
function toMonthlyBuckets(metrics: { date: string; value: number }[]) {
  const buckets = new Map<string, number[]>();
  for (const m of metrics) {
    const d = new Date(m.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m.value);
  }
  const monthly: { date: string; value: number }[] = [];
  for (const [key, vals] of [...buckets.entries()].sort()) {
    monthly.push({
      date: `${key}-01`,
      value: vals.reduce((s, v) => s + v, 0) / vals.length,
    });
  }
  return monthly;
}

/** Detect basic seasonality via autocorrelation */
function detectSeasonality(values: number[], maxLag = 24): { detected: boolean; period: number | null } {
  if (values.length < 6) return { detected: false, period: null };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const denom = values.reduce((s, v) => s + (v - mean) ** 2, 0);
  if (denom < 1e-10) return { detected: false, period: null };

  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = 2; lag <= Math.min(maxLag, Math.floor(values.length / 2)); lag++) {
    let num = 0;
    for (let i = 0; i < values.length - lag; i++) {
      num += (values[i] - mean) * (values[i + lag] - mean);
    }
    const corr = num / denom;
    if (corr > bestCorr && corr > 0.3) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? { detected: true, period: bestLag } : { detected: false, period: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    // Auth via JWT claims (enterprise standard)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user?.id as string;

    const { organization_id, dataset_id, metric_type, horizon_months = 6, dry_run } = await req.json();
    if (!organization_id || !metric_type) {
      return new Response(JSON.stringify({ error: "organization_id and metric_type required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required by Active Data Contract" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: intelligence tier (20/min per org)
    const rl = applyRateLimit(req, organization_id, "intelligence", "predictive-forecast");
    if (rl) return rl;

    // Verify org membership
    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: userId,
      _org_id: organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tier gating: forecasting requires Growth/Enterprise
    const fcAccess = await requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "forecasting");
    if (fcAccess.ok === false) {
      return new Response(JSON.stringify(fcAccess.body), {
        status: fcAccess.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate dataset belongs to org
    const { data: dsCheck } = await serviceClient
      .from("datasets").select("id")
      .eq("id", dataset_id).eq("organization_id", organization_id).maybeSingle();
    if (!dsCheck) {
      return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, status: "PASS", dataset_id, organization_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch historical metrics — use serviceClient for consistent reads
    const { data: metrics, error: mErr } = await serviceClient
      .from("metrics").select("value, date")
      .eq("organization_id", organization_id)
      .eq("dataset_id", dataset_id)
      .eq("metric_type", metric_type)
      .order("date", { ascending: true });

    if (mErr) throw mErr;
    if (!metrics || metrics.length < 3) {
      return new Response(JSON.stringify({
        error: "Insufficient data",
        detail: `Need at least 3 data points for ${metric_type}, found ${metrics?.length || 0}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── REAL COMPUTATION (server-side) ──

    // 1. Aggregate to monthly buckets
    const monthly = toMonthlyBuckets(metrics);
    const values = monthly.map(m => m.value);

    // 2. Compute statistics
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = stdDev(values);
    const seasonality = detectSeasonality(values);

    // 3. Holt's exponential smoothing
    const { level, trend } = holtSmoothing(values);

    // 4. Compute residual std for prediction intervals
    const fitted: number[] = [];
    {
      let l = values[0], t = values.length > 1 ? values[1] - values[0] : 0;
      for (let i = 0; i < values.length; i++) {
        fitted.push(l + t);
        const prevL = l;
        l = 0.3 * values[i] + 0.7 * (prevL + t);
        t = 0.1 * (l - prevL) + 0.9 * t;
      }
    }
    const residuals = values.map((v, i) => v - fitted[i]);
    const residualStd = stdDev(residuals) || sd * 0.5;

    // 5. Generate predictions
    const lastDate = new Date(monthly[monthly.length - 1].date);
    const predictions: { date: string; value: number; lower_bound: number; upper_bound: number }[] = [];
    for (let h = 1; h <= horizon_months; h++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setMonth(forecastDate.getMonth() + h);
      const dateStr = forecastDate.toISOString().slice(0, 10);
      const pointForecast = level + trend * h;
      const intervalWidth = 1.28 * residualStd * Math.sqrt(h);
      predictions.push({
        date: dateStr,
        value: Math.round(pointForecast * 100) / 100,
        lower_bound: Math.round(Math.max(0, pointForecast - intervalWidth) * 100) / 100,
        upper_bound: Math.round((pointForecast + intervalWidth) * 100) / 100,
      });
    }

    // 6. Compute growth rate (linear regression)
    const regPoints = monthly.map((m, i) => ({ x: i, y: m.value }));
    const { slope } = linearRegression(regPoints);
    const growthRatePct = mean > 0 ? (slope / mean) * 100 * 12 : 0;

    // 7. Determine trend direction
    const trendDirection = Math.abs(growthRatePct) < 5 ? "stable"
      : growthRatePct > 0 ? "growing" : "declining";

    // 8. MAPE from fitted vs actual
    const absErrors = values.map((v, i) => (v !== 0 ? Math.abs((v - fitted[i]) / v) : 0));
    const mape = (absErrors.reduce((s, e) => s + e, 0) / absErrors.length) * 100;

    // ── Use AI only for narrative interpretation ──
    let confidenceNarrative = `Forecast based on ${monthly.length} monthly observations with ${residualStd.toFixed(2)} residual standard deviation.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const statsSummary = `Metric: ${metric_type}, ${monthly.length} monthly data points, mean=${mean.toFixed(2)}, stddev=${sd.toFixed(2)}, trend=${trendDirection} (${growthRatePct.toFixed(1)}% annualized), seasonality=${seasonality.detected ? `yes (period ${seasonality.period})` : "no"}, MAPE=${mape.toFixed(1)}%, residual std=${residualStd.toFixed(2)}`;
        
        const aiController = new AbortController();
        const aiTimeout = setTimeout(() => aiController.abort(), 15000);
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          signal: aiController.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [{
              role: "user",
              content: `You are a quantitative analyst. Given these forecast statistics, write ONE concise sentence about forecast reliability and key risk. Stats: ${statsSummary}`,
            }],
          }),
        });
        clearTimeout(aiTimeout);
        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) confidenceNarrative = content.trim();
        }
      } catch {
        // AI narrative is optional; keep default
      }
    }

    const forecast = {
      predictions,
      trend_direction: trendDirection,
      seasonality_detected: seasonality.detected,
      seasonality_period: seasonality.period,
      growth_rate_pct: Math.round(growthRatePct * 10) / 10,
      confidence_narrative: confidenceNarrative,
      mape_estimate: Math.round(mape * 10) / 10,
    };

    // Store in database
    await serviceClient.from("forecast_results").insert({
      organization_id,
      dataset_id,
      metric_type,
      forecast_horizon_months: horizon_months,
      model_used: "holt-exponential-smoothing",
      predictions: forecast.predictions,
      seasonality_detected: forecast.seasonality_detected,
      trend_direction: forecast.trend_direction,
      mape: forecast.mape_estimate,
      created_by: userId,
    });

    // Audit trail
    await serviceClient.from("audit_log").insert({
      organization_id,
      actor_id: userId,
      actor_type: "user",
      action_type: "forecast_generated",
      resource_type: "forecast",
      payload: {
        dataset_id,
        metric_type,
        horizon_months,
        data_points: monthly.length,
        mape: forecast.mape_estimate,
        trend: trendDirection,
      },
    });

    return new Response(JSON.stringify({
      ...forecast,
      historical: monthly,
      metric_type,
      horizon_months,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("predictive-forecast error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
