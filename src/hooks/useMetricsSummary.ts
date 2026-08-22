import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { MetricTypeSummary } from "@/hooks/useMetrics";

interface SummaryRow {
  metric_type: string;
  total: number;
  latest_value: number;
  latest_date: string;
  row_count: number;
  trend: string;
  previous_half_total: number;
}

interface SummaryCacheEntry {
  cachedAt: string;
  summaries: MetricTypeSummary[];
}

/**
 * Fast-path hook: fetches pre-aggregated metric summaries from DB function.
 * Returns ~20 rows instead of thousands. Dashboard first paint source.
 *
 * Cached values are explicitly marked stale until live revalidation succeeds.
 * A summary outage never falls back to an exact raw-table count; dataset row
 * metadata is the O(1) existence fallback for enterprise-scale datasets.
 */
export const useMetricsSummary = (orgId: string | null, datasetId: string | null) => {
  const [summaries, setSummaries] = useState<MetricTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!orgId || !datasetId) {
      setSummaries([]);
      setLoading(false);
      setHasData(false);
      setStale(false);
      setError(null);
      setCachedAt(null);
      return () => { cancelled = true; };
    }

    const cacheKey = `metrics_summary_${orgId}_${datasetId}`;
    let cachedSummaries: MetricTypeSummary[] | null = null;

    // Stale-while-revalidate: cached values can accelerate first paint, but are
    // never represented as freshly verified until the RPC succeeds.
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as SummaryCacheEntry | MetricTypeSummary[];
        if (Array.isArray(parsed)) {
          // Backward compatibility for old cache entries created before cache
          // freshness metadata was introduced.
          cachedSummaries = parsed;
          setCachedAt(null);
        } else if (Array.isArray(parsed?.summaries)) {
          cachedSummaries = parsed.summaries;
          setCachedAt(typeof parsed.cachedAt === "string" ? parsed.cachedAt : null);
        }
        if (cachedSummaries) {
          setSummaries(cachedSummaries);
          setHasData(cachedSummaries.length > 0);
          setStale(true);
          setLoading(false);
        }
      } catch {
        sessionStorage.removeItem(cacheKey);
      }
    }

    const loadDatasetHasData = async (): Promise<boolean> => {
      const { data, error: datasetError } = await supabase
        .from("datasets")
        .select("row_count")
        .eq("id", datasetId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (datasetError) throw new Error(`Dataset metadata fallback failed: ${datasetError.message}`);
      return Number(data?.row_count ?? 0) > 0;
    };

    const fetchSummary = async () => {
      if (!cachedSummaries) setLoading(true);
      setError(null);

      const { data, error: rpcError } = await supabase.rpc("get_metrics_summary", {
        _org_id: orgId,
        _dataset_id: datasetId,
      });

      if (cancelled) return;

      if (rpcError || !data) {
        const message = rpcError?.message ?? "Metric summary revalidation returned no data";
        setError(message);
        setStale(!!cachedSummaries);

        if (!cachedSummaries) {
          try {
            setHasData(await loadDatasetHasData());
          } catch (fallbackError) {
            if (!cancelled) {
              setHasData(false);
              setError(fallbackError instanceof Error ? `${message}; ${fallbackError.message}` : message);
            }
          }
          if (!cancelled) setLoading(false);
        }
        return;
      }

      const rows = data as unknown as SummaryRow[];
      const mapped: MetricTypeSummary[] = rows.map((r) => ({
        metricType: r.metric_type,
        total: Number(r.total),
        latest: Number(r.latest_value),
        count: Number(r.row_count),
        trend: (r.trend === "up" || r.trend === "down" || r.trend === "flat") ? r.trend : "flat",
        previousTotal: r.previous_half_total != null ? Number(r.previous_half_total) : null,
        values: [], // not available from summary — charts use full useMetrics
      }));

      if (cancelled) return;
      setSummaries(mapped);
      setStale(false);
      setError(null);

      if (mapped.length > 0) {
        setHasData(true);
      } else {
        try {
          setHasData(await loadDatasetHasData());
        } catch (fallbackError) {
          if (!cancelled) {
            setHasData(false);
            setError(fallbackError instanceof Error ? fallbackError.message : "Dataset metadata fallback failed");
          }
        }
      }

      if (cancelled) return;
      setLoading(false);
      const now = new Date().toISOString();
      setCachedAt(now);

      try {
        const entry: SummaryCacheEntry = { cachedAt: now, summaries: mapped };
        sessionStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch {
        // Storage capacity is non-critical. Fresh in-memory data remains valid.
      }
    };

    void fetchSummary();
    return () => { cancelled = true; };
  }, [orgId, datasetId]);

  const topMetrics = summaries.slice(0, 4);

  return { summaries, topMetrics, loading, hasData, stale, error, cachedAt };
};
