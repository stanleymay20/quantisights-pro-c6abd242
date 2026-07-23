/**
 * RAG Context Builder — Extracted from embeddings.ts for modularity.
 * 
 * Provides:
 * 1. Entity-to-text serialization for decisions, outcomes, insights
 * 2. RAG context block construction for AI prompt injection
 * 3. Similarity search wrapper
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ═══════════════════════════════════════════════════════
// ENTITY → TEXT SERIALIZATION
// ═══════════════════════════════════════════════════════

export function decisionToText(decision: any): string {
  const parts = [
    `Decision: ${decision.recommended_action}`,
    decision.chosen_action ? `Chosen Action: ${decision.chosen_action}` : null,
    decision.decision_type ? `Type: ${decision.decision_type}` : null,
    decision.notes ? `Notes: ${decision.notes}` : null,
    decision.capped_confidence != null ? `Confidence: ${decision.capped_confidence}%` : null,
    decision.predicted_net_impact != null ? `Predicted Impact: ${decision.predicted_net_impact}` : null,
  ];
  return parts.filter(Boolean).join(" | ");
}

export function outcomeToText(decision: any): string {
  const parts = [
    `Decision: ${decision.recommended_action}`,
    `Outcome Delta: ${decision.outcome_delta > 0 ? "+" : ""}${decision.outcome_delta}%`,
    decision.prediction_accuracy_score != null ? `Accuracy: ${decision.prediction_accuracy_score}%` : null,
    decision.calibration_error != null ? `Calibration Error: ${decision.calibration_error}pp` : null,
    `Status: ${decision.decision_status}`,
  ];
  return parts.filter(Boolean).join(" | ");
}

// ═══════════════════════════════════════════════════════
// VECTOR STORE OPERATIONS
// ═══════════════════════════════════════════════════════

export async function storeEmbedding(
  supabaseUrl: string,
  serviceKey: string,
  orgId: string,
  entityType: string,
  entityId: string,
  contentText: string,
  embedding: number[],
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const svc = createClient(supabaseUrl, serviceKey);
  await svc.from("decision_embeddings").upsert(
    {
      organization_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      content_text: contentText,
      embedding: `[${embedding.join(",")}]`,
      metadata,
    },
    { onConflict: "entity_type,entity_id", ignoreDuplicates: false }
  );
}

export async function searchSimilar(
  supabaseUrl: string,
  serviceKey: string,
  orgId: string,
  queryEmbedding: number[],
  opts: {
    entityTypes?: string[];
    limit?: number;
    minSimilarity?: number;
  } = {}
): Promise<Array<{
  entity_type: string;
  entity_id: string;
  content_text: string;
  metadata: Record<string, unknown>;
  similarity: number;
}>> {
  const svc = createClient(supabaseUrl, serviceKey);
  const limit = opts.limit || 10;
  const minSimilarity = opts.minSimilarity || 0.35;
  const entityTypes = opts.entityTypes || ["decision", "outcome", "insight", "advisory"];
  const vectorStr = `[${queryEmbedding.join(",")}]`;

  const { data, error } = await svc.rpc("match_decision_embeddings" as any, {
    query_embedding: vectorStr,
    match_threshold: minSimilarity,
    match_count: limit,
    filter_org_id: orgId,
    filter_entity_types: entityTypes,
  });

  if (error) {
    console.error("Vector search error:", error);
    return [];
  }

  // NOTE: match_decision_embeddings returns (1 - cosine_distance) as "distance",
  // which is actually the similarity score (0–1). Use it directly.
  return (data || []).map((row: any) => ({
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    content_text: row.content_text,
    metadata: row.metadata || {},
    similarity: row.distance || 0,
  }));
}

// ═══════════════════════════════════════════════════════
// RAG CONTEXT BUILDER
// ═══════════════════════════════════════════════════════

export function buildRAGContext(
  similarResults: Array<{
    entity_type: string;
    content_text: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }>
): string {
  if (similarResults.length === 0) {
    return "INSTITUTIONAL MEMORY: No similar past decisions found. This appears to be a novel decision for this organization.";
  }

  const lines: string[] = [
    `INSTITUTIONAL MEMORY — ${similarResults.length} similar past decisions/outcomes retrieved:`,
    "",
  ];

  for (let i = 0; i < similarResults.length; i++) {
    const r = similarResults[i];
    const meta = r.metadata as any;
    const relevance = Math.round(r.similarity * 100);

    lines.push(`[${i + 1}] (${r.entity_type}, ${relevance}% relevant)`);
    lines.push(`   ${r.content_text.slice(0, 300)}`);

    if (meta.outcome_delta != null) {
      lines.push(`   → Outcome: ${meta.outcome_delta > 0 ? "+" : ""}${meta.outcome_delta}% vs prediction`);
    }
    if (meta.accuracy_score != null) {
      lines.push(`   → Prediction Accuracy: ${meta.accuracy_score}%`);
    }
    if (meta.confidence != null) {
      lines.push(`   → Confidence at decision: ${meta.confidence}%`);
    }
    lines.push("");
  }

  lines.push(
    "INSTRUCTION: Use these historical outcomes to ground your current analysis. " +
    "Reference specific past outcomes when they are relevant. " +
    "If a similar decision had a negative outcome, warn about it explicitly. " +
    "If similar decisions consistently succeeded, note the pattern."
  );

  return lines.join("\n");
}
