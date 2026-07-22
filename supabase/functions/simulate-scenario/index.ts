import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyRateLimit } from "../_shared/rate-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { arimaForecast } from "../_shared/ml-engine.ts";

const TIER_LIMITS: Record<string, number> = {
  starter: 0,
  growth: 3,
  enterprise: 999999,
};

/**
 * Safe formula evaluator using a recursive descent parser.
 * Only allows: numbers, +, -, *, /, parentheses, and named variables.
 * NO eval/Function constructor — prevents code injection.
 */
function evaluateFormula(formula: string, variables: Record<string, number>): number {
  let expr = formula;
  const sortedVars = Object.entries(variables).sort(([a], [b]) => b.length - a.length);
  for (const [name, val] of sortedVars) {
    expr = expr.replaceAll(name, String(val));
  }

  const sanitized = expr.replace(/\s+/g, "");
  if (!/^[\d+\-*/().]+$/.test(sanitized)) {
    throw new Error("Invalid formula expression: contains disallowed characters");
  }

  let pos = 0;
  const peek = () => sanitized[pos];
  const consume = (ch?: string) => {
    if (ch && sanitized[pos] !== ch) throw new Error(`Expected '${ch}' at position ${pos}`);
    return sanitized[pos++];
  };

  function parseExpr(): number {
    let result = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseTerm();
      result = op === "+" ? result + right : result - right;
    }
    return result;
  }

  function parseTerm(): number {
    let result = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parseFactor();
      if (op === "/" && right === 0) throw new Error("Division by zero");
      result = op === "*" ? result * right : result / right;
    }
    return result;
  }

  function parseFactor(): number {
    if (peek() === "-") {
      consume("-");
      return -parseFactor();
    }
    if (peek() === "(") {
      consume("(");
      const result = parseExpr();
      consume(")");
      return result;
    }
    const start = pos;
    while (pos < sanitized.length && (/\d/.test(sanitized[pos]) || sanitized[pos] === ".")) {
      pos++;
    }
    if (pos === start) throw new Error(`Unexpected character '${peek()}' at position ${pos}`);
    const num = parseFloat(sanitized.slice(start, pos));
    if (!isFinite(num)) throw new Error("Non-finite number in formula");
    return num;
  }

  const result = parseExpr();
  if (pos < sanitized.length) {
    throw new Error(`Unexpected character '${peek()}' at position ${pos}`);
  }
  if (!isFinite(result)) throw new Error("Formula produced non-finite result");
  return result;
}

