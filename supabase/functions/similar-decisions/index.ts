/**
 * similar-decisions — Hybrid retrieval: deterministic + neural fallback.
 * 
 * v3: When deterministic retrieval yields only weak matches, triggers neural
 * embedding via Lovable AI to extract semantic concepts and re-search.
 * Compares both result sets and returns the stronger one.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticateRequest, verifyOrgMembership } from "../_shared/auth-guard.ts";
import { getCorsHeaders, corsPreflightResponse } from "../_shared/cors.ts";
import { generateEmbedding, searchSimilar } from "../_shared/embeddings.ts";
import { generateNeuralEmbedding } from "../_shared/neural-fallback.ts";

// ═══════════════════════════════════════════════════════
// MATCH QUALITY & DOMAIN CLASSIFICATION
// ═══════════════════════════════════════════════════════

type MatchTier = "strong" | "moderate" | "weak";
type RetrievalSource = "deterministic" | "neural_fallback";

const DOMAIN_CATEGORIES: Record<string, string[]> = {
  sales: ["sales", "revenue", "pipeline", "deal", "acv", "quota", "enterprise", "account", "ae", "booking"],
  retention: ["churn", "retention", "onboarding", "nps", "satisfaction", "renewal", "upsell", "expansion"],
  cost: ["cost", "infrastructure", "serverless", "migration", "optimization", "expense", "margin", "burn"],
  pricing: ["pricing", "tier", "price", "discount", "monetization", "arpu", "package"],
  risk: ["risk", "compliance", "threat", "vulnerability", "escalation", "audit", "governance"],
  growth: ["growth", "market", "expansion", "launch", "geographic", "product", "acquisition"],
  hr: ["employee", "compensation", "salary", "talent", "hiring", "team", "workforce", "recruiting"],
  operations: ["pipeline", "etl", "data", "engineering", "automation", "workflow", "integration"],
  finance: ["budget", "capital", "expenditure", "allocation", "forecast", "planning", "cashflow"],
  executive: ["board", "executive", "summary", "quarterly", "review", "reporting", "strategy"],
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  const scores: [string, number][] = [];
  for (const [cat, keywords] of Object.entries(DOMAIN_CATEGORIES)) {
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > 0) scores.push([cat, score]);
  }
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0]?.[0] || "general";
}

function computeKeywordOverlap(query: string, match: string): string[] {
  const qWords = new Set(query.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3));
  const mWords = new Set(match.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(w => w.length > 3));
  return [...qWords].filter(w => mWords.has(w));
}

function classifyMatch(similarity: number, keywordOverlap: number, categoryMatch: boolean): MatchTier {
  if (similarity >= 0.55 && keywordOverlap >= 2) return "strong";
  if (similarity >= 0.45 && (keywordOverlap >= 1 || categoryMatch)) return "moderate";
  return "weak";
}

function buildMatchRationale(
  tier: MatchTier, similarity: number, overlappingKeywords: string[],
  queryCategory: string, matchCategory: string, source: RetrievalSource,
): string {
  const simPct = Math.round(similarity * 100);
  const prefix = source === "neural_fallback" ? "[Semantic] " : "";
  if (tier === "strong") {
    return `${prefix}Strong match (${simPct}%) — shared keywords: ${overlappingKeywords.slice(0, 4).join(", ")}`;
  }
  if (tier === "moderate") {
    const reason = overlappingKeywords.length > 0
      ? `shared keywords: ${overlappingKeywords.slice(0, 3).join(", ")}`
      : queryCategory === matchCategory
        ? `same domain (${queryCategory})`
        : `related domain (${matchCategory})`;
    return `${prefix}Moderate match (${simPct}%) — ${reason}`;
  }
  return `${prefix}Weak match (${simPct}%) — limited overlap${queryCategory !== matchCategory ? `, different domain (${matchCategory} vs ${queryCategory})` : ""}`;
}

interface EnrichedResult {
  entity_type: string;
  entity_id: string;
  content_text: string;
  metadata: Record<string, unknown>;
  similarity: number;
  match_tier: MatchTier;
  match_rationale: string;
  query_category: string;
  match_category: string;
  overlapping_keywords: string[];
  retrieval_source: RetrievalSource;
}

function enrichResults(
  results: Array<{ entity_type: string; entity_id: string; content_text: string; metadata: Record<string, unknown>; similarity: number }>,
  queryText: string, queryCategory: string, source: RetrievalSource,
): EnrichedResult[] {
  return results.map(r => {
    const overlappingKeywords = computeKeywordOverlap(queryText, r.content_text);
    const matchCategory = detectCategory(r.content_text);
    const categoryMatch = queryCategory === matchCategory;
    const tier = classifyMatch(r.similarity, overlappingKeywords.length, categoryMatch);
    const rationale = buildMatchRationale(tier, r.similarity, overlappingKeywords, queryCategory, matchCategory, source);
    return {
      ...r,
      match_tier: tier,
      match_rationale: rationale,
      query_category: queryCategory,
      match_category: matchCategory,
      overlapping_keywords: overlappingKeywords,
      retrieval_source: source,
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflightResponse(req);
  const corsHeaders = getCorsHeaders(req);
  const auth = await authenticateRequest(req);
  if (auth.response) return auth.response;

  try {
    const { organization_id, query_text } = await req.json();
    if (!organization_id || !query_text) {
      return new Response(JSON.stringify({ error: "organization_id and query_text required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isMember = await verifyOrgMembership(auth.userId, organization_id);
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const queryCategory = detectCategory(query_text);

    // ═══════════════════════════════════════════════════
    // LAYER 1: Deterministic retrieval (always runs)
    // ═══════════════════════════════════════════════════
    const deterministicEmb = await generateEmbedding(query_text);
    const deterministicResults = await searchSimilar(supabaseUrl, serviceKey, organization_id, deterministicEmb, {
      entityTypes: ["decision", "outcome", "insight", "advisory"],
      limit: 15,
      minSimilarity: 0.30,
    });
    const deterministicEnriched = enrichResults(deterministicResults, query_text, queryCategory, "deterministic");
    const deterministicStrong = deterministicEnriched.filter(r => r.match_tier !== "weak");

    // ═══════════════════════════════════════════════════
    // LAYER 2: Neural fallback (only if deterministic is weak)
    // ═══════════════════════════════════════════════════
    let neuralEnriched: EnrichedResult[] = [];
    let neuralConcepts: string[] = [];
    let neuralFallbackUsed = false;

    if (deterministicStrong.length === 0) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (apiKey) {
        try {
          const { embedding: neuralEmb, concepts } = await generateNeuralEmbedding(query_text, apiKey);
          neuralConcepts = concepts;

          if (neuralEmb.length === 768) {
            const neuralResults = await searchSimilar(supabaseUrl, serviceKey, organization_id, neuralEmb, {
              entityTypes: ["decision", "outcome", "insight", "advisory"],
              limit: 15,
              minSimilarity: 0.25, // Lower threshold for neural — concepts are more targeted
            });
            neuralEnriched = enrichResults(neuralResults, query_text, queryCategory, "neural_fallback");
            neuralFallbackUsed = true;
          }
        } catch (e) {
          console.error("Neural fallback error:", e);
          // Continue with deterministic results only
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // MERGE: Pick the stronger result set
    // ═══════════════════════════════════════════════════
    const neuralStrong = neuralEnriched.filter(r => r.match_tier !== "weak");
    let finalEnriched: EnrichedResult[];
    let selectedSource: "deterministic" | "neural_fallback" | "merged";

    if (neuralStrong.length > deterministicStrong.length) {
      // Neural found better matches — use neural but deduplicate
      const seenIds = new Set<string>();
      const merged = [...neuralStrong, ...deterministicStrong].filter(r => {
        if (seenIds.has(r.entity_id)) return false;
        seenIds.add(r.entity_id);
        return true;
      });
      finalEnriched = merged;
      selectedSource = "neural_fallback";
    } else if (deterministicStrong.length > 0) {
      finalEnriched = deterministicStrong;
      selectedSource = "deterministic";
    } else {
      // Both weak — show weak results with proper labeling
      const all = [...deterministicEnriched, ...neuralEnriched];
      const seenIds = new Set<string>();
      finalEnriched = all.filter(r => {
        if (seenIds.has(r.entity_id)) return false;
        seenIds.add(r.entity_id);
        return true;
      }).slice(0, 5);
      selectedSource = neuralFallbackUsed ? "merged" : "deterministic";
    }

    const finalResults = finalEnriched.slice(0, 10);
    const hasStrongMatch = finalResults.some(r => r.match_tier === "strong");
    const hasModerateMatch = finalResults.some(r => r.match_tier === "moderate");

    // ═══════════════════════════════════════════════════
    // HISTORICAL PERFORMANCE (from strong/moderate only)
    // ═══════════════════════════════════════════════════
    const outcomes = finalResults.filter(r => r.entity_type === "outcome" && r.match_tier !== "weak");
    let historicalSuccessRate: number | null = null;
    let avgAccuracy: number | null = null;
    let confidenceAdjustment = 0;

    if (outcomes.length >= 2) {
      const successCount = outcomes.filter(r => {
        const delta = (r.metadata as any)?.outcome_delta;
        return delta != null && delta > 0;
      }).length;
      historicalSuccessRate = Math.round((successCount / outcomes.length) * 100);

      const accuracies = outcomes
        .map(r => (r.metadata as any)?.accuracy_score)
        .filter((a): a is number => a != null);
      if (accuracies.length > 0) {
        avgAccuracy = Math.round(accuracies.reduce((s, v) => s + v, 0) / accuracies.length);
        if (hasStrongMatch) {
          if (avgAccuracy < 50) confidenceAdjustment = -10;
          else if (avgAccuracy < 70) confidenceAdjustment = -5;
          else if (avgAccuracy > 85) confidenceAdjustment = 5;
        } else {
          if (avgAccuracy < 50) confidenceAdjustment = -5;
          else if (avgAccuracy < 70) confidenceAdjustment = -2;
        }
      }
    }

    // Retrieval quality classification
    const retrievalQuality = hasStrongMatch
      ? "high"
      : hasModerateMatch
        ? "moderate"
        : finalResults.length > 0
          ? "low"
          : "none";

    // Precedent type for UI
    const precedentType = hasStrongMatch
      ? "strong_precedent"
      : hasModerateMatch
        ? "partial_precedent"
        : finalResults.length > 0 && neuralFallbackUsed
          ? "semantic_fallback"
          : finalResults.length > 0
            ? "weak_signal"
            : "novel_decision";

    return new Response(JSON.stringify({
      similar: finalResults,
      historical_success_rate: historicalSuccessRate,
      avg_accuracy: avgAccuracy,
      confidence_adjustment: confidenceAdjustment,
      retrieval_quality: retrievalQuality,
      query_category: queryCategory,
      precedent_type: precedentType,
      neural_fallback_used: neuralFallbackUsed,
      neural_concepts: neuralConcepts,
      retrieval_source: selectedSource,
      match_summary: {
        total_candidates: deterministicResults.length + (neuralFallbackUsed ? neuralEnriched.length : 0),
        deterministic_strong: deterministicStrong.length,
        neural_strong: neuralStrong.length,
        strong: finalResults.filter(r => r.match_tier === "strong").length,
        moderate: finalResults.filter(r => r.match_tier === "moderate").length,
        weak: finalResults.filter(r => r.match_tier === "weak").length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
