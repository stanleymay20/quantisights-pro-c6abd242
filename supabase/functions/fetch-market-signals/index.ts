import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const svc = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { organization_id, dataset_id, industry, topics, dry_run } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!dataset_id) {
      return new Response(JSON.stringify({ error: "dataset_id required by Active Data Contract" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isMember } = await svc.rpc("is_org_member", { _user_id: user.id, _org_id: organization_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dry run: validate contract only
    if (dry_run) {
      return new Response(JSON.stringify({ dry_run: true, status: "PASS", dataset_id, organization_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use AI to synthesize market intelligence from its training data
    const searchTopics = topics?.length > 0 ? topics.join(", ") : industry || "general business";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a market intelligence analyst. Generate current market signals and competitive intelligence for the specified industry. Return structured data only via the tool call. Focus on actionable signals with quantified impacts where possible. Include macro trends, competitor movements, regulatory changes, and technology shifts.`,
          },
          {
            role: "user",
            content: `Generate market intelligence signals for: ${searchTopics}. Include economic indicators, industry trends, competitive signals, and emerging risks.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "market_signals",
              description: "Return structured market intelligence signals",
              parameters: {
                type: "object",
                properties: {
                  signals: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", enum: ["macro_economic", "industry_trend", "competitive", "regulatory", "technology", "consumer"] },
                        title: { type: "string" },
                        summary: { type: "string" },
                        impact_level: { type: "string", enum: ["high", "medium", "low"] },
                        direction: { type: "string", enum: ["positive", "negative", "neutral"] },
                        relevance_score: { type: "number" },
                        time_horizon: { type: "string", enum: ["immediate", "short_term", "medium_term", "long_term"] },
                      },
                      required: ["category", "title", "summary", "impact_level", "direction", "relevance_score"],
                    },
                  },
                  market_sentiment: { type: "string", enum: ["bullish", "bearish", "neutral", "cautious"] },
                  key_risks: { type: "array", items: { type: "string" } },
                  opportunities: { type: "array", items: { type: "string" } },
                },
                required: ["signals", "market_sentiment"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "market_signals" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    interface MarketSignal {
      category: string;
      title: string;
      summary: string;
      impact_level?: string;
      direction?: string;
      relevance_score?: number;
    }
    interface MarketResult {
      signals: MarketSignal[];
      market_sentiment: string;
      key_risks: unknown[];
      opportunities: unknown[];
    }
    let result: MarketResult = { signals: [], market_sentiment: "neutral", key_risks: [], opportunities: [] };

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments) as MarketResult;
    }

    // Store signals
    for (const signal of (result.signals || []).slice(0, 20)) {
      await svc.from("external_signals").insert({
        organization_id,
        dataset_id,
        signal_type: signal.category,
        source: "ai_intelligence",
        data: signal,
        relevance_score: signal.relevance_score || 50,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-market-signals error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
