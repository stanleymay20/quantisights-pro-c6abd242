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

/**
 * Fast-path hook: fetches pre-aggregated metric summaries from DB function.
 * Returns ~20 rows instead of thousands. Dashboard first paint source.
 */
export const useMetricsSummary = (orgId: string | null, datasetId: string | null) => {
  const [summaries, setSummaries] = useState<MetricTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    if (!orgId || !datasetId) {
      setSummaries([]);
      setLoading(false);
      setHasData(false);
      return;
    }

    const cacheKey = `metrics_summary_${orgId}_${datasetId}`;

    // Stale-while-revalidate: show cached data instantly
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as MetricTypeSummary[];
        setSummaries(parsed);
        setHasData(parsed.length > 0);
        setLoading(false);
      } catch {
        // ignore corrupt cache
      }
    }

    const fetchSummary = async () => {
      if (!cached) setLoading(true);

      const { data, error } = await supabase.rpc("get_metrics_summary", {
        _org_id: orgId,
        _dataset_id: datasetId,
      });

      if (error || !data) {
        if (!cached) {
          const { count } = await supabase
            .from("metrics")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", orgId)
            .eq("dataset_id", datasetId);
          setHasData((count ?? 0) > 0);
          setLoading(false);
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

      setSummaries(mapped);
      if (mapped.length > 0) {
        setHasData(true);
      } else {
        const { count } = await supabase
          .from("metrics")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("dataset_id", datasetId);
        setHasData((count ?? 0) > 0);
      }
      setLoading(false);

      // Cache for instant repeat loads
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(mapped));
      } catch {
        // storage full — ignore
      }
    };

    fetchSummary();
  }, [orgId, datasetId]);

  const topMetrics = summaries.slice(0, 4);

  return { summaries, topMetrics, loading, hasData };
};
