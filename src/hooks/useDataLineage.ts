/**
 * Hook for managing data lineage graph.
 * Tracks the flow of data from source → transformation → output.
 */
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface LineageNode {
  id: string;
  source_type: string;
  source_id: string;
  source_name: string | null;
  target_type: string;
  target_id: string;
  target_name: string | null;
  transformation: string | null;
  transformation_details: Record<string, unknown>;
  confidence_impact: number | null;
  created_at: string;
}

export function useDataLineage(organizationId: string | undefined) {
  const queryClient = useQueryClient();

  const { data: lineageNodes, isLoading } = useQuery({
    queryKey: ["data-lineage", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("data_lineage")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as unknown as LineageNode[];
    },
    enabled: !!organizationId,
  });

  const recordLineage = useMutation({
    mutationFn: async (entry: {
      organizationId: string;
      sourceType: string;
      sourceId: string;
      sourceName?: string;
      targetType: string;
      targetId: string;
      targetName?: string;
      transformation: string;
      details?: Record<string, unknown>;
      confidenceImpact?: number;
    }) => {
      const { error } = await supabase.from("data_lineage").insert([{
        organization_id: entry.organizationId,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        source_name: entry.sourceName,
        target_type: entry.targetType,
        target_id: entry.targetId,
        target_name: entry.targetName,
        transformation: entry.transformation,
        transformation_details: JSON.parse(JSON.stringify(entry.details || {})),
        confidence_impact: entry.confidenceImpact,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["data-lineage", organizationId] });
    },
  });

  const getLineageForEntity = useCallback(
    (entityType: string, entityId: string) => {
      if (!lineageNodes) return { upstream: [], downstream: [] };

      const upstream = lineageNodes.filter(
        n => n.target_type === entityType && n.target_id === entityId
      );
      const downstream = lineageNodes.filter(
        n => n.source_type === entityType && n.source_id === entityId
      );

      return { upstream, downstream };
    },
    [lineageNodes]
  );

  return {
    lineageNodes: lineageNodes || [],
    isLoading,
    recordLineage: recordLineage.mutateAsync,
    getLineageForEntity,
  };
}
