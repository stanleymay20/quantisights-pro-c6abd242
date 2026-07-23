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

    const { organization_id, dataset_id, entity_type, entity_id } = await req.json();
    if (!organization_id || !entity_type || !entity_id) {
      return new Response(JSON.stringify({ error: "organization_id, entity_type, entity_id required" }), {
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

    // Fetch entity
    let entityData: any = null;
    if (entity_type === "advisory") {
      const { data } = await svc.from("advisory_instances").select("*").eq("id", entity_id).single();
      entityData = data;
    } else if (entity_type === "decision") {
      const { data } = await svc.from("decision_ledger").select("*").eq("id", entity_id).single();
      entityData = data;
    } else if (entity_type === "insight") {
      const { data } = await svc.from("insights").select("*").eq("id", entity_id).single();
      entityData = data;
    }

    if (!entityData) {
      return new Response(JSON.stringify({ error: "Entity not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate dataset belongs to org
    const { data: dsCheck } = await svc.from("datasets").select("id")
      .eq("id", dataset_id).eq("organization_id", organization_id).maybeSingle();
    if (!dsCheck) {
      return new Response(JSON.stringify({ error: "dataset_id does not belong to this organization" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch metrics for sensitivity analysis — dataset-scoped
    const { data: metrics } = await svc.from("metrics")
      .select("metric_type, value, date")
      .eq("organization_id", organization_id)
      .eq("dataset_id", dataset_id)
      .order("date", { ascending: false })
      .limit(500);

    const metricsByType: Record<string, number[]> = {};
    for (const m of (metrics || [])) {
      if (!metricsByType[m.metric_type]) metricsByType[m.metric_type] = [];
      metricsByType[m.metric_type].push(Number(m.value));
    }

    // Compute sensitivity: how much each factor would need to change to flip the recommendation
    const factors: { factor: string; current_mean: number; threshold_to_flip: number; change_required_pct: number; sensitivity: string }[] = [];

    for (const [type, values] of Object.entries(metricsByType)) {
      if (values.length < 2) continue;
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
      
      // How many standard deviations to flip = inversely proportional to volatility
      const flipThreshold = mean + (stddev > 0 ? 2 * stddev : mean * 0.3);
      const changePct = mean !== 0 ? Math.round(Math.abs((flipThreshold - mean) / mean) * 100) : 0;

      factors.push({
        factor: type,
        current_mean: Math.round(mean * 100) / 100,
        threshold_to_flip: Math.round(flipThreshold * 100) / 100,
        change_required_pct: changePct,
        sensitivity: changePct < 10 ? "high" : changePct < 30 ? "medium" : "low",
      });
    }

    factors.sort((a, b) => a.change_required_pct - b.change_required_pct);

    // AI counterfactual narrative
    let narrative = "";
    let counterfactualScenario = "";
    if (lovableApiKey) {
      try {
        const recommendation = entityData.recommended_action || entityData.action || entityData.message || "N/A";
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are a counterfactual reasoning specialist. Given an AI recommendation and its sensitivity factors, explain in 2-3 paragraphs:
1. What would need to change for the OPPOSITE recommendation to be made
2. Which factors are the most fragile (closest to flipping the decision)
3. What this tells the executive about decision robustness
Also provide a single-sentence counterfactual scenario description. Format as JSON: {"narrative": "...", "counterfactual_scenario": "..."}`,
              },
              {
                role: "user",
                content: `Recommendation: "${recommendation}"\nEntity: ${JSON.stringify(entityData)}\nSensitivity factors: ${JSON.stringify(factors.slice(0, 8))}`,
              },
            ],
          }),
        });
        if (aiResp.ok) {
          const aiData = await aiResp.json();
          const rawContent = aiData.choices?.[0]?.message?.content || "";
          // Models frequently wrap JSON output in a ```json ... ``` markdown
          // fence even when explicitly asked for raw JSON. JSON.parse() then
          // throws, and the previous catch-block fallback showed the entire
          // raw fenced response (fence markers, literal \n escapes and all)
          // directly to the user as the "narrative" — strip any fence first.
          const content = rawContent
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
          try {
            const parsed = JSON.parse(content);
            narrative = parsed.narrative || content;
            counterfactualScenario = parsed.counterfactual_scenario || "";
          } catch {
            // Still not valid JSON after stripping fences — fall back to the
            // de-fenced text rather than raw JSON-with-markdown, so a parse
            // failure degrades to plain prose instead of visible JSON syntax.
            narrative = content || rawContent;
            counterfactualScenario = "Alternative scenario where key factors shift beyond threshold";
          }
        }
      } catch (e) {
        console.error("AI counterfactual error:", e);
      }
    }

    const result = {
      entity_type,
      entity_id,
      original_recommendation: entityData.recommended_action || entityData.action || entityData.message,
      counterfactual_scenario: counterfactualScenario,
      factors_to_change: factors,
      minimum_changes_required: factors.filter(f => f.sensitivity === "high").length || 1,
      narrative,
      confidence: Math.min(65, factors.length * 8),
    };

    // Store
    await svc.from("counterfactual_analyses").insert({
      organization_id,
      entity_type,
      entity_id,
      original_recommendation: result.original_recommendation || "N/A",
      counterfactual_scenario: result.counterfactual_scenario || "N/A",
      factors_to_change: result.factors_to_change,
      sensitivity_ranking: factors.slice(0, 5),
      minimum_changes_required: result.minimum_changes_required,
      confidence: result.confidence,
      narrative,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("counterfactual-explain error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
