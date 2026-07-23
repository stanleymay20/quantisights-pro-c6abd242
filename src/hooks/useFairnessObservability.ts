import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useFairnessAssessments(orgId: string | null) {
  return useQuery({
    queryKey: ["fairness-assessments", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fairness_assessments")
        .select("*")
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useModelDrift(orgId: string | null) {
  return useQuery({
    queryKey: ["model-drift", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("model_drift_snapshots")
        .select("*")
        .eq("organization_id", orgId!)
        .order("snapshot_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}
