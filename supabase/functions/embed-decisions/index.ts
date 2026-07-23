/**
 * embed-decisions — Batch embed decisions, outcomes, insights, and advisories
 * into vector store for institutional memory / RAG.
 * 
 * Triggered after:
 * - Decision approval (via decision lifecycle)
 * - Outcome evaluation completion
 * - Insight generation
 * - Advisory creation
 * 
 * Modes: "decisions" | "outcomes" | "insights" | "advisories" | "all" | "specific"
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateEmbedding, storeEmbedding, decisionToText, outcomeToText } from "../_shared/embeddings.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Accept service-role calls (from cron/other functions) or authenticated users
    const authHeader = req.headers.get("authorization");
    const svc = createClient(supabaseUrl, serviceKey);

    // If not service-role, verify user auth
    if (!authHeader?.includes(serviceKey)) {
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader || "" } },
      });
      const { data: { user }, error } = await userClient.auth.getUser();
      if (error || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { organization_id, mode, entity_ids } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let embedded = 0;
    const errors: string[] = [];
    const embedMode = mode || "all";

    // ── Embed decisions ──
    if (embedMode === "all" || embedMode === "decisions" || embedMode === "specific") {
      let query = svc
        .from("decision_ledger")
        .select("id, recommended_action, chosen_action, decision_type, notes, capped_confidence, predicted_net_impact, decision_status")
        .eq("organization_id", organization_id);

      if (embedMode === "specific" && entity_ids?.length > 0) {
        query = query.in("id", entity_ids);
      }

      const { data: decisions } = await query.limit(500);

      for (const d of (decisions || [])) {
        try {
          const text = decisionToText(d);
          const embedding = await generateEmbedding(text);
          await storeEmbedding(supabaseUrl, serviceKey, organization_id, "decision", d.id, text, embedding, {
            decision_type: d.decision_type,
            confidence: d.capped_confidence,
            status: d.decision_status,
          });
          embedded++;
        } catch (e) {
          errors.push(`decision:${d.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // ── Embed outcomes ──
    if (embedMode === "all" || embedMode === "outcomes") {
      const { data: outcomes } = await svc
        .from("decision_ledger")
        .select("id, recommended_action, outcome_delta, prediction_accuracy_score, calibration_error, decision_status, execution_status")
        .eq("organization_id", organization_id)
        .eq("execution_status", "completed")
        .not("outcome_delta", "is", null)
        .limit(500);

      for (const d of (outcomes || [])) {
        try {
          const text = outcomeToText(d);
          const embedding = await generateEmbedding(text);
          await storeEmbedding(supabaseUrl, serviceKey, organization_id, "outcome", d.id, text, embedding, {
            outcome_delta: d.outcome_delta,
            accuracy_score: d.prediction_accuracy_score,
            calibration_error: d.calibration_error,
          });
          embedded++;
        } catch (e) {
          errors.push(`outcome:${d.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // ── Embed insights ──
    if (embedMode === "all" || embedMode === "insights") {
      const { data: insights } = await svc
        .from("insights")
        .select("id, message, category, severity, confidence_score")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(500);

      for (const i of (insights || [])) {
        try {
          const text = `[${i.severity}] ${i.category}: ${i.message}`;
          const embedding = await generateEmbedding(text);
          await storeEmbedding(supabaseUrl, serviceKey, organization_id, "insight", i.id, text, embedding, {
            category: i.category,
            severity: i.severity,
            confidence: i.confidence_score,
          });
          embedded++;
        } catch (e) {
          errors.push(`insight:${i.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    // ── Embed advisories ──
    if (embedMode === "all" || embedMode === "advisories") {
      const { data: advisories } = await svc
        .from("advisory_instances")
        .select("id, title, action, category, advisory_type, priority, rationale, confidence, expected_impact")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })
        .limit(500);

      for (const a of (advisories || [])) {
        try {
          const text = `[${a.priority}] ${a.category} ${a.advisory_type}: ${a.title}. Action: ${a.action}${a.rationale ? `. Rationale: ${a.rationale}` : ""}${a.expected_impact ? `. Impact: ${a.expected_impact}` : ""}`;
          const embedding = await generateEmbedding(text);
          await storeEmbedding(supabaseUrl, serviceKey, organization_id, "advisory", a.id, text, embedding, {
            category: a.category,
            advisory_type: a.advisory_type,
            priority: a.priority,
            confidence: a.confidence,
          });
          embedded++;
        } catch (e) {
          errors.push(`advisory:${a.id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    console.log(JSON.stringify({
      event: "embed_decisions",
      organization_id,
      mode: embedMode,
      embedded,
      errors: errors.length,
    }));

    return new Response(JSON.stringify({
      embedded,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      mode: embedMode,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("embed-decisions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
