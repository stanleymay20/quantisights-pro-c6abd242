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
const PAGE_SIZE = 1000;
const MAX_CLIENT_ROWS = 50_000;

/**
 * Hook to fetch metrics — REQUIRES dataset_id (Active Data Contract).
 * Returns BOTH legacy SaaS KPIs (for backward compat) AND dynamic metric summaries.
 *
 * Trust contract: this hook never presents a partially loaded raw dataset as a
 * complete one. Query failures discard partial pages. Datasets above the client
 * safety ceiling are marked truncated and must be served through aggregates or
 * another bounded/server-side path.
 */
export const useMetrics = (orgId: string | null, datasetId: string | null) => {
  const [metrics, setMetrics] = useState<MetricRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
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
      setLoadError(null);
      setIsTruncated(false);
      setLastUpdated(null);
      return;
    }

    let cancelled = false;

    const failClosed = (message: string, truncated = false) => {
      if (cancelled) return;
      setMetrics([]);
      setLastUpdated(null);
      setLoadError(message);
      setIsTruncated(truncated);
      setLoading(false);
      setLoadingProgress(null);
    };

    const fetchMetrics = async () => {
      setLoading(true);
      setLoadError(null);
      setIsTruncated(false);
      setLoadingProgress({ loaded: 0, total: null });

      const allMetrics: MetricRow[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("metrics")
          .select("id, metric_type, value, date, region, segment, dataset_id, created_at")
          .eq("organization_id", orgId)
          .eq("dataset_id", datasetId)
          .order("date", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (cancelled) return;
        if (error) {
          failClosed(`Metric data could not be loaded completely: ${error.message}`);
          return;
        }
        if (!data) {
          failClosed("Metric data could not be loaded completely: the database returned no page payload.");
          return;
        }

        allMetrics.push(...data);
        setLoadingProgress({
          loaded: allMetrics.length,
          total: data.length === PAGE_SIZE ? null : allMetrics.length,
        });

        if (data.length < PAGE_SIZE) {
          hasMore = false;
          break;
        }

        offset += PAGE_SIZE;
        if (allMetrics.length >= MAX_CLIENT_ROWS) {
          // A full final page does not prove there are more rows. Probe exactly
          // one row beyond the ceiling before declaring the view truncated.
          const { data: overflow, error: overflowError } = await supabase
            .from("metrics")
            .select("id")
            .eq("organization_id", orgId)
            .eq("dataset_id", datasetId)
            .order("date", { ascending: true })
            .range(MAX_CLIENT_ROWS, MAX_CLIENT_ROWS);

          if (cancelled) return;
          if (overflowError) {
            failClosed(`Metric volume boundary could not be verified: ${overflowError.message}`);
            return;
          }
          if ((overflow?.length ?? 0) > 0) {
            console.warn(`[useMetrics] Dataset ${datasetId} exceeds ${MAX_CLIENT_ROWS} client rows; refusing to compute KPIs from a partial raw slice.`);
            failClosed(
              `This dataset exceeds the ${MAX_CLIENT_ROWS.toLocaleString()}-row client safety limit. Use server-side aggregates or a bounded drill-down instead of partial raw metrics.`,
              true,
            );
            return;
          }
          hasMore = false;
        }
      }

      if (cancelled) return;
      setMetrics(allMetrics);
      updateLastUpdated(allMetrics);
      setLoadError(null);
      setIsTruncated(false);
      setLoading(false);
      setLoadingProgress(null);
    };

    void fetchMetrics();
    return () => { cancelled = true; };
  }, [orgId, datasetId, updateLastUpdated]);

  // Realtime subscription (Growth+ only) — per-instance unique topic name
  // prevents any possibility of reusing a subscribed channel across
  // StrictMode remounts or concurrent hook instances.
  useEffect(() => {
    if (!orgId || !datasetId || !canStream || loadError || isTruncated) {
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
  }, [orgId, datasetId, canStream, loadError, isTruncated]);

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
    loadError,
    isTruncated,
    lastUpdated,
    isStreaming,
    canStream,
    metricTypes,
    metricSummaries,
    topMetrics,
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
