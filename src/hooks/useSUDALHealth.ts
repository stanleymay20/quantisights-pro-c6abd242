/**
 * SUDAL Operating Loop Health — measures completeness of each phase:
 * Sense → Understand → Decide → Act → Learn
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PhaseHealth {
  id: "sense" | "understand" | "decide" | "act" | "learn";
  label: string;
  score: number; // 0-100
  status: "strong" | "operational" | "developing" | "inactive";
  signals: PhaseSignal[];
}

interface PhaseSignal {
  label: string;
  met: boolean;
  value: string;
}

export interface SUDALHealth {
  phases: PhaseHealth[];
  overallScore: number;
  closedLoopRate: number;
  loading: boolean;
}

function phaseStatus(score: number): PhaseHealth["status"] {
  if (score >= 80) return "strong";
  if (score >= 50) return "operational";
  if (score >= 20) return "developing";
  return "inactive";
}

function scoreSignals(signals: PhaseSignal[]): number {
  if (signals.length === 0) return 0;
  const met = signals.filter(s => s.met).length;
  return Math.round((met / signals.length) * 100);
}

export const useSUDALHealth = (organizationId: string | null) => {
  const [data, setData] = useState<Omit<SUDALHealth, "loading"> | null>(null);
  const [loading, setLoading] = useState(false);

  const compute = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    try {
      const [
        datasetsRes,
        dqRes,
        insightsRes,
        decisionsRes,
        outcomesRes,
        plansRes,
        calRes,
        rulesRes,
      ] = await Promise.all([
        supabase.from("datasets").select("id, is_stale, status, last_refreshed_at").eq("organization_id", organizationId),
        supabase.from("data_quality_checks").select("score").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(10),
        supabase.from("insights").select("id, severity").eq("organization_id", organizationId).limit(500),
        supabase.from("decision_ledger").select("id, decision_status, confidence_at_decision, decided_at").eq("organization_id", organizationId).limit(500),
        supabase.from("decision_outcomes").select("id, outcome_status").eq("organization_id", organizationId).limit(500),
        supabase.from("execution_plans").select("id, status").eq("organization_id", organizationId).limit(500),
        supabase.from("calibration_models").select("id, overall_calibration_score").eq("organization_id", organizationId).order("computed_at", { ascending: false }).limit(1),
        supabase.from("decision_rules").select("id, is_active").eq("organization_id", organizationId).limit(100),
      ]);

      const datasets = datasetsRes.data ?? [];
      const dqScores = (dqRes.data ?? []).map(d => d.score).filter(Boolean) as number[];
      const insights = insightsRes.data ?? [];
      const decisions = decisionsRes.data ?? [];
      const outcomes = outcomesRes.data ?? [];
      const plans = plansRes.data ?? [];
      const calModel = (calRes.data ?? [])[0];
      const rules = rulesRes.data ?? [];

      const activeDatasets = datasets.filter(d => d.status === "active");
      const freshDatasets = activeDatasets.filter(d => !d.is_stale);
      const avgDQ = dqScores.length > 0 ? dqScores.reduce((a, b) => a + b, 0) / dqScores.length : 0;
      const approvedDecisions = decisions.filter(d => d.decision_status === "approved" || d.decided_at);
      const completedPlans = plans.filter(p => p.status === "completed");
      const measuredOutcomes = outcomes.filter(o => o.outcome_status === "measured" || o.outcome_status === "evaluated");

      // ── SENSE ──
      const senseSignals: PhaseSignal[] = [
        { label: "Data ingested", met: datasets.length > 0, value: `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}` },
        { label: "Data freshness", met: freshDatasets.length > 0, value: freshDatasets.length > 0 ? `${freshDatasets.length} fresh` : "Stale" },
        { label: "Quality monitoring", met: avgDQ >= 60, value: avgDQ > 0 ? `${Math.round(avgDQ)}%` : "—" },
        { label: "Multiple sources", met: datasets.length >= 2, value: `${datasets.length} sources` },
      ];

      // ── UNDERSTAND ──
      const criticalInsights = insights.filter(i => i.severity === "high" || i.severity === "critical");
      const understandSignals: PhaseSignal[] = [
        { label: "Insights generated", met: insights.length > 0, value: `${insights.length} signals` },
        { label: "Critical detection", met: criticalInsights.length > 0 || insights.length > 5, value: criticalInsights.length > 0 ? `${criticalInsights.length} critical` : "Monitoring" },
        { label: "Anomaly detection", met: insights.length >= 3, value: insights.length >= 3 ? "Active" : "Warming" },
        { label: "Decision rules", met: rules.filter(r => r.is_active).length > 0, value: `${rules.filter(r => r.is_active).length} active` },
      ];

      // ── DECIDE ──
      const decideSignals: PhaseSignal[] = [
        { label: "Decisions logged", met: decisions.length > 0, value: `${decisions.length} total` },
        { label: "Approval workflow", met: approvedDecisions.length > 0, value: approvedDecisions.length > 0 ? `${approvedDecisions.length} approved` : "Pending" },
        { label: "Confidence scored", met: decisions.some(d => d.confidence_at_decision !== null), value: decisions.filter(d => d.confidence_at_decision !== null).length > 0 ? "Active" : "—" },
        { label: "Human-in-loop", met: approvedDecisions.length > 0, value: approvedDecisions.length > 0 ? "Enforced" : "Awaiting" },
      ];

      // ── ACT ──
      const actSignals: PhaseSignal[] = [
        { label: "Execution plans", met: plans.length > 0, value: `${plans.length} plans` },
        { label: "Completion rate", met: completedPlans.length > 0, value: plans.length > 0 ? `${Math.round((completedPlans.length / plans.length) * 100)}%` : "—" },
        { label: "Ownership assigned", met: plans.length > 0, value: plans.length > 0 ? "Active" : "—" },
        { label: "Status tracking", met: plans.some(p => p.status !== "pending"), value: plans.filter(p => p.status !== "pending").length > 0 ? "In motion" : "Queued" },
      ];

      // ── LEARN ──
      const calScore = calModel?.overall_calibration_score ?? 0;
      const learnSignals: PhaseSignal[] = [
        { label: "Outcomes measured", met: outcomes.length > 0, value: `${outcomes.length} outcomes` },
        { label: "Actual vs predicted", met: measuredOutcomes.length > 0, value: measuredOutcomes.length > 0 ? `${measuredOutcomes.length} evaluated` : "Collecting" },
        { label: "Calibration model", met: !!calModel, value: calModel ? `Score: ${calScore}` : "Learning" },
        { label: "Closed loop", met: measuredOutcomes.length >= 3 && !!calModel, value: measuredOutcomes.length >= 3 && calModel ? "Active" : "Building" },
      ];

      const phases: PhaseHealth[] = [
        { id: "sense", label: "Sense", signals: senseSignals, score: scoreSignals(senseSignals), status: phaseStatus(scoreSignals(senseSignals)) },
        { id: "understand", label: "Understand", signals: understandSignals, score: scoreSignals(understandSignals), status: phaseStatus(scoreSignals(understandSignals)) },
        { id: "decide", label: "Decide", signals: decideSignals, score: scoreSignals(decideSignals), status: phaseStatus(scoreSignals(decideSignals)) },
        { id: "act", label: "Act", signals: actSignals, score: scoreSignals(actSignals), status: phaseStatus(scoreSignals(actSignals)) },
        { id: "learn", label: "Learn", signals: learnSignals, score: scoreSignals(learnSignals), status: phaseStatus(scoreSignals(learnSignals)) },
      ];

      const overallScore = Math.round(phases.reduce((a, p) => a + p.score, 0) / phases.length);

      // Closed-loop rate = % of decisions that have both execution AND measured outcome
      const withOutcome = new Set(outcomes.map(o => o.id));
      const closedLoop = approvedDecisions.length > 0
        ? Math.round((measuredOutcomes.length / Math.max(approvedDecisions.length, 1)) * 100)
        : 0;

      setData({ phases, overallScore, closedLoopRate: Math.min(closedLoop, 100) });
    } catch (err) {
      console.error("[SUDAL] Health computation failed:", err);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { compute(); }, [compute]);

  return useMemo(() => ({
    ...(data ?? { phases: [], overallScore: 0, closedLoopRate: 0 }),
    loading,
    refresh: compute,
  }), [data, loading, compute]);
};
