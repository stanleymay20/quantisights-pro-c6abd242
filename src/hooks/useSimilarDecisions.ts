/**
 * Hook to fetch similar past decisions with hybrid retrieval and match quality.
 */
import { useState, useCallback } from "react";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";

export interface SimilarDecision {
  entity_type: string;
  entity_id: string;
  content_text: string;
  similarity: number;
  match_tier: "strong" | "moderate" | "weak";
  match_rationale: string;
  query_category: string;
  match_category: string;
  overlapping_keywords: string[];
  retrieval_source: "deterministic" | "neural_fallback";
  metadata: {
    decision_type?: string;
    confidence?: number;
    status?: string;
    outcome_delta?: number;
    accuracy_score?: number;
    calibration_error?: number;
  };
}

export type RetrievalQuality = "high" | "moderate" | "low" | "none";
export type PrecedentType = "strong_precedent" | "partial_precedent" | "semantic_fallback" | "weak_signal" | "novel_decision";

export interface MatchSummary {
  total_candidates: number;
  deterministic_strong: number;
  neural_strong: number;
  strong: number;
  moderate: number;
  weak: number;
}

export interface SimilarDecisionsResult {
  similar: SimilarDecision[];
  loading: boolean;
  error: string | null;
  historicalSuccessRate: number | null;
  avgAccuracy: number | null;
  confidenceAdjustment: number;
  retrievalQuality: RetrievalQuality;
  precedentType: PrecedentType;
  queryCategory: string | null;
  neuralFallbackUsed: boolean;
  neuralConcepts: string[];
  matchSummary: MatchSummary | null;
  fetch: (queryText: string) => Promise<void>;
}

export const useSimilarDecisions = (organizationId: string | null): SimilarDecisionsResult => {
  const [similar, setSimilar] = useState<SimilarDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historicalSuccessRate, setHistoricalSuccessRate] = useState<number | null>(null);
  const [avgAccuracy, setAvgAccuracy] = useState<number | null>(null);
  const [confidenceAdjustment, setConfidenceAdjustment] = useState(0);
  const [retrievalQuality, setRetrievalQuality] = useState<RetrievalQuality>("none");
  const [precedentType, setPrecedentType] = useState<PrecedentType>("novel_decision");
  const [queryCategory, setQueryCategory] = useState<string | null>(null);
  const [neuralFallbackUsed, setNeuralFallbackUsed] = useState(false);
  const [neuralConcepts, setNeuralConcepts] = useState<string[]>([]);
  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);

  const fetchSimilar = useCallback(async (queryText: string) => {
    if (!organizationId || !queryText) return;
    setLoading(true);
    setError(null);

    try {
      const auth = await getVerifiedAuth();
      if (!auth) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const { data, error: fnErr } = await invokeWithRetry<Record<string, unknown>>("similar-decisions", {
        body: { organization_id: organizationId, query_text: queryText },
        headers: authHeaders(auth),
      });

      if (fnErr) {
        setError(fnErr.message);
      } else if (data) {
        setSimilar((data.similar as SimilarDecision[]) || []);
        setHistoricalSuccessRate((data.historical_success_rate as number) ?? null);
        setAvgAccuracy((data.avg_accuracy as number) ?? null);
        setConfidenceAdjustment((data.confidence_adjustment as number) ?? 0);
        setRetrievalQuality((data.retrieval_quality as RetrievalQuality) ?? "none");
        setPrecedentType((data.precedent_type as PrecedentType) ?? "novel_decision");
        setQueryCategory((data.query_category as string) ?? null);
        setNeuralFallbackUsed((data.neural_fallback_used as boolean) ?? false);
        setNeuralConcepts((data.neural_concepts as string[]) ?? []);
        setMatchSummary((data.match_summary as MatchSummary) ?? null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
    setLoading(false);
  }, [organizationId]);

  return {
    similar, loading, error, historicalSuccessRate, avgAccuracy,
    confidenceAdjustment, retrievalQuality, precedentType, queryCategory,
    neuralFallbackUsed, neuralConcepts, matchSummary, fetch: fetchSimilar,
  };
};
