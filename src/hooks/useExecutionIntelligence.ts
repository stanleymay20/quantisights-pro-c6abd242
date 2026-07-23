import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";

export interface ExecutionScore {
  id: string;
  organization_id: string;
  scope_type: string;
  scope_id: string;
  score: number;
  reliability_rate: number;
  avg_delay_days: number;
  success_rate: number;
  failure_rate: number;
  plans_evaluated: number;
  computed_at: string;
  scoring_model_version?: number;
  formula_snapshot?: string;
  score_explanation?: Record<string, unknown>;
}

export interface ExecutionPrediction {
  id: string;
  execution_plan_id: string;
  risk_score: number;
  predicted_outcome: string;
  delay_days_predicted: number;
  risk_factors: Array<{ factor: string; weight: number }>;
  recommendation: string;
  model_version?: number;
  is_active?: boolean;
  generated_at?: string;
  superseded_at?: string | null;
  feature_summary?: Record<string, unknown>;
  run_id?: string;
  execution_plans?: {
    action_title: string;
    status: string;
    priority: string;
    deadline: string | null;
    owner_user_id: string | null;
  };
}

export interface ExecutionIntervention {
  id: string;
  execution_plan_id: string;
  intervention_type: string;
  trigger_reason: string;
  corrective_action: string | null;
  auto_triggered: boolean;
  resolved: boolean;
  created_at: string;
  execution_plans?: {
    action_title: string;
    status: string;
    priority: string;
    deadline: string | null;
  };
}

export interface ExecutionOverride {
  id: string;
  execution_plan_id: string;
  override_type: string;
  actor_id: string;
  reason: string;
  previous_state: Record<string, unknown>;
  new_state: Record<string, unknown>;
  created_at: string;
}

export interface EngineHealth {
  engines: Record<string, {
    latest: string;
    status: string;
    avg_duration: number;
    runs: number;
    errors: number;
  }>;
  recent_runs: Array<Record<string, unknown>>;
  overall_health: "healthy" | "degraded";
}

export interface CommandSummary {
  org_score: ExecutionScore | null;
  at_risk_plans: number;
  open_interventions: number;
  critical_active: number;
  blocked_active: number;
  total_active: number;
  multi_plan_decisions: Array<{ decision_id: string; plan_count: number }>;
  risk_distribution: {
    likely_failure: number;
    at_risk: number;
    delayed: number;
    on_track: number;
  };
  recent_overrides: ExecutionOverride[];
  last_runs: Array<Record<string, unknown>>;
  generated_at: string;
  correlation_id: string;
}

export interface DependencyGraph {
  graph: Array<Record<string, unknown>>;
  blocked_chains: Array<{ chain: string[]; depth: number }>;
  critical_path: Array<Record<string, unknown>>;
  stats: { total: number; blocked: number; critical: number; with_dependencies: number };
}

export interface InferredBlocker {
  plan_id: string;
  inferred_blocker_id: string;
  blocker_status: string;
  blocker_action_title: string;
  plan_action_title: string;
  reason: string;
}

export interface OperationalMetrics {
  engine_performance: Record<string, {
    total_runs: number;
    errors: number;
    p50_ms: number;
    p95_ms: number;
    avg_ms: number;
    max_ms: number;
    last_run: string;
  }>;
  intervention_metrics: {
    total_created: number;
    total_resolved: number;
    resolution_rate: number;
    auto_triggered: number;
    manual_triggered: number;
    avg_resolution_hours: number;
  };
  dedupe_effectiveness: {
    scan_runs: number;
    total_duplicates_prevented: number;
    total_interventions_created: number;
  };
  computed_at: string;
  window_days: number;
}

export interface ForensicTrace {
  plan: Record<string, unknown> | null;
  timeline: {
    events: Array<Record<string, unknown>>;
    interventions: Array<Record<string, unknown>>;
    overrides: Array<Record<string, unknown>>;
  };
  predictions: Array<Record<string, unknown>>;
  org_score_snapshots: Array<Record<string, unknown>>;
  lineage: { total_events: number; total_interventions: number; total_predictions: number; total_overrides: number };
}

