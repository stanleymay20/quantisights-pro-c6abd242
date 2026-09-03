import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";

interface QuotaLimits {
  max_datasets: number;
  max_rows_per_day: number;
  max_api_calls_per_day: number;
  max_simulations_per_day: number;
  max_copilot_queries_per_day: number;
  max_team_seats: number;
}

interface QuotaCheck {
  current_usage: number;
  quota_limit: number;
  allowed: boolean;
  remaining: number;
  reason?: string;
}

const DEFAULT_LIMITS: QuotaLimits = {
  max_datasets: 1,
  max_rows_per_day: 50000,
  max_api_calls_per_day: 100,
  max_simulations_per_day: 5,
  max_copilot_queries_per_day: 0,
  max_team_seats: 2,
};

const DENIED_QUOTA: QuotaCheck = {
  current_usage: 0,
  quota_limit: 0,
  allowed: false,
  remaining: 0,
  reason: "quota_verification_unavailable",
};

export const useWorkspaceQuota = () => {
  const { currentWorkspaceId } = useWorkspace();
  const [limits, setLimits] = useState<QuotaLimits>(DEFAULT_LIMITS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!currentWorkspaceId) {
      setLimits(DEFAULT_LIMITS);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const fetchLimits = async () => {
      const { data, error } = await supabase
        .from("workspace_quotas")
        .select("max_datasets,max_rows_per_day,max_api_calls_per_day,max_simulations_per_day,max_copilot_queries_per_day,max_team_seats")
        .eq("workspace_id", currentWorkspaceId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        // Display conservative defaults while the authoritative quota RPC remains
        // fail-closed. Never manufacture an "unlimited" state from missing data.
        setLimits(DEFAULT_LIMITS);
        setLoading(false);
        return;
      }

      setLimits({
        max_datasets: data.max_datasets,
        max_rows_per_day: data.max_rows_per_day,
        max_api_calls_per_day: data.max_api_calls_per_day,
        max_simulations_per_day: data.max_simulations_per_day,
        max_copilot_queries_per_day: data.max_copilot_queries_per_day,
        max_team_seats: data.max_team_seats,
      });
      setLoading(false);
    };

    void fetchLimits();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId]);

  const checkQuota = useCallback(async (metricName: string): Promise<QuotaCheck> => {
    if (!currentWorkspaceId) return DENIED_QUOTA;

    const { data, error } = await supabase.rpc("check_workspace_quota", {
      _workspace_id: currentWorkspaceId,
      _metric_name: metricName,
    });

    if (error || !data) return DENIED_QUOTA;

    const result = data as unknown as QuotaCheck;
    if (typeof result.allowed !== "boolean" || typeof result.quota_limit !== "number") {
      return DENIED_QUOTA;
    }
    return result;
  }, [currentWorkspaceId]);

  const incrementUsage = useCallback(async (metricName: string, increment: number = 1) => {
    if (!currentWorkspaceId || !Number.isFinite(increment) || increment <= 0) return;

    const { data: ws, error: workspaceError } = await supabase
      .from("workspaces")
      .select("organization_id")
      .eq("id", currentWorkspaceId)
      .maybeSingle();

    if (workspaceError || !ws?.organization_id) return;

    const { error } = await supabase.rpc("increment_workspace_usage", {
      _workspace_id: currentWorkspaceId,
      _org_id: ws.organization_id,
      _metric_name: metricName,
      _increment: Math.trunc(increment),
    });

    if (error) {
      console.error("[useWorkspaceQuota] Failed to record usage:", error.message);
    }
  }, [currentWorkspaceId]);

  return { limits, loading, checkQuota, incrementUsage };
};
