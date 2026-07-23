/**
 * Hook for calling the server-side ML engine edge function.
 * Provides typed wrappers for all ML algorithms.
 * Cache is org-scoped and clears on org switch.
 */
import { useState, useCallback, useEffect } from "react";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import type {
  KMeansResult,
  ARIMAResult,
  DecisionTreeResult,
  IsolationForestResult,
  CohortResult,
  ABTestResult,
} from "./useMLTypes";

export type { KMeansResult, ARIMAResult, DecisionTreeResult, IsolationForestResult, CohortResult, ABTestResult };

interface MLState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// Lightweight in-memory cache for ML results (TTL-based, org-scoped)
const ML_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes
const mlCache = new Map<string, { result: unknown; timestamp: number }>();

/** Clear the entire ML cache — called on org switch to prevent cross-tenant leakage */
export function clearMLCache() {
  mlCache.clear();
}

// Listen for org-switch events to clear cache
if (typeof window !== "undefined") {
  window.addEventListener("quantivis:org-switch", () => clearMLCache());
}

function buildCacheKey(algorithm: string, params: Record<string, unknown>): string {
  return `${algorithm}:${JSON.stringify(params)}`;
}

function getCached<T>(key: string): T | null {
  const entry = mlCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ML_CACHE_TTL_MS) {
    mlCache.delete(key);
    return null;
  }
  return entry.result as T;
}

function setCache(key: string, result: unknown) {
  mlCache.set(key, { result, timestamp: Date.now() });
  // Evict stale entries if cache grows too large
  if (mlCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of mlCache) {
      if (now - v.timestamp > ML_CACHE_TTL_MS) mlCache.delete(k);
    }
  }
}

function useMLCall<T>() {
  const [state, setState] = useState<MLState<T>>({ data: null, loading: false, error: null });

  const call = useCallback(async (algorithm: string, params: Record<string, unknown>): Promise<T | null> => {
    const cacheKey = buildCacheKey(algorithm, params);
    const cached = getCached<T>(cacheKey);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return cached;
    }

    setState({ data: null, loading: true, error: null });
    try {
      const { data, error } = await invokeWithRetry<{ error?: string; result: T }>("ml-engine", {
        body: { algorithm, params },
      });
      if (error) throw new Error(error.message || "ML engine error");
      if (data?.error) throw new Error(data.error);
      const result = data?.result as T;
      setCache(cacheKey, result);
      setState({ data: result, loading: false, error: null });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setState({ data: null, loading: false, error: msg });
      return null;
    }
  }, []);

  return { ...state, call };
}

export function useKMeans() {
  const { data, loading, error, call } = useMLCall<KMeansResult>();
  const cluster = useCallback(
    (numericData: number[][], k: number, maxIterations?: number) =>
      call("kmeans", { data: numericData, k, maxIterations }),
    [call]
  );
  return { result: data, loading, error, cluster };
}

export function useARIMA() {
  const { data, loading, error, call } = useMLCall<ARIMAResult>();
  const forecast = useCallback(
    (series: number[], horizons?: number, order?: { p: number; d: number; q: number }) =>
      call("arima", { series, horizons, order }),
    [call]
  );
  return { result: data, loading, error, forecast };
}

export function useDecisionTree() {
  const { data, loading, error, call } = useMLCall<DecisionTreeResult>();
  const train = useCallback(
    (features: number[][], labels: string[], featureNames: string[], maxDepth?: number) =>
      call("decision_tree", { features, labels, featureNames, maxDepth }),
    [call]
  );
  return { result: data, loading, error, train };
}

export function useIsolationForest() {
  const { data, loading, error, call } = useMLCall<IsolationForestResult>();
  const detect = useCallback(
    (numericData: number[][], numTrees?: number, contamination?: number) =>
      call("isolation_forest", { data: numericData, numTrees, contamination }),
    [call]
  );
  return { result: data, loading, error, detect };
}

export function useCohortAnalysis() {
  const { data, loading, error, call } = useMLCall<CohortResult>();
  const analyze = useCallback(
    (events: Array<{ userId: string; date: string; value?: number }>, periodType?: "week" | "month") =>
      call("cohort_analysis", { events, periodType }),
    [call]
  );
  return { result: data, loading, error, analyze };
}

export function useABTest() {
  const { data, loading, error, call } = useMLCall<ABTestResult>();
  const test = useCallback(
    (controlValues: number[], treatmentValues: number[], alpha?: number) =>
      call("ab_test", { controlValues, treatmentValues, alpha }),
    [call]
  );
  return { result: data, loading, error, test };
}
