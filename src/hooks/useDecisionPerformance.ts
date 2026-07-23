import { useEffect, useState, useCallback } from "react";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";

interface MetricBreakdown {
  metric: string;
  total: number;
  successRate: number;
  avgAccuracy: number | null;
}

export interface DecisionPerformance {
  totalDecisions: number;
  evaluableDecisions: number;
  successCount: number;
  successRate: number | null;
  negativeCount: number;
  falsePositiveRate: number | null;
  avgAccuracy: number | null;
  calibrationGap: number | null;
  metricBreakdown: MetricBreakdown[];
  learnings: string[];
}

export const useDecisionPerformance = (orgId: string | null) => {
  const [performance, setPerformance] = useState<DecisionPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPerformance = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);

    try {
      const auth = await getVerifiedAuth();
      if (!auth) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      const { data, error: fnErr } = await invokeWithRetry<Record<string, unknown>>("evaluate-outcomes", {
        body: { action: "performance", organization_id: orgId },
        headers: authHeaders(auth),
      });

      if (fnErr) {
        setError(fnErr.message);
      } else if (data) {
        setPerformance({
          totalDecisions: (data.total_decisions as number) ?? 0,
          evaluableDecisions: (data.evaluable_decisions as number) ?? 0,
          successCount: (data.success_count as number) ?? 0,
          successRate: (data.success_rate as number) ?? null,
          negativeCount: (data.negative_count as number) ?? 0,
          falsePositiveRate: (data.false_positive_rate as number) ?? null,
          avgAccuracy: (data.avg_accuracy as number) ?? null,
          calibrationGap: (data.calibration_gap as number) ?? null,
          metricBreakdown: (data.metric_breakdown as MetricBreakdown[]) ?? [],
          learnings: (data.learnings as string[]) ?? [],
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchPerformance();
  }, [fetchPerformance]);

  return { performance, loading, error, refresh: fetchPerformance };
};

export const scheduleOutcomeEvaluation = async (params: {
  organizationId: string;
  decisionId: string;
  datasetId?: string;
  expectedMetric: string;
  expectedDirection?: string;
  expectedChange?: number;
  evaluationWindowDays?: number;
}) => {
  const auth = await getVerifiedAuth();
  if (!auth) throw new Error("Not authenticated");

  const { data, error } = await invokeWithRetry("evaluate-outcomes", {
    body: {
      action: "schedule",
      organization_id: params.organizationId,
      decision_id: params.decisionId,
      dataset_id: params.datasetId,
      expected_metric: params.expectedMetric,
      expected_direction: params.expectedDirection || "increase",
      expected_change: params.expectedChange,
      evaluation_window_days: params.evaluationWindowDays || 30,
    },
    headers: authHeaders(auth),
  });

  if (error) throw error;
  return data;
};

export const getReliabilityIndex = async (orgId: string, metricType: string) => {
  const auth = await getVerifiedAuth();
  if (!auth) throw new Error("Not authenticated");

  const { data, error } = await invokeWithRetry<{ metric_type: string; similar_decisions: number; reliability_index: number | null; note: string }>(
    "evaluate-outcomes",
    {
      body: { action: "reliability", organization_id: orgId, metric_type: metricType },
      headers: authHeaders(auth),
    },
  );

  if (error) throw error;
  return data;
};
