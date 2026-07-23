/**
 * Hook for managing schema evolution tracking.
 * Records and displays changes to dataset schemas over time.
 */
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface SchemaChange {
  id: string;
  dataset_id: string;
  version_number: number;
  change_type: string;
  column_name: string | null;
  old_type: string | null;
  new_type: string | null;
  detected_at: string;
  detected_by: string;
  metadata: Record<string, unknown>;
}

export function useSchemaEvolution(organizationId: string | undefined, datasetId?: string) {
  const queryClient = useQueryClient();

  const { data: changes, isLoading } = useQuery({
    queryKey: ["schema-evolution", organizationId, datasetId],
    queryFn: async () => {
      if (!organizationId) return [];
      let query = supabase
        .from("schema_evolution_log")
        .select("*")
        .eq("organization_id", organizationId)
        .order("detected_at", { ascending: false })
        .limit(200);

      if (datasetId) {
        query = query.eq("dataset_id", datasetId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as SchemaChange[];
    },
    enabled: !!organizationId,
  });

  const recordSchemaChange = useMutation({
    mutationFn: async (entry: {
      datasetId: string;
      versionNumber: number;
      changeType: string;
      columnName?: string;
      oldType?: string;
      newType?: string;
      detectedBy?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!organizationId) throw new Error("No organization context");
      const { error } = await supabase.from("schema_evolution_log").insert([{
        organization_id: organizationId,
        dataset_id: entry.datasetId,
        version_number: entry.versionNumber,
        change_type: entry.changeType,
        column_name: entry.columnName,
        old_type: entry.oldType,
        new_type: entry.newType,
        detected_by: entry.detectedBy || "system",
        metadata: JSON.parse(JSON.stringify(entry.metadata || {})),
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schema-evolution", organizationId, datasetId] });
    },
  });

  /** Detect schema changes between two column mappings */
  const detectSchemaChanges = (
    oldMapping: Record<string, string> | null,
    newMapping: Record<string, string> | null
  ): Array<{ changeType: string; columnName: string; oldType?: string; newType?: string }> => {
    if (!oldMapping || !newMapping) return [];

    const changes: Array<{ changeType: string; columnName: string; oldType?: string; newType?: string }> = [];

    // Detect new columns
    for (const [col, type] of Object.entries(newMapping)) {
      if (!(col in oldMapping)) {
        changes.push({ changeType: "column_added", columnName: col, newType: type });
      } else if (oldMapping[col] !== type) {
        changes.push({ changeType: "type_changed", columnName: col, oldType: oldMapping[col], newType: type });
      }
    }

    // Detect removed columns
    for (const col of Object.keys(oldMapping)) {
      if (!(col in newMapping)) {
        changes.push({ changeType: "column_removed", columnName: col, oldType: oldMapping[col] });
      }
    }

    return changes;
  };

  return {
    changes: changes || [],
    isLoading,
    recordSchemaChange: recordSchemaChange.mutateAsync,
    detectSchemaChanges,
  };
}
