import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { requireFeatureAccess } from "../_shared/feature-access.ts";

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

function toMonthlyBuckets(metrics: { date: string; value: number }[]) {
  const buckets = new Map<string, number[]>();
  for (const m of metrics) {
    const d = new Date(m.date);
    if (Number.isNaN(d.getTime()) || !Number.isFinite(m.value)) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(m.value);
  }
  const monthly: { date: string; value: number }[] = [];
  for (const [key, vals] of [...buckets.entries()].sort()) {
    monthly.push({ date: `${key}-01`, value: vals.reduce((s, v) => s + v, 0) / vals.length });
  }
  return monthly;
}

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
  const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceKey || !anonKey) return respond({ error: "Forecast service unavailable" }, 503);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !user?.id) return respond({ error: "Unauthorized" }, 401);
    const userId = user.id;

    const body = await req.json().catch(() => ({})) as {
      organization_id?: string;
      dataset_id?: string;
      metric_type?: string;
      horizon_months?: number;
      dry_run?: boolean;
    };
    const organizationId = body.organization_id;
    const datasetId = body.dataset_id;
    const metricType = typeof body.metric_type === "string" ? body.metric_type.trim() : "";
    const horizonMonths = Number(body.horizon_months ?? 6);

    if (!organizationId || !metricType) return respond({ error: "organization_id and metric_type required" }, 400);
    if (!datasetId) return respond({ error: "dataset_id required by Active Data Contract" }, 400);
    if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > 60) {
      return respond({ error: "horizon_months must be an integer between 1 and 60" }, 400);
    }

    const rl = applyRateLimit(req, organizationId, "intelligence", "predictive-forecast");
    if (rl) return rl;

    const { data: isMember, error: memberError } = await serviceClient.rpc("is_org_member", {
      _user_id: userId,
      _org_id: organizationId,
    });
    if (memberError) throw new Error(`Membership verification failed: ${memberError.message}`);
    if (!isMember) return respond({ error: "Forbidden" }, 403);

    const fcAccess = await requireFeatureAccess(supabaseUrl, serviceKey, authHeader, "forecasting");
    if (fcAccess.ok === false) return respond(fcAccess.body, fcAccess.status);

    const { data: dsCheck, error: dsError } = await serviceClient
      .from("datasets")
      .select("id")
      .eq("id", datasetId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (dsError) throw new Error(`Dataset scope verification failed: ${dsError.message}`);
    if (!dsCheck) return respond({ error: "dataset_id does not belong to this organization" }, 403);

    if (body.dry_run) {
      return respond({
        dry_run: true,
        status: "PASS",
        dataset_id: datasetId,
        organization_id: organizationId,
        metric_type: metricType,
        horizon_months: horizonMonths,
      });
    }

    const { data: metrics, error: metricsError } = await serviceClient
      .from("metrics")
      .select("value,date")
      .eq("organization_id", organizationId)
      .eq("dataset_id", datasetId)
      .eq("metric_type", metricType)
      .order("date", { ascending: true });
    if (metricsError) throw new Error(`Historical metric read failed: ${metricsError.message}`);
    if (!metrics || metrics.length < 3) {
      return respond({
        error: "Insufficient data",
        detail: `Need at least 3 data points for ${metricType}, found ${metrics?.length || 0}`,
      }, 400);
    }

    const monthly = toMonthlyBuckets(metrics as { date: string; value: number }[]);
    if (monthly.length < 3) {
      return respond({
        error: "Insufficient monthly data",
        detail: `Need at least 3 usable monthly buckets for ${metricType}, found ${monthly.length}`,
      }, 400);
    }

    const values = monthly.map((m) => m.value);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const sd = stdDev(values);
    const seasonality = detectSeasonality(values);
    const { level, trend } = holtSmoothing(values);

    const fitted: number[] = [];
    {
      let levelFit = values[0];
      let trendFit = values.length > 1 ? values[1] - values[0] : 0;
      for (let i = 0; i < values.length; i++) {
        fitted.push(levelFit + trendFit);
        const previousLevel = levelFit;
        levelFit = 0.3 * values[i] + 0.7 * (previousLevel + trendFit);
        trendFit = 0.1 * (levelFit - previousLevel) + 0.9 * trendFit;
      }
    }
    const residuals = values.map((v, i) => v - fitted[i]);
    const residualStd = stdDev(residuals) || sd * 0.5;

    const lastDate = new Date(monthly[monthly.length - 1].date);
    const predictions: { date: string; value: number; lower_bound: number; upper_bound: number }[] = [];
    for (let h = 1; h <= horizonMonths; h++) {
      const forecastDate = new Date(lastDate);
      forecastDate.setMonth(forecastDate.getMonth() + h);
      const pointForecast = level + trend * h;
      const intervalWidth = 1.28 * residualStd * Math.sqrt(h);
      predictions.push({
        date: forecastDate.toISOString().slice(0, 10),
        value: Math.round(pointForecast * 100) / 100,
        lower_bound: Math.round(Math.max(0, pointForecast - intervalWidth) * 100) / 100,
        upper_bound: Math.round((pointForecast + intervalWidth) * 100) / 100,
      });
    }

    const { slope } = linearRegression(monthly.map((m, i) => ({ x: i, y: m.value })));
    const growthRatePct = mean !== 0 ? (slope / Math.abs(mean)) * 100 * 12 : 0;
    const trendDirection = Math.abs(growthRatePct) < 5 ? "stable" : growthRatePct > 0 ? "growing" : "declining";
    const absErrors = values.map((v, i) => (v !== 0 ? Math.abs((v - fitted[i]) / v) : 0));
    const mape = (absErrors.reduce((s, e) => s + e, 0) / absErrors.length) * 100;

    let confidenceNarrative = `Forecast based on ${monthly.length} monthly observations with ${residualStd.toFixed(2)} residual standard deviation.`;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (lovableApiKey) {
      try {
        const statsSummary = `Metric: ${metricType}, ${monthly.length} monthly data points, mean=${mean.toFixed(2)}, stddev=${sd.toFixed(2)}, trend=${trendDirection} (${growthRatePct.toFixed(1)}% annualized), seasonality=${seasonality.detected ? `yes (period ${seasonality.period})` : "no"}, MAPE=${mape.toFixed(1)}%, residual std=${residualStd.toFixed(2)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [{
                role: "user",
                content: `You are a quantitative analyst. Given these forecast statistics, write ONE concise sentence about forecast reliability and key risk. Stats: ${statsSummary}`,
              }],
            }),
          });
          if (aiRes.ok) {
            const aiData = await aiRes.json() as { choices?: Array<{ message?: { content?: string } }> };
            const content = aiData.choices?.[0]?.message?.content;
            if (content) confidenceNarrative = content.trim();
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch {
        // Narrative enrichment is optional and must not corrupt the forecast path.
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

    const { data: forecastRow, error: forecastWriteError } = await serviceClient
      .from("forecast_results")
      .insert({
        organization_id: organizationId,
        dataset_id: datasetId,
        metric_type: metricType,
        forecast_horizon_months: horizonMonths,
        model_used: "holt-exponential-smoothing",
        predictions: forecast.predictions,
        seasonality_detected: forecast.seasonality_detected,
        trend_direction: forecast.trend_direction,
        mape: forecast.mape_estimate,
        created_by: userId,
      })
      .select("id")
      .single();
    if (forecastWriteError || !forecastRow?.id) {
      throw new Error(`Forecast persistence failed: ${forecastWriteError?.message ?? "no forecast id returned"}`);
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
      organization_id: organizationId,
      actor_id: userId,
      actor_type: "user",
      action_type: "forecast_generated",
      resource_type: "forecast",
      resource_id: forecastRow.id,
      payload: {
        dataset_id: datasetId,
        metric_type: metricType,
        horizon_months: horizonMonths,
        data_points: monthly.length,
        mape: forecast.mape_estimate,
        trend: trendDirection,
      },
    });
    if (auditError) throw new Error(`Forecast audit persistence failed: ${auditError.message}`);

    return respond({
      ...forecast,
      historical: monthly,
      metric_type: metricType,
      horizon_months: horizonMonths,
      forecast_id: forecastRow.id,
      persisted: true,
      audited: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("predictive-forecast error:", message);
    return respond({ error: message }, 500);
  }
});
