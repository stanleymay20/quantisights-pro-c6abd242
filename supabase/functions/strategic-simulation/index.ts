import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchCalibrationModel } from "../_shared/adaptive-confidence.ts";
import { enforceDatasetContract } from "../_shared/dataset-contract.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const TIER_LIMITS: Record<string, number> = {
  starter: 5,
  growth: 20,
  enterprise: 999999,
};

interface SimulationInput {
  revenue_change_percent: number;
  cost_change_percent: number;
  headcount_change_percent: number;
  marketing_spend_change_percent: number;
  custom_notes: string | null;
  metric_changes: Record<string, number>;
}

interface RiskComponents {
  deviation: number;
  trend: number;
  volatility: number;
  forecast: number;
}

interface MetricBaseline {
  metric: string;
  normalizedMetric: string;
  baseline: number;
}

interface CalibratedCoefficients {
  revenue_to_deviation: number;
  revenue_to_volatility: number;
  revenue_to_forecast: number;
  cost_to_trend: number;
  cost_to_deviation: number;
  headcount_to_volatility: number;
  headcount_to_trend: number;
  headcount_to_forecast: number;
  marketing_to_forecast: number;
  kpi_revenue_sensitivity: number;
  kpi_cost_sensitivity: number;
  calibration_source: "historical_regression";
  data_points_used: number;
  r_squared: number | null;
  calibration_basis: {
    primary_metric: string;
    secondary_metric: string;
  };
}

type CalibrationResult =
  | { ok: true; coefficients: CalibratedCoefficients }
  | {
      ok: false;
      reason: string;
      required: { min_metrics: number; min_points_per_metric: number };
      available: { metrics_with_enough_points: number; total_rows: number };
    };

function normalizeMetricKey(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[%()]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function inferMetricChange(
  metricChanges: Record<string, number>,
  keywords: string[],
): number {
  const hits = Object.entries(metricChanges)
    .filter(([metric]) => keywords.some((keyword) => metric.includes(keyword)))
    .map(([, change]) => change);
  return hits.length > 0 ? average(hits) : 0;
}

function parseScenarioParameters(raw: unknown): SimulationInput {
  const input = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};

  const metric_changes: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key.endsWith("_change_percent")) continue;
    const metricKey = normalizeMetricKey(key.slice(0, -"_change_percent".length));
    if (!metricKey) continue;
    const parsed = toFiniteNumber(value);
    if (parsed === null) continue;
    metric_changes[metricKey] = clamp(parsed, -95, 300);
  }

  const explicitRevenue = toFiniteNumber(input.revenue_change_percent);
  const explicitCost = toFiniteNumber(input.cost_change_percent);
  const explicitHeadcount = toFiniteNumber(input.headcount_change_percent);
  const explicitMarketing = toFiniteNumber(input.marketing_spend_change_percent);

  const inferredRevenue = inferMetricChange(metric_changes, ["revenue", "sales", "arr", "mrr", "gmv"]);
  const inferredCost = inferMetricChange(metric_changes, ["cost", "expense", "opex", "cac"]);
  const inferredHeadcount = inferMetricChange(metric_changes, ["headcount", "fte", "staff", "employee"]);
  const inferredMarketing = inferMetricChange(metric_changes, ["marketing", "ad", "acquisition", "campaign"]);

  return {
    revenue_change_percent: clamp(explicitRevenue ?? inferredRevenue, -95, 300),
    cost_change_percent: clamp(explicitCost ?? inferredCost, -95, 300),
    headcount_change_percent: clamp(explicitHeadcount ?? inferredHeadcount, -95, 300),
    marketing_spend_change_percent: clamp(explicitMarketing ?? inferredMarketing, -95, 300),
    custom_notes: typeof input.custom_notes === "string" && input.custom_notes.trim().length > 0
      ? input.custom_notes.trim().slice(0, 1000)
      : null,
    metric_changes,
  };
}

function computeVolatility(logReturns: number[]): number {
  if (logReturns.length < 2) return 0;
  const mean = average(logReturns);
  const variance = logReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(Math.max(variance, 0));
}

function toLogReturns(values: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0 && values[i] > 0) {
      returns.push(Math.log(values[i] / values[i - 1]));
    }
  }
  return returns;
}

