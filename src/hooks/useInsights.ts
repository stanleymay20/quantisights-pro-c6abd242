import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Insight {
  id: string;
  message: string;
  severity: string;
  category: string | null;
  is_read: boolean;
  created_at: string;
  confidence_score?: number;
  generation_model?: string;
  raw_confidence?: number | null;
  capped_confidence?: number | null;
  confidence_cap_reason?: string | null;
  sample_size?: number | null;
  variance_score?: number | null;
  data_quality_index?: number | null;
}

const PAGE_SIZE = 20;

/**
 * Hook to fetch insights — REQUIRES dataset_id (Active Data Contract).
 * Supports paginated "Load more" pattern.
 *
 * An unavailable query is not equivalent to an empty insight set. `error`
 * remains explicit so executive surfaces can withhold an all-clear state.
 */
export const useInsights = (orgId: string | null, datasetId: string | null) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!orgId || !datasetId) {
      setInsights([]);
      setLoading(false);
      setHasMore(false);
      setError(null);
      return () => { cancelled = true; };
    }

    // Never carry evidence from a previous dataset across a context switch.
    setInsights([]);
    setHasMore(false);
    setError(null);

    const fetchData = async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("insights")
        .select("*")
        .eq("organization_id", orgId)
        .eq("dataset_id", datasetId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1); // fetch one extra to detect hasMore

      if (cancelled) return;

      if (queryError) {
        console.warn("[useInsights] Insight query failed:", queryError.message);
        setInsights([]);
        setHasMore(false);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      const hasNextPage = rows.length > PAGE_SIZE;
      setInsights(hasNextPage ? rows.slice(0, PAGE_SIZE) : rows);
      setHasMore(hasNextPage);
      setError(null);
      setLoading(false);
    };

    void fetchData();
    return () => { cancelled = true; };
  }, [orgId, datasetId]);

  const loadMore = useCallback(async () => {
    if (!orgId || !datasetId || !hasMore || loadingMore) return;
    setLoadingMore(true);

    const lastCreatedAt = insights[insights.length - 1]?.created_at;
    if (!lastCreatedAt) {
      setLoadingMore(false);
      return;
    }

    const { data, error: queryError } = await supabase
      .from("insights")
      .select("*")
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId)
      .lt("created_at", lastCreatedAt)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (queryError) {
      console.warn("[useInsights] Insight pagination failed:", queryError.message);
      // Keep the already verified first pages visible, but make the incomplete
      // pagination state explicit and stop claiming that pagination is healthy.
      setError(queryError.message);
      setLoadingMore(false);
      return;
    }

    const rows = data ?? [];
    const hasNextPage = rows.length > PAGE_SIZE;
    const newItems = hasNextPage ? rows.slice(0, PAGE_SIZE) : rows;
    setInsights((prev) => [...prev, ...newItems]);
    setHasMore(hasNextPage);
    setError(null);
    setLoadingMore(false);
  }, [orgId, datasetId, hasMore, loadingMore, insights]);

  return { insights, loading, loadMore, loadingMore, hasMore, error };
};
