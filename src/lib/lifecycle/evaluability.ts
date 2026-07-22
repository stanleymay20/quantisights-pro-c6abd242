/**
 * Pre-approval evaluability gate — determines whether a decision
 * can be meaningfully evaluated after approval.
 */
import { supabase } from "@/integrations/supabase/client";

export type EvaluabilityStatus = "MEASURABLE" | "PARTIALLY_MEASURABLE" | "NOT_MEASURABLE";

export interface EvaluabilityResult {
  status: EvaluabilityStatus;
  score: number;
  maxScore: number;
  hasDataset: boolean;
  hasMetric: boolean;
  dataPoints: number;
  distinctDates: number;
  resolvedDatasetId: string | null;
  resolvedMetric: string | null;
  reasons: string[];
  suggestions: string[];
}

/**
 * Check whether a decision can be meaningfully evaluated post-approval.
 * Calls the DB RPC for authoritative, reusable evaluation.
 */
export async function checkEvaluability(
  orgId: string,
  datasetId: string | null,
  expectedMetric: string | null
): Promise<EvaluabilityResult> {
  const { data, error } = await supabase.rpc("check_decision_evaluability", {
    _org_id: orgId,
    _dataset_id: datasetId,
    _expected_metric: expectedMetric,
  });

  if (error || !data) {
    console.error("[evaluability] RPC failed:", error);
    return {
      status: "NOT_MEASURABLE",
      score: 0,
      maxScore: 3,
      hasDataset: false,
      hasMetric: false,
      dataPoints: 0,
      distinctDates: 0,
      resolvedDatasetId: null,
      resolvedMetric: null,
      reasons: ["Evaluability check failed — system error"],
      suggestions: ["Retry or contact support"],
    };
  }

  const d = data as Record<string, unknown>;
  return {
    status: (d.status as EvaluabilityStatus) ?? "NOT_MEASURABLE",
    score: Number(d.score ?? 0),
    maxScore: Number(d.max_score ?? 3),
    hasDataset: Boolean(d.has_dataset),
    hasMetric: Boolean(d.has_metric),
    dataPoints: Number(d.data_points ?? 0),
    distinctDates: Number(d.distinct_dates ?? 0),
    resolvedDatasetId: (d.resolved_dataset_id as string) ?? null,
    resolvedMetric: (d.resolved_metric as string) ?? null,
    reasons: (d.reasons as string[]) ?? [],
    suggestions: (d.suggestions as string[]) ?? [],
  };
}

/** Color helpers for UI */
export function evaluabilityColor(status: EvaluabilityStatus) {
  switch (status) {
    case "MEASURABLE": return "text-emerald-400";
    case "PARTIALLY_MEASURABLE": return "text-amber-400";
    case "NOT_MEASURABLE": return "text-red-400";
  }
}

export function evaluabilityBadgeVariant(status: EvaluabilityStatus) {
  switch (status) {
    case "MEASURABLE": return "default" as const;
    case "PARTIALLY_MEASURABLE": return "secondary" as const;
    case "NOT_MEASURABLE": return "destructive" as const;
  }
}