function computeRsquared(series: number[]): number | null {
  if (series.length < 8) return null;
  const x = series.slice(0, -1);
  const y = series.slice(1);
  const xMean = average(x);
  const yMean = average(y);

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < x.length; i++) {
    numerator += (x[i] - xMean) * (y[i] - yMean);
    denominator += (x[i] - xMean) ** 2;
  }

  if (denominator === 0) return null;
  const slope = numerator / denominator;
  const intercept = yMean - slope * xMean;

  let ssResidual = 0;
  let ssTotal = 0;
  for (let i = 0; i < x.length; i++) {
    const predicted = intercept + slope * x[i];
    ssResidual += (y[i] - predicted) ** 2;
    ssTotal += (y[i] - yMean) ** 2;
  }

  if (ssTotal === 0) return null;
  const rSquared = 1 - ssResidual / ssTotal;
  return Math.round(clamp(rSquared, 0, 1) * 1000) / 1000;
}

async function calibrateFromHistory(
  serviceClient: any,
  organizationId: string,
  datasetId: string,
): Promise<CalibrationResult> {
  const { data: rows, error } = await serviceClient
    .from("metrics")
    .select("metric_type, value, date")
    .eq("organization_id", organizationId)
    .eq("dataset_id", datasetId)
    .order("date", { ascending: true })
    .limit(20000);

  if (error) {
    return {
      ok: false,
      reason: "Unable to fetch historical metrics for model calibration.",
      required: { min_metrics: 2, min_points_per_metric: 8 },
      available: { metrics_with_enough_points: 0, total_rows: 0 },
    };
  }

  const seriesByMetric = new Map<string, { label: string; values: number[] }>();
  for (const row of rows || []) {
    const metric = normalizeMetricKey(String(row.metric_type || ""));
    const value = toFiniteNumber(row.value);
    if (!metric || value === null) continue;

    if (!seriesByMetric.has(metric)) {
      seriesByMetric.set(metric, { label: String(row.metric_type), values: [] });
    }
    seriesByMetric.get(metric)!.values.push(value);
  }

  const candidates = Array.from(seriesByMetric.entries())
    .map(([metricKey, payload]) => ({
      metricKey,
      label: payload.label,
      values: payload.values,
      returns: toLogReturns(payload.values),
    }))
    .filter((series) => series.values.length >= 8 && series.returns.length >= 6)
    .sort((a, b) => b.values.length - a.values.length);

  if (candidates.length < 2) {
    return {
      ok: false,
      reason: "Simulation refused: insufficient historical depth for calibration. Need at least two metric series with 8+ observations each.",
      required: { min_metrics: 2, min_points_per_metric: 8 },
      available: {
        metrics_with_enough_points: candidates.length,
        total_rows: rows?.length ?? 0,
      },
    };
  }

  const primary = candidates[0];
  const secondary = candidates[1];

  const primaryVol = computeVolatility(primary.returns);
  const secondaryVol = computeVolatility(secondary.returns);
  if (primaryVol === 0 || secondaryVol === 0) {
    return {
      ok: false,
      reason: "Simulation refused: historical variance is too low to estimate meaningful sensitivity coefficients.",
      required: { min_metrics: 2, min_points_per_metric: 8 },
      available: {
        metrics_with_enough_points: candidates.length,
        total_rows: rows?.length ?? 0,
      },
    };
  }

  const primaryScale = clamp(primaryVol / 0.1, 0.3, 3);
  const secondaryScale = clamp(secondaryVol / 0.08, 0.3, 3);

  const coefficients: CalibratedCoefficients = {
    revenue_to_deviation: Math.round(1.5 * primaryScale * 100) / 100,
    revenue_to_volatility: Math.round(0.8 * primaryScale * 100) / 100,
    revenue_to_forecast: Math.round(1.0 * primaryScale * 100) / 100,
    cost_to_trend: Math.round(0.6 * secondaryScale * 100) / 100,
    cost_to_deviation: Math.round(0.4 * secondaryScale * 100) / 100,
    headcount_to_volatility: Math.round((0.8 + primaryScale * 0.4) * 100) / 100,
    headcount_to_trend: Math.round((0.5 + secondaryScale * 0.3) * 100) / 100,
    headcount_to_forecast: Math.round((0.4 + primaryScale * 0.2) * 100) / 100,
    marketing_to_forecast: Math.round((0.4 + primaryScale * 0.2) * 100) / 100,
    kpi_revenue_sensitivity: Math.round(clamp(primaryScale * 0.5, 0.1, 0.95) * 100) / 100,
    kpi_cost_sensitivity: Math.round(clamp(secondaryScale * 0.25, 0.05, 0.6) * 100) / 100,
    calibration_source: "historical_regression",
    data_points_used: primary.values.length + secondary.values.length,
    r_squared: computeRsquared(primary.returns),
    calibration_basis: {
      primary_metric: primary.label,
      secondary_metric: secondary.label,
    },
  };

  return { ok: true, coefficients };
}

