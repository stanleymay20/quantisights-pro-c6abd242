import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "@/hooks/useSubscription";
import { TierKey } from "@/lib/stripe-tiers";

export interface MetricRow {
  id: string;
  metric_type: string;
  value: number;
  date: string;
  region: string | null;
  segment: string | null;
  dataset_id?: string | null;
}

/** Dynamic summary for any metric type */
export interface MetricTypeSummary {
  metricType: string;
  total: number;
  latest: number;
  count: number;
  trend: "up" | "down" | "flat" | null;
  previousTotal: number | null;
  values: number[];
}

const REALTIME_TIERS: TierKey[] = ["growth", "enterprise"];

/**
 * Hook to fetch metrics — REQUIRES dataset_id (Active Data Contract).
 * Returns BOTH legacy SaaS KPIs (for backward compat) AND dynamic metric summaries.
 */
export const useMetrics = (orgId: string | null, datasetId: string | null) => {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number | null } | null>(null);
  const { subscribed, tier } = useSubscription();

  const canStream = subscribed && tier ? REALTIME_TIERS.includes(tier) : false;

  const updateLastUpdated = useCallback((data: MetricRow[]) => {
    const latest = data.reduce((max, m) => {
      const t = (m as MetricRow & { created_at?: string }).created_at;
      return t && t > max ? t : max;
    }, "");
    setLastUpdated(latest || null);
  }, []);

  // Initial fetch — MANDATORY dataset_id
  useEffect(() => {
    if (!orgId || !datasetId) {
      setMetrics([]);
      setLoading(false);
      setLastUpdated(null);
      return;
    }

    const fetchMetrics = async () => {
      setLoading(true);
      setLoadingProgress({ loaded: 0, total: null });
      // Paginated fetch with safety cap to prevent client-side memory crashes
      const allMetrics: MetricRow[] = [];
      const PAGE_SIZE = 1000;
      const MAX_CLIENT_ROWS = 50_000; // Safety cap: ~50K rows ≈ 10MB in memory
      let offset = 0;
      let hasMore = true;
      let pageNum = 0;

      while (hasMore) {
        pageNum++;
        const { data, error } = await supabase
          .from("metrics")
          .select("id, metric_type, value, date, region, segment, dataset_id, created_at")
          .eq("organization_id", orgId)
          .eq("dataset_id", datasetId)
          .order("date", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error || !data) break;
        allMetrics.push(...data);
        setLoadingProgress({ loaded: allMetrics.length, total: data.length === PAGE_SIZE ? null : allMetrics.length });
        hasMore = data.length === PAGE_SIZE && allMetrics.length < MAX_CLIENT_ROWS;
        offset += PAGE_SIZE;
      }

      if (allMetrics.length >= MAX_CLIENT_ROWS) {
        console.warn(`[useMetrics] Dataset ${datasetId} capped at ${MAX_CLIENT_ROWS} rows to prevent memory issues. Consider server-side aggregation.`);
      }

      setMetrics(allMetrics);
      updateLastUpdated(allMetrics);
      setLoading(false);
      setLoadingProgress(null);
    };

    fetchMetrics();
  }, [orgId, datasetId, updateLastUpdated]);

  // Realtime subscription (Growth+ only) — per-instance unique topic name
  // prevents any possibility of reusing a subscribed channel across
  // StrictMode remounts or concurrent hook instances.
  useEffect(() => {
    if (!orgId || !datasetId || !canStream) {
      setIsStreaming(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const uniq = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      channel = supabase
        .channel(`metrics-live-${orgId}-${datasetId}-${uniq}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "metrics", filter: `organization_id=eq.${orgId}` },
          (payload) => {
            const newRow = payload.new as MetricRow & { created_at?: string };
            if (newRow.dataset_id !== datasetId) return;
            setMetrics((prev) => [...prev, newRow].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            setLastUpdated(newRow.created_at || new Date().toISOString());
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "metrics", filter: `organization_id=eq.${orgId}` },
          (payload) => {
            const updated = payload.new as MetricRow;
            if (updated.dataset_id !== datasetId) return;
            setMetrics((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "metrics", filter: `organization_id=eq.${orgId}` },
          (payload) => {
            const deleted = payload.old as { id: string };
            setMetrics((prev) => prev.filter((m) => m.id !== deleted.id));
          }
        )
        .subscribe((status) => {
          setIsStreaming(status === "SUBSCRIBED");
        });
    } catch (err) {
      console.warn("[useMetrics] realtime subscribe failed:", err);
      setIsStreaming(false);
    }

    return () => {
      setIsStreaming(false);
      if (channel) { try { supabase.removeChannel(channel); } catch { /* noop */ } }
    };
  }, [orgId, datasetId, canStream]);

  // ═══════════════════════════════════════════════════════
  // DYNAMIC METRIC SUMMARIES — domain-agnostic
  // ═══════════════════════════════════════════════════════

  /** All unique metric types in the dataset */
  const metricTypes = useMemo(() => {
    return [...new Set(metrics.map((m) => m.metric_type))];
  }, [metrics]);

  /** Dynamic summary per metric type — sorted by total descending */
  const metricSummaries = useMemo((): MetricTypeSummary[] => {
    const byType = new Map<string, MetricRow[]>();
    metrics.forEach((m) => {
      const list = byType.get(m.metric_type) || [];
      list.push(m);
      byType.set(m.metric_type, list);
    });

    return Array.from(byType.entries())
      .map(([metricType, rows]) => {
        const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
        const total = rows.reduce((s, r) => s + Number(r.value), 0);
        const latest = sorted[sorted.length - 1]?.value ?? 0;

        // Compute trend: compare first half vs second half
        let trend: "up" | "down" | "flat" | null = null;
        let previousTotal: number | null = null;
        if (sorted.length >= 2) {
          const mid = Math.floor(sorted.length / 2);
          const firstHalf = sorted.slice(0, mid).reduce((s, r) => s + Number(r.value), 0);
          const secondHalf = sorted.slice(mid).reduce((s, r) => s + Number(r.value), 0);
          previousTotal = firstHalf;
          const changePct = firstHalf !== 0 ? ((secondHalf - firstHalf) / Math.abs(firstHalf)) * 100 : 0;
          trend = Math.abs(changePct) < 1 ? "flat" : changePct > 0 ? "up" : "down";
        }

        return { metricType, total, latest, count: rows.length, trend, previousTotal, values: sorted.map(r => Number(r.value)) };
      })
      .sort((a, b) => b.count - a.count);
  }, [metrics]);

  /** Top N metric summaries for KPI display */
  const topMetrics = useMemo(() => metricSummaries.slice(0, 4), [metricSummaries]);

  // ═══════════════════════════════════════════════════════
  // LEGACY SaaS KPIs — backward compatibility
  // ═══════════════════════════════════════════════════════

  const totalRevenue = metrics
    .filter((m) => m.metric_type === "revenue")
    .reduce((s, m) => s + Number(m.value), 0);

  const totalCustomers = metrics
    .filter((m) => m.metric_type === "customers")
    .reduce((s, m) => s + Number(m.value), 0);

  const latestCost = metrics.filter((m) => m.metric_type === "cost").slice(-1)[0]?.value ?? 0;
  const latestChurn = metrics.filter((m) => m.metric_type === "churn").slice(-1)[0]?.value ?? 0;

  const revenueByMonth = metrics
    .filter((m) => m.metric_type === "revenue")
    .map((m) => ({
      month: new Date(m.date).toLocaleDateString("en", { month: "short" }),
      revenue: Number(m.value),
    }));

  const segmentData = metrics
    .filter((m) => m.metric_type === "revenue" && m.segment)
    .reduce<Record<string, number>>((acc, m) => {
      acc[m.segment!] = (acc[m.segment!] || 0) + Number(m.value);
      return acc;
    }, {});

  return {
    metrics,
    loading,
    lastUpdated,
    isStreaming,
    canStream,
    // Dynamic (domain-agnostic)
    metricTypes,
    metricSummaries,
    topMetrics,
    // Legacy SaaS
    totalRevenue,
    totalCustomers,
    latestCost,
    latestChurn,
    revenueByMonth,
    segmentData,
    hasData: metrics.length > 0,
    loadingProgress,
  };
};