export const useExecutionIntelligence = (organizationId: string | null) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [scores, setScores] = useState<ExecutionScore[]>([]);
  const [predictions, setPredictions] = useState<ExecutionPrediction[]>([]);
  const [interventions, setInterventions] = useState<ExecutionIntervention[]>([]);
  const [commandSummary, setCommandSummary] = useState<CommandSummary | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<DependencyGraph | null>(null);
  const [engineHealth, setEngineHealth] = useState<EngineHealth | null>(null);

  const invoke = useCallback(async <T>(actionName: string, extra: Record<string, unknown> = {}): Promise<T | null> => {
    if (!organizationId) return null;
    const auth = await getVerifiedAuth();
    if (!auth) return null;
    const { data, error } = await invokeWithRetry<T>("execution-intelligence", {
      body: { action: actionName, organization_id: organizationId, ...extra },
      headers: authHeaders(auth),
    });
    if (error) throw error;
    return data;
  }, [organizationId]);

  const scanInterventions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ interventions_created: number; skipped: number; scanned: number; run_id: string }>("scan_interventions");
      if (result && result.interventions_created > 0) {
        toast({ title: `${result.interventions_created} intervention(s) created${result.skipped > 0 ? ` (${result.skipped} dedupe skipped)` : ""}` });
      }
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Scan interventions failed:", msg);
    } finally { setLoading(false); }
  }, [invoke, toast]);

  const fetchInterventions = useCallback(async () => {
    try {
      const data = await invoke<ExecutionIntervention[]>("get_interventions");
      setInterventions(data || []);
    } catch (e: unknown) {
      console.error("Fetch interventions failed:", e instanceof Error ? e.message : e);
    }
  }, [invoke]);

  const resolveIntervention = useCallback(async (interventionId: string) => {
    try {
      await invoke("resolve_intervention", { intervention_id: interventionId });
      toast({ title: "Intervention resolved" });
      await fetchInterventions();
    } catch {
      toast({ title: "Failed to resolve", variant: "destructive" });
    }
  }, [invoke, toast, fetchInterventions]);

  const computeScores = useCallback(async () => {
    setLoading(true);
    try {
      await invoke("compute_scores");
      toast({ title: "Execution scores computed" });
      await fetchScores();
    } catch (e: unknown) {
      console.error("Compute scores failed:", e instanceof Error ? e.message : e);
    } finally { setLoading(false); }
  }, [invoke, toast]);

  const fetchScores = useCallback(async (scopeType?: string, includeHistory = false) => {
    try {
      const data = await invoke<ExecutionScore[]>("get_scores", {
        ...(scopeType ? { scope_type: scopeType } : {}),
        include_history: includeHistory,
      });
      setScores(data || []);
    } catch (e: unknown) {
      console.error("Fetch scores failed:", e instanceof Error ? e.message : e);
    }
  }, [invoke]);

  const fetchScoreTrend = useCallback(async (scopeType: string, scopeId: string, limit = 30) => {
    try {
      return await invoke<Array<{
        score: number;
        success_rate: number;
        failure_rate: number;
        avg_delay_days: number;
        plans_evaluated: number;
        computed_at: string;
        score_explanation: Record<string, unknown>;
      }>>("get_score_trend", { scope_type: scopeType, scope_id: scopeId, limit });
    } catch (e: unknown) {
      console.error("Fetch score trend failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const explainScoreChange = useCallback(async (scopeType: string, scopeId: string) => {
    try {
      return await invoke<{
        score_delta: number;
        direction: string;
        component_deltas: Record<string, number>;
        current: ExecutionScore;
        previous: ExecutionScore;
      }>("explain_score_change", { scope_type: scopeType, scope_id: scopeId });
    } catch (e: unknown) {
      console.error("Explain score change failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const predictRisks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await invoke<{ predictions: ExecutionPrediction[]; total: number; run_id: string; superseded: number }>("predict_risks");
      toast({ title: `Risk analysis complete: ${result?.total || 0} plans assessed` });
      await fetchPredictions();
      return result;
    } catch (e: unknown) {
      console.error("Predict risks failed:", e instanceof Error ? e.message : e);
    } finally { setLoading(false); }
  }, [invoke, toast]);

  const fetchPredictions = useCallback(async (includeHistory = false) => {
    try {
      const data = await invoke<ExecutionPrediction[]>("get_predictions", { include_history: includeHistory });
      setPredictions(data || []);
    } catch (e: unknown) {
      console.error("Fetch predictions failed:", e instanceof Error ? e.message : e);
    }
  }, [invoke]);

  const fetchPredictionHistory = useCallback(async (planId: string) => {
    try {
      return await invoke<ExecutionPrediction[]>("get_prediction_history", { plan_id: planId });
    } catch (e: unknown) {
      console.error("Fetch prediction history failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchCommandSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke<CommandSummary>("command_summary");
      setCommandSummary(data);
    } catch (e: unknown) {
      console.error("Fetch command summary failed:", e instanceof Error ? e.message : e);
    } finally { setLoading(false); }
  }, [invoke]);

  const reassignPlan = useCallback(async (planId: string, newOwnerId: string, reason?: string) => {
    try {
      await invoke("reassign_plan", { plan_id: planId, new_owner_id: newOwnerId, reason });
      toast({ title: "Plan reassigned successfully" });
    } catch {
      toast({ title: "Reassignment failed", variant: "destructive" });
    }
  }, [invoke, toast]);

  const executeOverride = useCallback(async (planId: string, overrideType: string, reason: string, changes?: Record<string, unknown>) => {
    try {
      const result = await invoke<{ success: boolean; previous_state: Record<string, unknown>; new_state: Record<string, unknown> }>(
        "executive_override",
        { plan_id: planId, override_type: overrideType, reason, changes }
      );
      toast({ title: `Override applied: ${overrideType.replace(/_/g, " ")}` });
      return result;
    } catch {
      toast({ title: "Override failed", variant: "destructive" });
      return null;
    }
  }, [invoke, toast]);

  const fetchOverrides = useCallback(async (planId?: string) => {
    try {
      return await invoke<ExecutionOverride[]>("get_overrides", planId ? { plan_id: planId } : {});
    } catch (e: unknown) {
      console.error("Fetch overrides failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchDependencyGraph = useCallback(async () => {
    try {
      const data = await invoke<DependencyGraph>("get_dependency_graph");
      setDependencyGraph(data);
      return data;
    } catch (e: unknown) {
      console.error("Fetch dependency graph failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchForensicTrace = useCallback(async (planId: string) => {
    try {
      return await invoke<ForensicTrace>("forensic_trace", { plan_id: planId });
    } catch (e: unknown) {
      console.error("Fetch forensic trace failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchEngineHealth = useCallback(async () => {
    try {
      const data = await invoke<EngineHealth>("engine_health");
      setEngineHealth(data);
      return data;
    } catch (e: unknown) {
      console.error("Fetch engine health failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchInferredBlockers = useCallback(async () => {
    try {
      return await invoke<{ inferred_blockers: InferredBlocker[]; total: number; note: string }>("infer_blockers");
    } catch (e: unknown) {
      console.error("Fetch inferred blockers failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const fetchOperationalMetrics = useCallback(async () => {
    try {
      return await invoke<OperationalMetrics>("operational_metrics");
    } catch (e: unknown) {
      console.error("Fetch operational metrics failed:", e instanceof Error ? e.message : e);
      return null;
    }
  }, [invoke]);

  const runRetentionCleanup = useCallback(async (retainDays?: {
    events?: number; predictions?: number; scores?: number; run_log?: number;
  }) => {
    return invoke("retention_cleanup", {
      events_retain_days: retainDays?.events ?? 180,
      predictions_retain_days: retainDays?.predictions ?? 90,
      scores_retain_days: retainDays?.scores ?? 365,
      run_log_retain_days: retainDays?.run_log ?? 90,
    });
  }, [invoke]);

  return {
    loading,
    scores,
    predictions,
    interventions,
    commandSummary,
    dependencyGraph,
    engineHealth,
    scanInterventions,
    fetchInterventions,
    resolveIntervention,
    computeScores,
    fetchScores,
    fetchScoreTrend,
    explainScoreChange,
    predictRisks,
    fetchPredictions,
    fetchPredictionHistory,
    fetchCommandSummary,
    reassignPlan,
    executeOverride,
    fetchOverrides,
    fetchDependencyGraph,
    fetchForensicTrace,
    fetchEngineHealth,
    fetchInferredBlockers,
    fetchOperationalMetrics,
    runRetentionCleanup,
  };
};
