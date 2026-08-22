import { useEffect, useState, useCallback } from "react";
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Replay evidence and drift metrics are organization-scoped. Never carry
    // the previous tenant's institutional memory into a new context.
    setReplays([]);
    setDriftReport(null);
    setError(null);
  }, [organizationId]);

  const runReplay = useCallback(async (decisionId: string): Promise<DecisionReplay | null> => {
    if (!organizationId) {
      setError("Organization context is required to replay a decision.");
      return null;
    }
    setReplaying(true);
    setError(null);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Not authenticated");

      const { data, error: replayError } = await invokeWithRetry<DecisionReplay>("decision-replay", {
        body: { action: "replay", organization_id: organizationId, decision_id: decisionId },
        headers: authHeaders(auth),
      });

      if (replayError) throw replayError;
      if (!data || data.decision_id !== decisionId || data.organization_id !== organizationId) {
        throw new Error("Decision replay returned no valid organization-scoped replay evidence.");
      }
      setError(null);
      toast({ title: "Decision replay complete" });
      return data;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Replay failed";
      setError(msg);
      toast({ title: "Replay failed", description: msg, variant: "destructive" });
      return null;
    } finally {
      setReplaying(false);
    }
  }, [organizationId, toast]);

  const fetchReplays = useCallback(async (decisionId: string) => {
    setReplays([]);
    setError(null);
    if (!organizationId) {
      setError("Organization context is required to load replay history.");
      return;
    }
    const auth = await getVerifiedAuth();
    if (!auth) {
      setError("Not authenticated");
      return;
    }

    const { data, error: listError } = await invokeWithRetry<DecisionReplay[]>("decision-replay", {
      body: { action: "list", organization_id: organizationId, decision_id: decisionId },
      headers: authHeaders(auth),
    });

    if (listError) {
      setError(listError.message);
      return;
    }
    if (!data) {
      setError("Replay history returned no evidence payload.");
      return;
    }
    const invalidScope = data.some((replay) => replay.organization_id !== organizationId || replay.decision_id !== decisionId);
    if (invalidScope) {
      setError("Replay history contained evidence outside the requested organization or decision.");
      return;
    }
    setReplays(data);
    setError(null);
  }, [organizationId]);

  const fetchDriftReport = useCallback(async () => {
    setDriftReport(null);
    setError(null);
    if (!organizationId) {
      setError("Organization context is required to load decision drift.");
      return;
    }
    const auth = await getVerifiedAuth();
    if (!auth) {
      setError("Not authenticated");
      return;
    }

    const { data, error: driftError } = await invokeWithRetry<DriftReport>("decision-replay", {
      body: { action: "org_drift_report", organization_id: organizationId },
      headers: authHeaders(auth),
    });

    if (driftError) {
      setError(driftError.message);
      return;
    }
    if (!data) {
      setError("Decision drift report returned no evidence payload.");
      return;
    }
    setDriftReport(data);
    setError(null);
  }, [organizationId]);

  return {
    runReplay,
    replaying,
    replays,
    fetchReplays,
    driftReport,
    fetchDriftReport,
    error,
  };
};
