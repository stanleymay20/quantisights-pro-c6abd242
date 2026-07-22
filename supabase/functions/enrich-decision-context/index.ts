/**
 * enrich-decision-context
 *
 * Layer C synthesis: blends Layer A (client truth) with Layer B (internal reference data)
 * to produce a transparent enrichment object for an advisory or decision.
 *
 * Doctrine:
 * - Client data is primary and never overwritten
 * - Internal data adds context, benchmarks, macro pressure signals
 * - Provenance is preserved per data point
 * - Confidence is adjusted based on agreement/disagreement between sources
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichRequest {
  organization_id: string;
  advisory_id?: string;
  decision_id?: string;
  // Optional explicit hints for context lookup
  region?: string;
  industry?: string;
  metric_focus?: string; // e.g. 'churn_rate', 'revenue', 'inventory'
  client_confidence?: number; // current confidence from client data alone
}

interface ReferenceRow {
  id: string;
  category: string;
  metric_name: string;
  value: number;
  unit: string | null;
  region: string | null;
  industry: string | null;
  source: string;
  confidence_grade: string;
  metadata: Record<string, unknown>;
  period_start: string | null;
  period_end: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body: EnrichRequest = await req.json();
    const {
      organization_id,
      advisory_id,
      decision_id,
      region,
      industry,
      metric_focus,
      client_confidence = 50,
    } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({ error: "organization_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 1: Pull relevant internal reference data ──
    // Strategy: fetch all reference data matching the org's region/industry, plus global macro
    let query = supabase
      .from("internal_reference_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    // Filter by relevance — broaden with OR
    const filters: string[] = [];
    if (region) filters.push(`region.eq.${region}`);
    if (industry) filters.push(`industry.eq.${industry}`);
    filters.push("category.eq.macro"); // always include macro signals

    if (filters.length > 0) {
      query = query.or(filters.join(","));
    }

    const { data: refData, error: refErr } = await query;
    if (refErr) throw refErr;

    const referenceRows = (refData ?? []) as ReferenceRow[];

    // ── Step 2: Build internal_context array with provenance ──
    const internalContext = referenceRows.map((r) => ({
      id: r.id,
      category: r.category,
      metric: r.metric_name,
      value: r.value,
      unit: r.unit,
      region: r.region,
      industry: r.industry,
      source: r.source,
      confidence_grade: r.confidence_grade,
      period: r.period_start && r.period_end ? `${r.period_start} → ${r.period_end}` : null,
      signal: r.metadata?.trend ?? r.metadata?.signal ?? null,
    }));

    // ── Step 3: Compute confidence adjustment based on context ──
    // Doctrine rules:
    //   +5pp if multiple reference points agree with client direction
    //   -5pp if reference data signals headwinds
    //   capped at ±10pp total adjustment
    let confidence_delta = 0;
    let blending_rule = "no_context";

    const headwindSignals = referenceRows.filter((r) =>
      ["worsening", "tightening", "rising", "slowing", "competitor_promotional_pressure"].includes(
        String(r.metadata?.trend ?? r.metadata?.signal ?? "")
      )
    ).length;

    const tailwindSignals = referenceRows.filter((r) =>
      ["improving", "accelerating", "declining"].includes(
        String(r.metadata?.trend ?? "")
      ) && r.metric_name !== "inflation_rate" // declining inflation = tailwind, but rule is per-metric
    ).length;

    if (headwindSignals >= 2 && tailwindSignals === 0) {
      confidence_delta = -5;
      blending_rule = "headwind_dampening";
    } else if (tailwindSignals >= 2 && headwindSignals === 0) {
      confidence_delta = 5;
      blending_rule = "tailwind_reinforcement";
    } else if (referenceRows.length >= 3) {
      confidence_delta = 2;
      blending_rule = "context_enriched";
    }

    const enriched_confidence = Math.max(0, Math.min(100, client_confidence + confidence_delta));

    // ── Step 4: Build human-readable interpretation ──
    const headwindList = referenceRows
      .filter((r) => ["worsening", "tightening", "rising", "slowing"].includes(String(r.metadata?.trend ?? "")))
      .map((r) => `${r.metric_name} (${r.value}${r.unit ?? ""}, ${r.metadata?.trend})`)
      .slice(0, 3);

    const tailwindList = referenceRows
      .filter((r) => ["improving", "accelerating"].includes(String(r.metadata?.trend ?? "")))
      .map((r) => `${r.metric_name} (${r.value}${r.unit ?? ""}, ${r.metadata?.trend})`)
      .slice(0, 3);

    const parts: string[] = [];
    if (metric_focus) parts.push(`Client focus: ${metric_focus}`);
    if (headwindList.length) parts.push(`External headwinds: ${headwindList.join(", ")}`);
    if (tailwindList.length) parts.push(`External tailwinds: ${tailwindList.join(", ")}`);
    parts.push(`Confidence adjusted: ${client_confidence} → ${enriched_confidence} (${blending_rule})`);

    const combined_interpretation = parts.join(" | ");

    // ── Step 5: Persist to decision_enrichment ──
    const enrichmentRow = {
      organization_id,
      advisory_id: advisory_id ?? null,
      decision_id: decision_id ?? null,
      client_evidence: { focus: metric_focus, confidence: client_confidence },
      internal_context: internalContext,
      combined_interpretation,
      client_confidence,
      enriched_confidence,
      confidence_delta,
      blending_rule,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("decision_enrichment")
      .insert(enrichmentRow)
      .select()
      .single();

    if (insErr) throw insErr;

    return new Response(
      JSON.stringify({
        success: true,
        enrichment_id: inserted.id,
        client_confidence,
        enriched_confidence,
        confidence_delta,
        blending_rule,
        internal_context_count: internalContext.length,
        internal_context: internalContext,
        combined_interpretation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[enrich-decision-context] error:", err);
    const msg = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
