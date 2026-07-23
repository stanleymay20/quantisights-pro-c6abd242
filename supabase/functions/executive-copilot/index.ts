import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rate-limiter.ts";
import { applyAIBoundary } from "../_shared/ai-redaction.ts";
import { generateEmbedding, searchSimilar, buildRAGContext } from "../_shared/embeddings.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

const TIER_LIMITS: Record<string, number> = {
  starter: 20,
  growth: 100,
  enterprise: 999999,
};

const SYSTEM_PROMPT = `You are Quantivis Executive Intelligence — an enterprise-grade strategic advisor grounded EXCLUSIVELY in the dataset and signals provided below.

YOUR DATA SOURCES (ranked by authority):
1. DATASET METRICS — actual time-series values from the organization's active dataset
2. KPI SIGNALS — computed KPI values derived from formulas
3. RISK INDEX — strategic risk scoring
4. ACTIVE ALERTS — triggered threshold breaches
5. LATEST BRIEF — most recent executive intelligence brief

ABSOLUTE RULES:
- NEVER hallucinate metrics, KPIs, numbers, or trends not present in the supplied context.
- If asked about data you don't have, respond: "This question requires data not currently in your active dataset. Specifically, I would need [X] to answer this."
- NEVER fabricate financial projections. All estimates must cite the source metric and its actual values.
- Always mark projections as "ESTIMATED" and state the basis metric.
- Reference specific metric names, values, dates, and change percentages from the context.

EPISTEMIC INTEGRITY (NON-NEGOTIABLE):
- State confidence level (0-100) at the end of every response.
- Confidence CANNOT exceed 60% with <12 data points.
- Confidence CANNOT exceed 75% with <30 data points.
- Confidence CANNOT exceed 90% even with robust data.
- State the number of data points you are reasoning from.
- Distinguish "data-supported" vs "estimated" claims.

RESPONSE STRUCTURE:
1. Strategic Assessment (cite specific metrics and values)
2. Root Cause Hypothesis (reference trend slopes, volatility, segment shifts)
3. Immediate Actions (0-7 days) with expected impact
4. Structural Actions (30-90 days)
5. Risk if Ignored (quantify using actual data trends)
6. Confidence: [X]% | Data Points: [N] | Sufficiency: [adequate/limited/insufficient]

When asked "what if" / scenario questions:
- Use actual metric values as baselines (cite them)
- Estimate directional change with explicit assumptions
- Label ALL projections as ESTIMATED`;

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    const rl = checkRateLimit(`copilot:${clientIp}`, 30, 60 * 1000);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

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

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Secure JWT validation via getUser()
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { message, session_id, role_type, organization_id, dataset_id, dataset_name } = await req.json();

    if (!message || !role_type || !organization_id) {
      return new Response(JSON.stringify({ error: "message, role_type, and organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify org membership
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

    // Check subscription tier
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier")
      .eq("organization_id", organization_id)
      .eq("status", "active")
      .maybeSingle();

    const tier = sub?.tier || "starter";
    const dailyLimit = TIER_LIMITS[tier] || 20;

    // Check usage
    const today = new Date().toISOString().split("T")[0];
    const { data: usage } = await serviceClient
      .from("copilot_usage")
      .select("call_count")
      .eq("organization_id", organization_id)
      .eq("date", today)
      .maybeSingle();

    const currentCount = usage?.call_count || 0;
    if (currentCount >= dailyLimit) {
      return new Response(
        JSON.stringify({ error: `Daily copilot limit reached (${dailyLimit} calls for ${tier} tier)` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Increment usage
    await serviceClient.rpc("increment_copilot_usage" as any, { _org_id: organization_id });

    // Get or create session
    let currentSessionId = session_id;
    if (!currentSessionId) {
      const { data: newSession, error: sessErr } = await serviceClient
        .from("copilot_sessions")
        .insert({ organization_id, user_id: user.id, role_type })
        .select("id")
        .single();
      if (sessErr) throw sessErr;
      currentSessionId = newSession.id;
    }

    // Store user message
    await serviceClient.from("copilot_messages").insert({
      session_id: currentSessionId,
      organization_id,
      role: "user",
      content: message,
    });

    // ══════════════════════════════════════════════════════════════════
    // FETCH ALL CONTEXT IN PARALLEL — including ACTUAL dataset metrics
    // ══════════════════════════════════════════════════════════════════
    const fetchPromises: Array<PromiseLike<any>> = [
      // 0: Risk index
      serviceClient
        .from("executive_risk_index")
        .select("score, components, last_updated, escalation_required, escalation_reason")
        .eq("organization_id", organization_id)
        .eq("role_type", role_type)
        .maybeSingle(),
      // 1: Alerts
      serviceClient
        .from("executive_alerts")
        .select("title, severity, trigger_value, threshold_value, metric_type, created_at")
        .eq("organization_id", organization_id)
        .eq("role_type", role_type)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(10),
      // 2: KPI values
      serviceClient
        .from("kpi_values")
        .select("kpi_id, value, date, kpis(name, formula, description)")
        .eq("organization_id", organization_id)
        .order("date", { ascending: false })
        .limit(50),
      // 3: Latest brief
      serviceClient
        .from("executive_briefs")
        .select("summary_json, risk_score, generated_at")
        .eq("organization_id", organization_id)
        .eq("role_type", role_type)
        .order("generated_at", { ascending: false })
        .limit(1),
      // 4: Chat history
      serviceClient
        .from("copilot_messages")
        .select("role, content")
        .eq("session_id", currentSessionId)
        .order("created_at", { ascending: true })
        .limit(20),
      // 5: Calibration model
      serviceClient
        .from("calibration_models")
        .select("overall_calibration_score, overall_bias_direction, mean_absolute_error, band_corrections, model_version")
        .eq("organization_id", organization_id)
        .order("computed_at", { ascending: false })
        .limit(1),
    ];

    // 6: Dataset metrics (THE CRITICAL ADDITION)
    if (dataset_id) {
      fetchPromises.push(
        serviceClient
          .from("metrics")
          .select("metric_type, value, date, region, segment")
          .eq("organization_id", organization_id)
          .eq("dataset_id", dataset_id)
          .order("date", { ascending: true })
          .limit(10000)
      );
    }

    const results = await Promise.all(fetchPromises);

    const [riskResult, alertsResult, kpisResult, briefsResult, historyResult, calibrationResult] = results;
    const metricsResult = dataset_id ? results[6] : null;

    // ══════════════════════════════════════════════════════════════════
    // BUILD RICH CONTEXT BLOCK
    // ══════════════════════════════════════════════════════════════════
    const contextParts: string[] = [];

    // Dataset metrics — PRIMARY data source
    if (metricsResult?.data && metricsResult.data.length > 0) {
      const metrics = metricsResult.data as Array<{ metric_type: string; value: number; date: string; region?: string; segment?: string }>;
      const grouped: Record<string, { values: number[]; dates: string[]; regions: Set<string>; segments: Set<string> }> = {};

      for (const m of metrics) {
        if (!grouped[m.metric_type]) grouped[m.metric_type] = { values: [], dates: [], regions: new Set(), segments: new Set() };
        grouped[m.metric_type].values.push(Number(m.value));
        grouped[m.metric_type].dates.push(m.date);
        if (m.region) grouped[m.metric_type].regions.add(m.region);
        if (m.segment) grouped[m.metric_type].segments.add(m.segment);
      }

      const metricLines: string[] = [];
      for (const [type, data] of Object.entries(grouped)) {
        const vals = data.values;
        const n = vals.length;
        const latest = vals[n - 1];
        const earliest = vals[0];
        const mean = vals.reduce((s, v) => s + v, 0) / n;
        const changePct = earliest !== 0 ? ((latest - earliest) / Math.abs(earliest)) * 100 : 0;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
        const stdDev = Math.sqrt(variance);
        const volatility = mean !== 0 ? (stdDev / Math.abs(mean)) * 100 : 0;
        // Linear regression slope
        const xMean = (n - 1) / 2;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) { num += (i - xMean) * (vals[i] - mean); den += (i - xMean) ** 2; }
        const slope = den !== 0 ? num / den : 0;
        const slopeNorm = mean !== 0 ? (slope / Math.abs(mean)) * 100 : 0;

        metricLines.push(
          `• ${type}: ${n} points | Latest: ${latest.toFixed(2)} | Mean: ${mean.toFixed(2)} | Change: ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}% | Trend slope: ${slopeNorm > 0 ? "+" : ""}${slopeNorm.toFixed(1)}%/period | Volatility: ${volatility.toFixed(1)}% | Range: ${data.dates[0]} → ${data.dates[n - 1]}${data.regions.size > 0 ? ` | Regions: ${[...data.regions].join(", ")}` : ""}${data.segments.size > 0 ? ` | Segments: ${[...data.segments].join(", ")}` : ""}`
        );
      }

      contextParts.push(`ACTIVE DATASET: "${dataset_name || "unnamed"}" (${metrics.length} total records, ${Object.keys(grouped).length} metric types)\n\nMETRIC PROFILES:\n${metricLines.join("\n")}`);
    } else if (dataset_id) {
      contextParts.push(`ACTIVE DATASET: "${dataset_name || "unnamed"}" — NO METRICS FOUND. The dataset may be empty or still processing.`);
    } else {
      contextParts.push("DATASET: No active dataset selected. Responses will be limited to organizational KPIs and risk signals only. Recommend the user select a dataset for grounded analysis.");
    }

    // Risk index
    if (riskResult.data) {
      const r = riskResult.data;
      contextParts.push(`RISK INDEX: Score ${r.score}/100. Components: deviation=${(r.components as any)?.deviation}, trend=${(r.components as any)?.trend}, volatility=${(r.components as any)?.volatility}, forecast=${(r.components as any)?.forecast}. Escalation: ${r.escalation_required ? "REQUIRED - " + r.escalation_reason : "Not required"}.`);
    } else {
      contextParts.push("RISK INDEX: No risk data computed yet.");
    }

    // Alerts
    if (alertsResult.data && alertsResult.data.length > 0) {
      const alertLines = alertsResult.data.map((a: any) =>
        `- [${a.severity.toUpperCase()}] ${a.title}: trigger=${a.trigger_value}, threshold=${a.threshold_value}, metric=${a.metric_type}`
      );
      contextParts.push(`ACTIVE ALERTS (${alertsResult.data.length}):\n${alertLines.join("\n")}`);
    } else {
      contextParts.push("ACTIVE ALERTS: None.");
    }

    // KPIs
    if (kpisResult.data && kpisResult.data.length > 0) {
      const kpiMap: Record<string, { name: string; values: string[] }> = {};
      for (const kv of kpisResult.data as any[]) {
        const name = kv.kpis?.name || kv.kpi_id;
        if (!kpiMap[name]) kpiMap[name] = { name, values: [] };
        if (kpiMap[name].values.length < 5) {
          kpiMap[name].values.push(`${kv.date}: ${Number(kv.value).toFixed(2)}`);
        }
      }
      const kpiLines = Object.values(kpiMap).map(k => `${k.name}: ${k.values.join(", ")}`);
      contextParts.push(`KPI SIGNALS (recent values):\n${kpiLines.join("\n")}`);
    } else {
      contextParts.push("KPI SIGNALS: No KPI data available.");
    }

    // Latest brief
    if (briefsResult.data && briefsResult.data.length > 0) {
      const latest = briefsResult.data[0] as any;
      contextParts.push(`LATEST BRIEF (${latest.generated_at}): Risk score ${latest.risk_score}. Summary: ${JSON.stringify(latest.summary_json).slice(0, 500)}`);
    }

    // Calibration
    if (calibrationResult.data && calibrationResult.data.length > 0) {
      const cal = calibrationResult.data[0] as any;
      contextParts.push(`ADAPTIVE CALIBRATION (v${cal.model_version}):
- Overall Score: ${cal.overall_calibration_score}/100
- Bias Direction: ${cal.overall_bias_direction}
- Mean Absolute Error: ${cal.mean_absolute_error}pp
- Band Corrections: ${JSON.stringify(cal.band_corrections)}
When stating confidence levels, apply these learned corrections.`);
    }

    contextParts.push(`ROLE: ${role_type.toUpperCase()}`);
    contextParts.push(`DATE: ${new Date().toISOString().split("T")[0]}`);
    contextParts.push(`TIER: ${tier}`);

    // Fetch org AI boundary setting
    const { data: orgSettings } = await serviceClient
      .from("organizations")
      .select("ai_raw_text_enabled")
      .eq("id", organization_id)
      .maybeSingle();

    const aiRawTextEnabled = orgSettings?.ai_raw_text_enabled ?? false;

    // ══════════════════════════════════════════════════════════════════
    // RAG: Retrieve semantically similar past decisions/outcomes
    // This is what makes the copilot genuinely intelligent — it learns
    // from the organization's own decision history, not just prompts.
    // ══════════════════════════════════════════════════════════════════
    let ragContext = "";
    try {
      const queryEmbedding = await generateEmbedding(message, lovableApiKey);
      const similar = await searchSimilar(supabaseUrl, serviceKey, organization_id, queryEmbedding, {
        entityTypes: ["decision", "outcome", "insight"],
        limit: 8,
        minSimilarity: 0.3,
      });
      ragContext = buildRAGContext(similar);
    } catch (ragErr) {
      console.warn("RAG retrieval failed (non-fatal):", ragErr);
      ragContext = "INSTITUTIONAL MEMORY: Retrieval unavailable for this query.";
    }

    contextParts.push(ragContext);

    // Apply redaction
    const { text: safeContext } = applyAIBoundary(contextParts.join("\n\n"), aiRawTextEnabled);
    const { text: safeMessage } = applyAIBoundary(message, aiRawTextEnabled);

    // Build messages array with agent tools
    const aiMessages: { role: string; content: string }[] = [
      { role: "system", content: SYSTEM_PROMPT + "\n\n--- LIVE DATA CONTEXT ---\n" + safeContext },
    ];

    if (historyResult.data) {
      const history = historyResult.data.slice(0, -1);
      for (const msg of history as any[]) {
        const { text: safeContent } = applyAIBoundary(msg.content, aiRawTextEnabled);
        aiMessages.push({ role: msg.role, content: safeContent });
      }
    }
    aiMessages.push({ role: "user", content: safeMessage });

    // Call AI with streaming + agent tool definitions
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: aiMessages,
        stream: true,
        tools: [
          {
            type: "function",
            function: {
              name: "query_metric_data",
              description: "Query specific metric data from the organization's dataset. Use when the user asks about specific numbers, trends, or comparisons not in the context.",
              parameters: {
                type: "object",
                properties: {
                  metric_type: { type: "string", description: "The metric type to query" },
                  date_range: { type: "string", description: "Date range filter (e.g. 'last_30_days', 'last_quarter')" },
                },
                required: ["metric_type"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "find_similar_decisions",
              description: "Search for similar past decisions and their outcomes. Use when the user asks 'have we tried this before' or wants to learn from history.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Description of the decision to search for" },
                },
                required: ["query"],
              },
            },
          },
          {
            type: "function",
            function: {
              name: "calculate_risk_score",
              description: "Calculate a risk score for a proposed action based on historical outcomes. Use when assessing risk or probability of success.",
              parameters: {
                type: "object",
                properties: {
                  action_description: { type: "string", description: "Description of the proposed action" },
                  confidence_level: { type: "number", description: "Stated confidence level (0-100)" },
                },
                required: ["action_description"],
              },
            },
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reader = aiResponse.body!.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let textBuffer = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            textBuffer += decoder.decode(value, { stream: true });

            // Buffer across chunk boundaries — only consume complete lines.
            let nl: number;
            while ((nl = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, nl);
              textBuffer = textBuffer.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullContent += content;
              } catch { /* partial / non-JSON line */ }
            }
          }
          controller.close();

          if (fullContent) {
            await serviceClient.from("copilot_messages").insert({
              session_id: currentSessionId,
              organization_id,
              role: "assistant",
              content: fullContent,
            });
            await serviceClient
              .from("copilot_sessions")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", currentSessionId);
          }
        } catch (e) {
          console.error("Stream error:", e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "X-Session-Id": currentSessionId,
      },
    });
  } catch (e) {
    console.error("executive-copilot error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
