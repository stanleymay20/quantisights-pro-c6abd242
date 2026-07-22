import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const TIER_LIMITS: Record<string, number> = {
  starter: 3,
  growth: 25,
  enterprise: 999999,
};

/**
 * Safe formula evaluator using a recursive descent parser.
 * Only allows: numbers, +, -, *, /, parentheses, and named variables.
 * NO eval/Function constructor — prevents code injection.
 */
function evaluateFormula(formula: string, variables: Record<string, number>): number {
  // Replace variable names with their values (longest-first to prevent partial matches)
  let expr = formula;
  const sortedVars = Object.entries(variables).sort(([a], [b]) => b.length - a.length);
  for (const [name, val] of sortedVars) {
    expr = expr.replaceAll(name, String(val));
  }

  // Validate: only digits, operators, parens, dots, whitespace, minus
  const sanitized = expr.replace(/\s+/g, "");
  if (!/^[\d+\-*/().]+$/.test(sanitized)) {
    throw new Error("Invalid formula expression: contains disallowed characters");
  }

  // Recursive descent parser
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
    // Handle unary minus
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
    // Parse number
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
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Get authenticated user via JWT claims
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: claimsError } = await userClient.auth.getUser();
    if (claimsError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user?.id as string;

    const { kpi_id, dataset_id, date_from, date_to } = await req.json();
    if (!kpi_id) {
      return new Response(JSON.stringify({ error: "kpi_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch KPI definition
    const { data: kpi, error: kpiError } = await serviceClient
      .from("kpis")
      .select("*")
      .eq("id", kpi_id)
      .single();

    if (kpiError || !kpi) {
      return new Response(JSON.stringify({ error: "KPI not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
    const { data: isMember } = await serviceClient.rpc("is_org_member", {
      _user_id: userId,
      _org_id: kpi.organization_id,
    });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check subscription tier limits
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier, status")
      .eq("organization_id", kpi.organization_id)
      .eq("status", "active")
      .maybeSingle();

    const tier = sub?.tier || "starter";
    const limit = TIER_LIMITS[tier] || 3;

    // Count org KPIs
    const { count } = await serviceClient
      .from("kpis")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", kpi.organization_id)
      .eq("status", "active");

    if ((count || 0) > limit) {
      return new Response(
        JSON.stringify({ error: `KPI limit exceeded for ${tier} tier (max ${limit})` }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine date range
    const endDate = date_to || new Date().toISOString().split("T")[0];
    const startDate = date_from || new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    // Fetch metrics for dependencies
    let deps: string[] = Array.isArray(kpi.metric_dependencies)
      ? kpi.metric_dependencies.filter((d: unknown) => typeof d === "string" && d.length > 0)
      : [];

    // Auto-detect metric names from formula if deps are empty
    if (deps.length === 0 && kpi.formula) {
      const formulaTokens = kpi.formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
      const uniqueTokens = [...new Set(formulaTokens)];

      const { data: knownMetrics } = await serviceClient
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", kpi.organization_id)
        .eq("dataset_id", dataset_id);
      const knownTypes: Set<string> = new Set((knownMetrics || []).map((m: any) => String(m.metric_type)));

      deps = (uniqueTokens as string[]).filter((t: string) => knownTypes.has(t));

      if (deps.length === 0) {
        deps = ([...knownTypes] as string[]).filter((mt: string) =>
          (uniqueTokens as string[]).some((t: string) => mt.includes(t) || t.includes(mt))
        );
      }

      if (deps.length > 0) {
        await serviceClient.from("kpis").update({ metric_dependencies: deps }).eq("id", kpi_id);
      }
    }

    if (deps.length === 0) {
      const { data: availableMetrics } = await serviceClient
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", kpi.organization_id)
        .eq("dataset_id", dataset_id)
        .limit(100);
      const available = [...new Set((availableMetrics || []).map((m: any) => m.metric_type))].slice(0, 20);

      return new Response(
        JSON.stringify({
          error: "Could not match formula variables to any metric types in your data.",
          formula: kpi.formula,
          available_metric_types: available,
          hint: "Update the KPI formula to use these metric type names, or set metric_dependencies manually."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: metrics, error: mErr } = await serviceClient
      .from("metrics")
      .select("metric_type, date, value")
      .eq("organization_id", kpi.organization_id)
      .eq("dataset_id", dataset_id)
      .in("metric_type", deps)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (mErr) throw mErr;

    // Group metrics by date
    const byDate: Record<string, Record<string, number[]>> = {};
    for (const m of metrics || []) {
      if (!byDate[m.date]) byDate[m.date] = {};
      if (!byDate[m.date][m.metric_type]) byDate[m.date][m.metric_type] = [];
      byDate[m.date][m.metric_type].push(Number(m.value));
    }

    // Compute KPI for each date
    const results: { date: string; value: number }[] = [];
    for (const [date, typeMap] of Object.entries(byDate)) {
      const variables: Record<string, number> = {};
      for (const dep of deps) {
        const vals = typeMap[dep] || [];
        if (vals.length === 0) continue;
        if (kpi.aggregation_type === "avg") {
          variables[dep] = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
        } else {
          variables[dep] = vals.reduce((a: number, b: number) => a + b, 0);
        }
      }

      if (Object.keys(variables).length < deps.length) continue;

      try {
        const value = evaluateFormula(kpi.formula, variables);
        results.push({ date, value });
      } catch {
        // Skip dates where formula fails
      }
    }

    // Upsert kpi_values
    if (results.length > 0) {
      await serviceClient
        .from("kpi_values")
        .delete()
        .eq("kpi_id", kpi_id)
        .eq("organization_id", kpi.organization_id)
        .gte("date", startDate)
        .lte("date", endDate);

      const inserts = results.map((r) => ({
        kpi_id,
        organization_id: kpi.organization_id,
        date: r.date,
        value: r.value,
        computed_at: new Date().toISOString(),
      }));

      const { error: insertErr } = await serviceClient
        .from("kpi_values")
        .insert(inserts);

      if (insertErr) throw insertErr;
    }

    console.log(JSON.stringify({
      event: "kpi_computed",
      kpi_id,
      dataset_id,
      organization_id: kpi.organization_id,
      results_count: results.length,
      date_range: { from: startDate, to: endDate },
    }));

    return new Response(
      JSON.stringify({ success: true, values: results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("compute-kpi error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
