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
 */
export const useInsights = (orgId: string | null, datasetId: string | null) => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!orgId || !datasetId) {
      setInsights([]);
      setLoading(false);
      setHasMore(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("organization_id", orgId)
        .eq("dataset_id", datasetId)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1); // fetch one extra to detect hasMore

      if (!error && data) {
        const hasNextPage = data.length > PAGE_SIZE;
        setInsights(hasNextPage ? data.slice(0, PAGE_SIZE) : data);
        setHasMore(hasNextPage);
      }
      setLoading(false);
    };

    fetchData();
  }, [orgId, datasetId]);

  const loadMore = useCallback(async () => {
    if (!orgId || !datasetId || !hasMore || loadingMore) return;
    setLoadingMore(true);

    const lastCreatedAt = insights[insights.length - 1]?.created_at;
    if (!lastCreatedAt) {
      setLoadingMore(false);
      return;
    }

    const { data, error } = await supabase
      .from("insights")
      .select("*")
      .eq("organization_id", orgId)
      .eq("dataset_id", datasetId)
      .lt("created_at", lastCreatedAt)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (!error && data) {
      const hasNextPage = data.length > PAGE_SIZE;
      const newItems = hasNextPage ? data.slice(0, PAGE_SIZE) : data;
      setInsights((prev) => [...prev, ...newItems]);
      setHasMore(hasNextPage);
    }
    setLoadingMore(false);
  }, [orgId, datasetId, hasMore, loadingMore, insights]);

  return { insights, loading, loadMore, loadingMore, hasMore };
};