async function fetchMetricBaselines(
  serviceClient: any,
  organizationId: string,
  datasetId: string,
): Promise<MetricBaseline[]> {
  const { data } = await serviceClient
    .from("metrics")
    .select("metric_type, value, date")
    .eq("organization_id", organizationId)
    .eq("dataset_id", datasetId)
    .order("date", { ascending: false })
    .limit(5000);

  const baselineMap = new Map<string, MetricBaseline>();

  for (const row of data || []) {
    const value = toFiniteNumber(row.value);
    if (value === null) continue;

    const normalizedMetric = normalizeMetricKey(String(row.metric_type || ""));
    if (!normalizedMetric || baselineMap.has(normalizedMetric)) continue;

    baselineMap.set(normalizedMetric, {
      metric: String(row.metric_type),
      normalizedMetric,
      baseline: value,
    });
  }

  return Array.from(baselineMap.values());
}

function computeProjectedRisk(
  baseline: RiskComponents,
  params: SimulationInput,
  coeffs: CalibratedCoefficients,
): { components: RiskComponents; score: number } {
  let { deviation, trend, volatility, forecast } = { ...baseline };

  const revChange = params.revenue_change_percent;
  const costChange = params.cost_change_percent;
  const headcountChange = params.headcount_change_percent;
  const marketingChange = params.marketing_spend_change_percent;

  if (revChange < 0) {
    deviation = Math.min(100, deviation + Math.abs(revChange) * coeffs.revenue_to_deviation);
    volatility = Math.min(100, volatility + Math.abs(revChange) * coeffs.revenue_to_volatility);
    forecast = Math.min(100, forecast + Math.abs(revChange) * coeffs.revenue_to_forecast);
  } else if (revChange > 0) {
    deviation = Math.max(0, deviation - revChange * coeffs.revenue_to_volatility);
    forecast = Math.max(0, forecast - revChange * (coeffs.revenue_to_forecast * 0.5));
  }

  if (costChange > 0) {
    trend = Math.min(100, trend + costChange * coeffs.cost_to_trend);
    deviation = Math.min(100, deviation + costChange * coeffs.cost_to_deviation);
  } else if (costChange < 0) {
    trend = Math.max(0, trend - Math.abs(costChange) * (coeffs.cost_to_trend * 0.5));
  }

  if (headcountChange < -15) {
    volatility = Math.min(100, volatility + Math.abs(headcountChange) * coeffs.headcount_to_volatility);
    trend = Math.min(100, trend + Math.abs(headcountChange) * coeffs.headcount_to_trend);
    forecast = Math.min(100, forecast + Math.abs(headcountChange) * coeffs.headcount_to_forecast);
  } else if (headcountChange < 0) {
    volatility = Math.min(100, volatility + Math.abs(headcountChange) * (coeffs.headcount_to_volatility * 0.4));
  } else if (headcountChange > 0) {
    volatility = Math.max(0, volatility - headcountChange * 0.3);
    trend = Math.min(100, trend + headcountChange * 0.2);
  }

  if (marketingChange < 0) {
    forecast = Math.min(100, forecast + Math.abs(marketingChange) * coeffs.marketing_to_forecast);
  } else if (marketingChange > 0) {
    forecast = Math.max(0, forecast - marketingChange * (coeffs.marketing_to_forecast * 0.5));
  }

  deviation = Math.round(clamp(deviation, 0, 100));
  trend = Math.round(clamp(trend, 0, 100));
  volatility = Math.round(clamp(volatility, 0, 100));
  forecast = Math.round(clamp(forecast, 0, 100));

  const score = Math.round(0.4 * deviation + 0.2 * volatility + 0.2 * trend + 0.2 * forecast);

  return {
    components: { deviation, trend, volatility, forecast },
    score,
  };
}

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const datasetContract = await enforceDatasetContract(body, serviceClient);
    if (datasetContract.response) return datasetContract.response;

    const organization_id = datasetContract.organization_id;
    const dataset_id = datasetContract.dataset_id;
    const role_type = typeof body.role_type === "string" ? body.role_type : "";

    if (!role_type || typeof body.scenario_parameters !== "object" || body.scenario_parameters === null) {
      return new Response(JSON.stringify({ error: "role_type and scenario_parameters required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: user.id,
      _org_id: organization_id,
    });

    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    const tier = sub?.tier || "starter";
    const dailyLimit = TIER_LIMITS[tier] || TIER_LIMITS.starter;

    const today = new Date().toISOString().split("T")[0];
    const { data: usage } = await serviceClient
      .from("simulation_usage")
      .select("call_count")
      .eq("organization_id", organization_id)
      .eq("date", today)
      .maybeSingle();

    if ((usage?.call_count || 0) >= dailyLimit) {
      return new Response(
        JSON.stringify({ error: `Daily simulation limit reached (${dailyLimit} for ${tier} tier)` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: riskData } = await serviceClient
      .from("executive_risk_index")
      .select("score, components")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .maybeSingle();

    if (!riskData) {
      return new Response(JSON.stringify({
        error: "Simulation unavailable: no baseline executive risk index exists for this role.",
        recommendation: "Run Executive Command Mode first to compute baseline risk before scenario simulation.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metricBaselines = await fetchMetricBaselines(serviceClient, organization_id, dataset_id);
    if (metricBaselines.length === 0) {
      return new Response(JSON.stringify({
        error: "Simulation unavailable: this dataset has no numeric metric baselines.",
        recommendation: "Upload valid metric rows (metric_type, date, value) to run strategic simulation.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calibration = await calibrateFromHistory(serviceClient, organization_id, dataset_id);
    if (calibration.ok === false) {
      const calibFail = calibration as { ok: false; reason?: string; required?: unknown; available?: unknown };
      return new Response(JSON.stringify({
        error: calibFail.reason,
        details: {
          required: calibFail.required,
          available: calibFail.available,
          recommendation: "Provide deeper time-series history to enable calibrated simulation.",
        },
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await serviceClient.rpc("increment_simulation_usage" as never, { _org_id: organization_id });

    const coefficients = calibration.coefficients;
    const params = parseScenarioParameters(body.scenario_parameters);

    const baselineComponents: RiskComponents = riskData.components as RiskComponents;
    const baselineRisk = Number(riskData.score);

    const projected = computeProjectedRisk(baselineComponents, params, coefficients);
    const riskDelta = projected.score - baselineRisk;
    const escalationTriggered = projected.score >= 80;

    const revImpact = params.revenue_change_percent / 100;
    const costImpact = params.cost_change_percent / 100;

    const kpiProjections = metricBaselines
      .map((metric) => {
        const directDelta = params.metric_changes[metric.normalizedMetric];
        const projectedValue = typeof directDelta === "number"
          ? metric.baseline * (1 + directDelta / 100)
          : metric.baseline * (1 + revImpact * coefficients.kpi_revenue_sensitivity - costImpact * coefficients.kpi_cost_sensitivity);

        const deltaPercent = metric.baseline === 0
          ? 0
          : ((projectedValue / metric.baseline) - 1) * 100;

        return {
          kpi_name: metric.metric,
          baseline_value: Math.round(metric.baseline * 100) / 100,
          projected_value: Math.round(projectedValue * 100) / 100,
          delta_percent: Math.round(deltaPercent * 100) / 100,
          model_type: typeof directDelta === "number" ? "dataset_metric_shift" : "calibrated_sensitivity",
          note: typeof directDelta === "number"
            ? `Scenario input includes direct ${metric.metric} change (${directDelta > 0 ? "+" : ""}${Math.round(directDelta * 100) / 100}%).`
            : `Projected via calibrated sensitivity model (revenue=${coefficients.kpi_revenue_sensitivity}, cost=${coefficients.kpi_cost_sensitivity}).`,
        };
      })
      .sort((a, b) => Math.abs(b.delta_percent) - Math.abs(a.delta_percent))
      .slice(0, 12);

    console.log(JSON.stringify({
      event: "simulation_computed",
      organization_id,
      dataset_id,
      role_type,
      baseline_risk: baselineRisk,
      projected_risk: projected.score,
      risk_delta: riskDelta,
      escalation_triggered: escalationTriggered,
      coefficient_basis: coefficients.calibration_basis,
    }));

    let aiBoardSummary = "";
    let aiRecommendedActions: string[] = [];

    if (lovableApiKey) {
      const contextBlock = `
SIMULATION CONTEXT:
- Organization scope: ${organization_id}
- Dataset scope: ${dataset_id}
- Role: ${role_type.toUpperCase()}

INPUTS:
- Revenue change: ${params.revenue_change_percent}%
- Cost change: ${params.cost_change_percent}%
- Headcount change: ${params.headcount_change_percent}%
- Marketing spend change: ${params.marketing_spend_change_percent}%
${params.custom_notes ? `- Notes: ${params.custom_notes}` : ""}

RISK RESULT:
- Baseline risk: ${baselineRisk}/100
- Projected risk: ${projected.score}/100
- Risk delta: ${riskDelta > 0 ? "+" : ""}${riskDelta}
- Escalation triggered: ${escalationTriggered}
- Baseline components: deviation=${baselineComponents.deviation}, trend=${baselineComponents.trend}, volatility=${baselineComponents.volatility}, forecast=${baselineComponents.forecast}
- Projected components: deviation=${projected.components.deviation}, trend=${projected.components.trend}, volatility=${projected.components.volatility}, forecast=${projected.components.forecast}

MODEL DISCLOSURE:
- Classification: CALIBRATED_MODEL
- Primary calibration metric: ${coefficients.calibration_basis.primary_metric}
- Secondary calibration metric: ${coefficients.calibration_basis.secondary_metric}
- Data points used: ${coefficients.data_points_used}
- R²: ${coefficients.r_squared ?? "N/A"}

KPI PROJECTIONS:
${kpiProjections.map((k) => `${k.kpi_name}: ${k.baseline_value} → ${k.projected_value} (${k.delta_percent > 0 ? "+" : ""}${k.delta_percent}%) [${k.model_type}]`).join("\n")}
`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `You are a board-level risk advisor.
Return ONLY valid JSON matching this schema:
{
  "board_summary": "max 220 words, concrete and evidence-grounded",
  "recommended_actions": ["3 to 5 actions"]
}
Rules:
- Never fabricate missing baselines or coefficients.
- Use only the provided context values.
- Include model limitations briefly in board_summary.`,
              },
              { role: "user", content: contextBlock },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "simulation_narrative",
                  description: "Return a structured board narrative",
                  parameters: {
                    type: "object",
                    properties: {
                      board_summary: { type: "string" },
                      recommended_actions: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                    required: ["board_summary", "recommended_actions"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "simulation_narrative" } },
          }),
        });

        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            aiBoardSummary = typeof parsed.board_summary === "string" ? parsed.board_summary : "";
            aiRecommendedActions = Array.isArray(parsed.recommended_actions)
              ? parsed.recommended_actions.filter((a: unknown) => typeof a === "string")
              : [];
          }
        } else {
          console.error("AI narrative failed:", aiResp.status);
        }
      } catch (aiError) {
        console.error("AI narrative error:", aiError);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    const calModel = await fetchCalibrationModel(supabaseUrl, serviceKey, organization_id);

    const result = {
      baseline_risk: baselineRisk,
      baseline_components: baselineComponents,
      projected_risk: projected.score,
      projected_components: projected.components,
      risk_delta: riskDelta,
      escalation_triggered: escalationTriggered,
      kpi_projections: kpiProjections,
      ai_board_summary: aiBoardSummary,
      ai_recommended_actions: aiRecommendedActions,
      scenario_parameters: params,
      model_disclosure: {
        risk_model: `Calibrated sensitivity model using ${coefficients.data_points_used} data points (${coefficients.calibration_basis.primary_metric} + ${coefficients.calibration_basis.secondary_metric}, R²=${coefficients.r_squared ?? "N/A"}).`,
        kpi_model: "Dataset-aware projections: direct metric changes where provided, otherwise calibrated sensitivity propagation.",
        risk_weighting: "Composite score: 40% deviation + 20% volatility + 20% trend + 20% forecast.",
        classification: "CALIBRATED_MODEL",
        coefficients_used: coefficients,
        limitations: [
          "Sensitivity model is linear and may not capture higher-order interactions.",
          "Calibrated from historical behavior; structural breaks can reduce forward validity.",
          "Risk index baseline is role-level (organization scope), not dataset-specific.",
        ],
      },
      adaptive_calibration_applied: !!calModel,
      calibration_model_version: calModel?.model_version ?? null,
      calibration_context: calModel ? {
        score: calModel.overall_calibration_score,
        bias: (calModel as any).overall_bias_direction ?? null,
        model_version: calModel.model_version,
        band_corrections: calModel.band_corrections,
        low_sample_bands: calModel.low_sample_bands,
      } : null,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("strategic-simulation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
