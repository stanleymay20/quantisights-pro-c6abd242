import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";

export interface DecisionReplay {
  id: string;
  decision_id: string;
  organization_id: string;
  replayed_by: string;
  original_confidence: number | null;
  replayed_confidence: number | null;
  confidence_drift: number | null;
  original_recommendation: string | null;
  replayed_recommendation: string | null;
  recommendation_changed: boolean;
  current_data_summary: Record<string, unknown>;
  replay_narrative: string | null;
  created_at: string;
}

export interface DriftReport {
  total_replays: number;
  avg_confidence_drift: number;
  recommendations_changed: number;
  change_rate: number;
}

export const useDecisionReplay = (organizationId: string | null) => {
  const { toast } = useToast();
  const [replaying, setReplaying] = useState(false);
  const [replays, setReplays] = useState<DecisionReplay[]>([]);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);

  const runReplay = useCallback(async (decisionId: string): Promise<DecisionReplay | null> => {
    if (!organizationId) return null;
    setReplaying(true);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Not authenticated");

      const { data, error } = await invokeWithRetry<DecisionReplay>("decision-replay", {
        body: { action: "replay", organization_id: organizationId, decision_id: decisionId },
        headers: authHeaders(auth),
      });

      if (error) throw error;
      toast({ title: "Decision Replay complete" });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Replay failed";
      toast({ title: "Replay failed", description: msg, variant: "destructive" });
      return null;
    } finally {
      setReplaying(false);
    }
  }, [organizationId, toast]);

  const fetchReplays = useCallback(async (decisionId: string) => {
    if (!organizationId) return;
    const auth = await getVerifiedAuth();
    if (!auth) return;

    const { data, error } = await invokeWithRetry<DecisionReplay[]>("decision-replay", {
      body: { action: "list", organization_id: organizationId, decision_id: decisionId },
      headers: authHeaders(auth),
    });

    if (!error && data) setReplays(data);
  }, [organizationId]);

  const fetchDriftReport = useCallback(async () => {
    if (!organizationId) return;
    const auth = await getVerifiedAuth();
    if (!auth) return;

    const { data, error } = await invokeWithRetry<DriftReport>("decision-replay", {
      body: { action: "org_drift_report", organization_id: organizationId },
      headers: authHeaders(auth),
    });

    if (!error && data) setDriftReport(data);
  }, [organizationId]);

  return {
    runReplay,
    replaying,
    replays,
    fetchReplays,
    driftReport,
    fetchDriftReport,
  };
};
