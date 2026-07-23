import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const ROLE_CONFIGS: Record<string, { label: string; focusAreas: string[]; defaultMetrics: string[] }> = {
  ceo: {
    label: "Chief Executive Officer",
    focusAreas: ["Strategic growth", "Market position", "Overall risk exposure", "Competitive advantage"],
    defaultMetrics: ["revenue", "customers", "churn"],
  },
  cfo: {
    label: "Chief Financial Officer",
    focusAreas: ["Margins & profitability", "Cash flow", "Burn rate", "Cost optimization"],
    defaultMetrics: ["revenue", "cost", "churn"],
  },
  cmo: {
    label: "Chief Marketing Officer",
    focusAreas: ["Customer acquisition cost", "Lifetime value", "Funnel conversion", "Brand growth"],
    defaultMetrics: ["customers", "revenue"],
  },
  coo: {
    label: "Chief Operating Officer",
    focusAreas: ["Operational efficiency", "Process throughput", "Quality metrics", "Team productivity"],
    defaultMetrics: ["cost", "customers"],
  },
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  const startTime = Date.now();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = user?.id as string;

    const { role_type, organization_id, dataset_id } = await req.json();

    if (!role_type || !organization_id || !ROLE_CONFIGS[role_type]) {
      return new Response(JSON.stringify({ error: "Valid role_type and organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required (Active Data Contract)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify membership
    const { data: membership } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", userId)
      .eq("organization_id", organization_id)
      .single();

    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a member" }), { status: 403, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check subscription
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    if (!sub || !["growth", "enterprise"].includes(sub.tier)) {
      return new Response(
        JSON.stringify({ error: "Executive Command Mode requires a Growth or Enterprise plan." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- CACHING LOGIC ---
    // Fetch latest risk index and active alerts
    const { data: riskIndex } = await serviceClient
      .from("executive_risk_index")
      .select("score, components, last_updated")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .maybeSingle();

    const { data: activeAlerts } = await serviceClient
      .from("executive_alerts")
      .select("id, title, severity, trigger_value, threshold_value, created_at")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    // Check for cached brief < 6 hours old
    const { data: lastBrief } = await serviceClient
      .from("executive_briefs")
      .select("*")
      .eq("organization_id", organization_id)
      .eq("role_type", role_type)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastBriefAge = lastBrief ? Date.now() - new Date(lastBrief.generated_at).getTime() : Infinity;
    const riskScoreChanged = lastBrief && riskIndex
      ? Math.abs((riskIndex.score ?? 0) - (lastBrief.risk_score ?? 0)) > 10
      : false;
    const hasNewAlerts = (activeAlerts?.length ?? 0) > 0 &&
      activeAlerts?.some((a) => new Date(a.created_at).getTime() > (lastBrief ? new Date(lastBrief.generated_at).getTime() : 0));

    // Return cached if fresh and no significant changes
    if (lastBrief && lastBriefAge < SIX_HOURS_MS && !riskScoreChanged && !hasNewAlerts) {
      const cached = lastBrief.summary_json as any;
      return new Response(JSON.stringify({
        ...cached,
        role_type,
        generated_at: lastBrief.generated_at,
        risk_score: lastBrief.risk_score,
        risk_components: riskIndex?.components ?? {},
        active_alerts_db: activeAlerts || [],
        cached: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- GENERATE NEW BRIEF ---
    const roleConfig = ROLE_CONFIGS[role_type];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0];

    // Fetch KPIs, values, targets, metrics in parallel
    const [kpisRes, kpiValuesRes, targetsRes, metricsRes] = await Promise.all([
      supabase.from("kpis").select("id, name, formula, metric_dependencies, description")
        .eq("organization_id", organization_id).eq("status", "active"),
      supabase.from("kpi_values").select("kpi_id, date, value")
        .eq("organization_id", organization_id).gte("date", ninetyDaysAgo).order("date", { ascending: true }),
      supabase.from("kpi_targets").select("kpi_id, target_value, target_date")
        .eq("organization_id", organization_id),
      supabase.from("metrics").select("metric_type, value, date")
        .eq("organization_id", organization_id).eq("dataset_id", dataset_id).gte("date", ninetyDaysAgo).order("date", { ascending: true }),
    ]);

    const kpis = kpisRes.data || [];
    const kpiValues = kpiValuesRes.data || [];
    const targets = targetsRes.data || [];
    const metrics = metricsRes.data || [];

    // Build KPI summaries
    const kpiSummaries = kpis.map((kpi) => {
      const values = kpiValues.filter((v) => v.kpi_id === kpi.id);
      const latest = values.length > 0 ? values[values.length - 1] : null;
      const prev = values.length > 1 ? values[values.length - 2] : null;
      const target = targets.find((t) => t.kpi_id === kpi.id);
      return {
        name: kpi.name,
        description: kpi.description,
        latestValue: latest?.value ?? null,
        latestDate: latest?.date ?? null,
        previousValue: prev?.value ?? null,
        target: target?.target_value ?? null,
        targetDate: target?.target_date ?? null,
        trend: latest && prev ? ((Number(latest.value) - Number(prev.value)) / Math.abs(Number(prev.value) || 1) * 100).toFixed(1) + "%" : "N/A",
        dataPoints: values.length,
      };
    });

    // Metric summary
    const metricSummary: Record<string, { latest: number; count: number }> = {};
    metrics.forEach((m) => {
      if (!metricSummary[m.metric_type]) metricSummary[m.metric_type] = { latest: 0, count: 0 };
      metricSummary[m.metric_type].latest = Number(m.value);
      metricSummary[m.metric_type].count++;
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enhanced system prompt with deterministic data
    const systemPrompt = `You are an elite management consultant acting as a ${roleConfig.label} strategic advisor. Your focus areas are: ${roleConfig.focusAreas.join(", ")}.

IMPORTANT CONTEXT:
- Deterministic Risk Score: ${riskIndex?.score ?? "N/A"}/100
- Risk Components: ${JSON.stringify(riskIndex?.components ?? {})}
- Active Alerts: ${JSON.stringify((activeAlerts || []).map((a) => ({ title: a.title, severity: a.severity })))}

The risk score and alerts are computed deterministically from data. Use them as ground truth. Your role is to INTERPRET these signals, not re-judge them. Be direct, strategic, and data-driven.`;

    const userPrompt = `Generate an executive brief for the ${roleConfig.label}.

KPI Data:
${JSON.stringify(kpiSummaries, null, 2)}

Metric Summary:
${JSON.stringify(metricSummary, null, 2)}

Focus areas: ${roleConfig.focusAreas.join(", ")}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "executive_brief",
              description: "Structured executive brief output",
              parameters: {
                type: "object",
                properties: {
                  executive_summary: { type: "string", description: "2-3 sentence high-level summary" },
                  critical_alerts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        severity: { type: "string", enum: ["critical", "warning", "info"] },
                        description: { type: "string" },
                      },
                      required: ["title", "severity", "description"],
                    },
                  },
                  performance_snapshot: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        kpi_name: { type: "string" },
                        status: { type: "string", enum: ["on_track", "at_risk", "critical", "exceeding"] },
                        value: { type: "string" },
                        trend: { type: "string" },
                        insight: { type: "string" },
                      },
                      required: ["kpi_name", "status", "value", "trend", "insight"],
                    },
                  },
                  strategic_focus: { type: "array", items: { type: "string" } },
                  recommended_actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string" },
                        impact: { type: "string", enum: ["high", "medium", "low"] },
                        timeframe: { type: "string" },
                      },
                      required: ["action", "impact", "timeframe"],
                    },
                  },
                  urgency_level: { type: "string", enum: ["stable", "monitor", "action_required", "critical"] },
                },
                required: ["executive_summary", "critical_alerts", "performance_snapshot", "strategic_focus", "recommended_actions", "urgency_level"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "executive_brief" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const aiData = await aiResponse.json();
    let brief;
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      brief = JSON.parse(toolCall.function.arguments);
    } catch {
      brief = {
        executive_summary: "Unable to generate AI analysis. Insufficient data for meaningful insights.",
        critical_alerts: [],
        performance_snapshot: [],
        strategic_focus: ["Collect more data to enable strategic analysis"],
        recommended_actions: [],
        urgency_level: "monitor",
      };
    }

    // Store brief in executive_briefs
    await serviceClient.from("executive_briefs").insert({
      organization_id,
      role_type,
      summary_json: brief,
      risk_score: riskIndex?.score ?? 0,
      generated_by: "ai",
    });

    const executionTime = Date.now() - startTime;
    console.log(JSON.stringify({
      event: "executive_brief_generated",
      organization_id,
      role_type,
      kpi_count: kpis.length,
      execution_time_ms: executionTime,
      cached: false,
    }));

    return new Response(JSON.stringify({
      ...brief,
      role_type,
      generated_at: new Date().toISOString(),
      risk_score: riskIndex?.score ?? 0,
      risk_components: riskIndex?.components ?? {},
      active_alerts_db: activeAlerts || [],
      cached: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("executive-brief error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