function applyAdjustment(
  value: number,
  adjustmentType: string,
  adjustmentValue: number
): number {
  switch (adjustmentType) {
    case "percentage":
      return value * (1 + adjustmentValue / 100);
    case "absolute":
      return value + adjustmentValue;
    case "multiplier":
      return value * adjustmentValue;
    default:
      return value;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now();

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
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Auth via JWT claims (enterprise standard)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user?.id as string;

    const { scenario_id } = await req.json();
    if (!scenario_id) {
      return new Response(JSON.stringify({ error: "scenario_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch scenario
    const { data: scenario, error: scenErr } = await serviceClient
      .from("scenarios")
      .select("*")
      .eq("id", scenario_id)
      .single();

    if (scenErr || !scenario) {
      return new Response(JSON.stringify({ error: "Scenario not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: simulation tier (10/min per org)
    const rl = applyRateLimit(req, scenario.organization_id, "simulation", "simulate-scenario");
    if (rl) return rl;

    // Verify org membership
    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: userId,
      _org_id: scenario.organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Active Data Contract: scenario must have a dataset_id
    const dataset_id = scenario.dataset_id;
    if (!dataset_id) {
      return new Response(
        JSON.stringify({ error: "Scenario is not linked to a dataset. Active Data Contract requires dataset_id." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate dataset belongs to org
    const { data: dsCheck } = await serviceClient
      .from("datasets")
      .select("id")
      .eq("id", dataset_id)
      .eq("organization_id", scenario.organization_id)
      .maybeSingle();

    if (!dsCheck) {
      return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check subscription tier
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", scenario.organization_id)
      .eq("status", "active")
      .maybeSingle();

    const tier = sub?.tier || "starter";
    const limit = TIER_LIMITS[tier] || 0;

    if (limit === 0) {
      return new Response(
        JSON.stringify({ error: "Scenario simulation requires Growth or Enterprise plan" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Count org scenarios
    const { count } = await serviceClient
      .from("scenarios")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", scenario.organization_id)
      .neq("status", "archived");

    if ((count || 0) > limit) {
      return new Response(
        JSON.stringify({ error: `Scenario limit exceeded for ${tier} tier (max ${limit})` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch assumptions
    const { data: assumptions } = await serviceClient
      .from("scenario_assumptions")
      .select("*")
      .eq("scenario_id", scenario_id);

    if (!assumptions || assumptions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No assumptions defined for this scenario" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch org KPIs
    const { data: kpis } = await serviceClient
      .from("kpis")
      .select("*")
      .eq("organization_id", scenario.organization_id)
      .eq("status", "active");

    if (!kpis || kpis.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active KPIs found. Create KPIs first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gather all metric dependencies
    const allDeps = new Set<string>();
    for (const kpi of kpis) {
      const deps: string[] = Array.isArray(kpi.metric_dependencies) ? kpi.metric_dependencies : [];
      deps.forEach((d: string) => allDeps.add(d));
    }

    // Fetch baseline metrics — SCOPED TO DATASET (Active Data Contract)
    const { data: metrics } = await serviceClient
      .from("metrics")
      .select("metric_type, date, value")
      .eq("organization_id", scenario.organization_id)
      .eq("dataset_id", dataset_id)
      .in("metric_type", Array.from(allDeps))
      .order("date", { ascending: true });

    if (!metrics || metrics.length === 0) {
      return new Response(
        JSON.stringify({ error: "No metrics data available in this dataset for simulation" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build adjustment map: metric_type -> { type, value }
    const adjustmentMap: Record<string, { type: string; value: number }> = {};
    for (const a of assumptions) {
      adjustmentMap[a.metric_type] = {
        type: a.adjustment_type,
        value: Number(a.adjustment_value),
      };
    }

    // Calculate baseline averages per metric (last 30 data points) — used as
    // the hasDeps gate and as a per-value fallback when a metric's series is
    // too short/unstable to forecast.
    const metricAverages: Record<string, number> = {};
    const metricByType: Record<string, number[]> = {};
    for (const m of metrics) {
      if (!metricByType[m.metric_type]) metricByType[m.metric_type] = [];
      metricByType[m.metric_type].push(Number(m.value));
    }
    for (const [type, vals] of Object.entries(metricByType)) {
      const recent = vals.slice(-30);
      metricAverages[type] = recent.reduce((a, b) => a + b, 0) / recent.length;
    }

    // Generate date range for forecast
    const forecastStart = new Date(scenario.forecast_start_date);
    const forecastEnd = new Date(scenario.forecast_end_date);
    const forecastDates: string[] = [];
    const d = new Date(forecastStart);
    while (d <= forecastEnd) {
      forecastDates.push(d.toISOString().split("T")[0]);
      d.setDate(d.getDate() + 1);
    }

    // Cap at 365 days
    const dates = forecastDates.slice(0, 365);

    // Per-metric day-by-day projection. A flat historical average reused for
    // every date produced identical baseline/simulated/delta values across
    // the entire forecast horizon — every "projection" was the same number
    // repeated. arimaForecast (already used elsewhere for real forecasting)
    // projects the metric's actual trend forward one value per date; it
    // already degrades to a flat mean when a series is too short (<10
    // points) to fit, which is honest behavior for genuinely sparse data.
    const metricForecasts: Record<string, number[]> = {};
    for (const [type, vals] of Object.entries(metricByType)) {
      const { forecast } = arimaForecast(vals, dates.length);
      metricForecasts[type] = forecast.map((v) => (Number.isFinite(v) ? v : metricAverages[type]));
    }

    // Compute results for each KPI × date
    const allResults: {
      scenario_id: string;
      kpi_id: string;
      organization_id: string;
      date: string;
      baseline_value: number;
      simulated_value: number;
      delta_value: number;
    }[] = [];

    const kpiSummaries: Record<string, { name: string; totalBaseline: number; totalSimulated: number }> = {};

    for (const kpi of kpis) {
      const deps: string[] = Array.isArray(kpi.metric_dependencies) ? kpi.metric_dependencies : [];
      const hasDeps = deps.every((dep: string) => metricAverages[dep] !== undefined);
      if (!hasDeps) continue;

      kpiSummaries[kpi.id] = { name: kpi.name, totalBaseline: 0, totalSimulated: 0 };

      for (const [dateIndex, date] of dates.entries()) {
        const baselineVars: Record<string, number> = {};
        const simulatedVars: Record<string, number> = {};

        for (const dep of deps) {
          const baseVal = metricForecasts[dep]?.[dateIndex] ?? metricAverages[dep] ?? 0;
          baselineVars[dep] = baseVal;
          const adj = adjustmentMap[dep];
          simulatedVars[dep] = adj ? applyAdjustment(baseVal, adj.type, adj.value) : baseVal;
        }

        try {
          const baselineValue = evaluateFormula(kpi.formula, baselineVars);
          const simulatedValue = evaluateFormula(kpi.formula, simulatedVars);
          const deltaValue = simulatedValue - baselineValue;

          allResults.push({
            scenario_id,
            kpi_id: kpi.id,
            organization_id: scenario.organization_id,
            date,
            baseline_value: baselineValue,
            simulated_value: simulatedValue,
            delta_value: deltaValue,
          });

          kpiSummaries[kpi.id].totalBaseline += baselineValue;
          kpiSummaries[kpi.id].totalSimulated += simulatedValue;
        } catch {
          // Skip dates where formula fails
        }
      }
    }

    // Delete old results and insert new
    await serviceClient
      .from("scenario_results")
      .delete()
      .eq("scenario_id", scenario_id);

    // Batch insert in chunks of 500
    for (let i = 0; i < allResults.length; i += 500) {
      const chunk = allResults.slice(i, i + 500);
      const { error: insertErr } = await serviceClient
        .from("scenario_results")
        .insert(chunk);
      if (insertErr) throw insertErr;
    }

    // Update scenario status
    await serviceClient
      .from("scenarios")
      .update({ status: "active" })
      .eq("id", scenario_id);

    // Compute summary
    let totalDelta = 0;
    let topPositiveDriver = "";
    let topPositiveDelta = -Infinity;
    let topRiskArea = "";
    let topRiskDelta = Infinity;

    for (const [kpiId, summary] of Object.entries(kpiSummaries)) {
      const delta = summary.totalSimulated - summary.totalBaseline;
      totalDelta += delta;
      if (delta > topPositiveDelta) {
        topPositiveDelta = delta;
        topPositiveDriver = summary.name;
      }
      if (delta < topRiskDelta) {
        topRiskDelta = delta;
        topRiskArea = summary.name;
      }
    }

    const totalBaseline = Object.values(kpiSummaries).reduce((s, v) => s + v.totalBaseline, 0);
    const percentageChange = totalBaseline !== 0 ? ((totalDelta / totalBaseline) * 100) : 0;

    const executionTime = Date.now() - startTime;

    // Audit trail
    await serviceClient.from("audit_log").insert({
      organization_id: scenario.organization_id,
      actor_id: userId,
      actor_type: "user",
      action_type: "scenario_simulated",
      resource_type: "scenario",
      resource_id: scenario_id,
      payload: {
        dataset_id,
        results_count: allResults.length,
        kpis_computed: Object.keys(kpiSummaries).length,
        forecast_days: dates.length,
        execution_time_ms: executionTime,
      },
    });

    console.log(JSON.stringify({
      event: "scenario_simulated",
      scenario_id,
      organization_id: scenario.organization_id,
      dataset_id,
      results_count: allResults.length,
      kpis_computed: Object.keys(kpiSummaries).length,
      forecast_days: dates.length,
      execution_time_ms: executionTime,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        projected_values: allResults.length,
        summary: {
          total_delta: totalDelta,
          percentage_change: percentageChange,
          top_positive_driver: topPositiveDriver,
          top_risk_area: topRiskArea,
          forecast_days: dates.length,
          kpis_computed: Object.keys(kpiSummaries).length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("simulate-scenario error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
