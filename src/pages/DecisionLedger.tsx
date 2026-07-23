import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, CheckCircle2, Clock, TrendingUp, TrendingDown,
  Loader2, Plus, PlayCircle, Target, BarChart3, ArrowRight,
  ShieldCheck, AlertTriangle, Activity, Zap, DollarSign,
} from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import TrustStrip from "@/components/trust/TrustStrip";
import { trustFromDecision } from "@/components/trust/trust-adapter";
import TrustCard, { trustCardFromDecision } from "@/components/trust/TrustCard";
import DecisionResponsibilityDialog from "@/components/DecisionResponsibilityDialog";
import DecisionComments from "@/components/decisions/DecisionComments";
import ExecutiveDecisionReview from "@/components/decisions/ExecutiveDecisionReview";
import {
  getExecutiveApprovalBlockReason,
  isExecutiveApprovalAllowed,
} from "@/components/decisions/executive-decision-review-utils";
import OutcomeFeedbackWidget from "@/components/decisions/OutcomeFeedbackWidget";
import LazyInputWarning from "@/components/dashboard/LazyInputWarning";

import ExecutionTimeline from "@/components/execution/ExecutionTimeline";
import DecisionReplayPanel from "@/components/execution/DecisionReplayPanel";
import DecisionEvidencePanel from "@/components/decision-intelligence/DecisionEvidencePanel";
import ExplainDecisionPanel from "@/components/dashboard/ExplainDecisionPanel";
import type { Database } from "@/integrations/supabase/types";
import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";
import { onExecutionStatusChanged, checkEvaluability, evaluabilityColor, evaluabilityBadgeVariant } from "@/lib/decision-lifecycle";
import { formatCompact } from "@/lib/format-locale";
import type { EvaluabilityResult } from "@/lib/decision-lifecycle";

interface Decision {
  id: string;
  organization_id: string;
  advisory_instance_id: string | null;
  decision_type: string;
  recommended_action: string;
  chosen_action: string | null;
  decision_status: string;
  execution_status: string;
  outcome_delta: number | null;
  confidence_at_decision: number | null;
  confidence_updated: number | null;
  baseline_value: number | null;
  actual_value: number | null;
  kpi_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  execution_started_at: string | null;
  execution_completed_at: string | null;
  outcome_measured_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  prediction_accuracy_score: number | null;
  calibration_error: number | null;
  raw_confidence: number | null;
  capped_confidence: number | null;
  confidence_cap_reason: string | null;
  decision_simulation_id: string | null;
  predicted_roi_probability: number | null;
  predicted_net_impact: number | null;
  explanation_metadata: ExplanationMetadata | null;
  source_insight_summary: string | null;
  recommendation_logic_type: string | null;
  decision_origin: string;
  linked_aicis_prediction_id: string | null;
  linked_aicis_recommendation_id: string | null;
}

interface ImpactSim {
  id: string;
  expected_net_impact: number;
  median_net_impact: number;
  p10_impact: number;
  p50_impact: number;
  p90_impact: number;
  probability_positive_roi: number;
  probability_cashflow_stress: number;
  risk_adjusted_expected_value: number;
  raw_confidence: number;
  capped_confidence: number;
  confidence_cap_reason: string;
  variance_score: number;
  sample_size: number;
  data_sufficiency: string;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-warning/10", text: "text-warning", label: "Pending" },
  approved: { bg: "bg-primary/10", text: "text-primary", label: "Approved" },
  rejected: { bg: "bg-destructive/10", text: "text-destructive", label: "Rejected" },
  deferred: { bg: "bg-muted", text: "text-muted-foreground", label: "Deferred" },
};

const EXEC_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-muted", text: "text-muted-foreground", label: "Not Started" },
  in_progress: { bg: "bg-primary/10", text: "text-primary", label: "In Progress" },
  completed: { bg: "bg-success/10", text: "text-success", label: "Completed" },
  blocked: { bg: "bg-destructive/10", text: "text-destructive", label: "Blocked" },
};

function getLedgerApprovalBlockReason(decision: Decision): string | null {
  return getExecutiveApprovalBlockReason(decision);
}

function isLedgerDecisionReadyForApproval(decision: Decision): boolean {
  return isExecutiveApprovalAllowed(decision);
}

const DecisionLedgerPage = () => {
  const isExecutiveReviewMode =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("review") === "top";
  const executiveReviewRef = useRef<HTMLElement | null>(null);
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [newType, setNewType] = useState("strategic");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Execution & Replay state
  const [expandedDecision, setExpandedDecision] = useState<string | null>(null);
  const [showAnalystDetails, setShowAnalystDetails] = useState(!isExecutiveReviewMode);

  // Impact simulation state
  const [simTarget, setSimTarget] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<ImpactSim | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<{ id: string; action: string } | null>(null);
  const [evaluabilityCheck, setEvaluabilityCheck] = useState<EvaluabilityResult | null>(null);
  const [evaluabilityLoading, setEvaluabilityLoading] = useState(false);
  const [impactForm, setImpactForm] = useState({
    revenue_delta_pct: 5,
    cost_delta_pct: -2,
    churn_change_pct: -1,
    implementation_cost: 10000,
    time_to_impact_months: 3,
  });

  // Learning metrics
  const [learningStats, setLearningStats] = useState<{
    rollingCalError: number | null;
    totalCalibrated: number;
    confidenceAdjustment: number;
  }>({ rollingCalError: null, totalCalibrated: 0, confidenceAdjustment: 0 });

  // Set of decision IDs that already have an aicis_outcomes row
  const [evaluatedAicisIds, setEvaluatedAicisIds] = useState<Set<string>>(new Set());

  const fetchDecisions = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("decision_ledger")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("is_suppressed", false)
      .order("created_at", { ascending: false })
      .limit(100);
    // Note: decision_ledger is org-scoped by design (decisions span datasets)
    if (!error && data) setDecisions(data as unknown as Decision[]);
    setLoading(false);
  };

  const fetchLearningStats = async () => {
    if (!currentOrgId) return;
    const { data } = await supabase
      .from("decision_simulations")
      .select("calibration_delta")
      .eq("organization_id", currentOrgId)
      .not("calibration_delta", "is", null)
      .order("created_at", { ascending: false })
      .limit(10);
    
    if (data && data.length > 0) {
      const deltas = data.map((d) => Number(d.calibration_delta));
      const avg = deltas.reduce((s: number, v: number) => s + v, 0) / deltas.length;
      setLearningStats({
        rollingCalError: Math.abs(avg),
        totalCalibrated: data.length,
        confidenceAdjustment: deltas.length >= 5 ? -avg * 0.1 : 0,
      });
    }
  };

  useEffect(() => {
    if (currentOrgId) {
      fetchDecisions();
      fetchLearningStats();
      // Hydrate which AICIS-linked decisions already have an outcome row
      (async () => {
        const { data } = await supabase
          .from("aicis_outcomes")
          .select("external_id")
          .eq("organization_id", currentOrgId)
          .like("external_id", "decision:%");
        if (data) setEvaluatedAicisIds(new Set(data.map(r => (r.external_id as string).replace(/^decision:/, ""))));
      })();
    }
  }, [currentOrgId]);

  const createDecision = async () => {
    if (!newAction.trim()) {
      toast({ title: "Description required", description: "Please describe the recommended action before logging.", variant: "destructive" });
      return;
    }
    if (!currentOrgId) return;

    // Optimistic: add to list immediately
    const optimisticId = crypto.randomUUID();
    const optimisticDecision: Decision = {
      id: optimisticId,
      organization_id: currentOrgId,
      advisory_instance_id: null,
      decision_type: newType,
      recommended_action: newAction,
      chosen_action: null,
      decision_status: "pending",
      execution_status: "not_started",
      outcome_delta: null,
      confidence_at_decision: null,
      confidence_updated: null,
      baseline_value: null,
      actual_value: null,
      kpi_id: null,
      decided_by: user?.id ?? null,
      decided_at: null,
      execution_started_at: null,
      execution_completed_at: null,
      outcome_measured_at: null,
      notes: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      prediction_accuracy_score: null,
      calibration_error: null,
      raw_confidence: null,
      capped_confidence: null,
      confidence_cap_reason: null,
      decision_simulation_id: null,
      predicted_roi_probability: null,
      predicted_net_impact: null,
      explanation_metadata: null,
      source_insight_summary: null,
      recommendation_logic_type: null,
      decision_origin: "manual",
      linked_aicis_prediction_id: null,
      linked_aicis_recommendation_id: null,
    };

    setDecisions(prev => [optimisticDecision, ...prev]);
    toast({ title: "Decision logged" });
    setNewAction("");
    setShowCreate(false);

    const { error } = await supabase
      .from("decision_ledger")
      .insert({
        organization_id: currentOrgId,
        recommended_action: newAction,
        decision_type: newType,
        decided_by: user?.id,
      });

    if (error) {
      // Rollback optimistic add
      setDecisions(prev => prev.filter(d => d.id !== optimisticId));
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Replace optimistic with real data in background
      fetchDecisions();
    }
  };

  const runImpactSim = async (decisionId: string) => {
    if (!currentOrgId) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const { data, error } = await invokeWithRetry<ImpactSim>("decision-impact-sim", {
        body: {
          organization_id: currentOrgId,
          dataset_id: activeDatasetId,
          decision_id: decisionId,
          ...impactForm,
        },
      });
      if (error) throw error;
      const rawData = data as unknown as Record<string, unknown> | null;
      if (rawData?.error) throw new Error(String(rawData.error));
      setSimResult(data);
      toast({ title: "Impact simulation complete" });
      fetchDecisions();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Simulation failed";
      toast({ title: "Simulation failed", description: msg, variant: "destructive" });
    } finally {
      setSimRunning(false);
    }
  };

  const updateDecision = async (
    id: string,
    updates: Database["public"]["Tables"]["decision_ledger"]["Update"],
  ) => {
    const decision = decisions.find(d => d.id === id);
    if (!decision) return;

    if (updates.decision_status === "approved" && !isLedgerDecisionReadyForApproval(decision)) {
      toast({
        title: "Cannot approve yet",
        description: getLedgerApprovalBlockReason(decision) ?? "Evidence review required before approval.",
        variant: "destructive",
      });
      return;
    }

    // Approval/rejection commit atomically server-side (decision_ledger
    // update + audit_log entry + execution-plan + evaluability-gated
    // outcome tracking, all in one transaction) — the browser never writes
    // audit_log directly. This is a distinct path from the generic field
    // update below, which is unaffected.
    if (updates.decision_status === "approved" || updates.decision_status === "rejected") {
      const isApproval = updates.decision_status === "approved";
      const previousDecisions = [...decisions];
      setDecisions(prev =>
        prev.map(d => d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } as Decision : d)
      );
      setUpdatingId(id);

      const metricByType: Record<string, string> = {
        growth: "revenue", retention: "churn_rate", cost_optimization: "cost",
        strategic: "revenue", operational: "cost", risk: "revenue",
      };
      const { error } = isApproval
        ? await supabase.rpc("approve_decision", {
            _decision_id: id,
            _dataset_id: activeDatasetId ?? null,
            _expected_metric: metricByType[decision.decision_type] ?? decision.decision_type,
            _evaluation_window_days: 30,
          })
        : await supabase.rpc("reject_decision", { _decision_id: id });

      if (error) {
        setDecisions(previousDecisions);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setUpdatingId(null);
        return;
      }

      setUpdatingId(null);

      import("@/lib/analytics").then(({ trackDecisionActioned }) =>
        trackDecisionActioned(updates.decision_status as "approved" | "rejected", decision.decision_type)
      );

      if (isApproval) {
        supabase.functions.invoke("embed-decisions", {
          body: { organization_id: decision.organization_id, mode: "specific", entity_ids: [id] },
        }).catch(() => {});
        supabase.functions.invoke("predict-outcome", {
          body: { organization_id: decision.organization_id, decision_id: id },
        }).catch(() => {});
      }
      return;
    }

    // Compute derived fields upfront
    if (updates.execution_status === "completed") {
      const conf = decision.confidence_at_decision || decision.capped_confidence || 50;
      const hasOutcome = decision.outcome_delta !== null;
      const outcomePositive = (decision.outcome_delta || 0) >= 0;
      const calibrationError = Math.abs(conf - (outcomePositive ? 100 : 0));
      const predictionAccuracy = hasOutcome ? Math.max(0, 100 - calibrationError) : null;
      updates.calibration_error = calibrationError;
      updates.prediction_accuracy_score = predictionAccuracy;
    }

    // ── OPTIMISTIC UPDATE: reflect change instantly ──
    const previousDecisions = [...decisions];
    setDecisions(prev =>
      prev.map(d => d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } as Decision : d)
    );
    setUpdatingId(id);

    // ── FAST PATH: write to DB ──
    const { error } = await supabase
      .from("decision_ledger")
      .update(updates)
      .eq("id", id);

    if (error) {
      // ── ROLLBACK on failure ──
      setDecisions(previousDecisions);
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setUpdatingId(null);
      return;
    }

    setUpdatingId(null);

    // ── HEAVY PATH: lifecycle side effects run async, non-blocking ──
    // (decision_status approve/reject is handled entirely above, atomically.)
    if (updates.execution_status) {
      onExecutionStatusChanged({
        decisionId: id,
        organizationId: decision.organization_id,
        userId: user?.id ?? null,
        newStatus: updates.execution_status as string,
      }).catch(() => {}); // fire-and-forget
    }
  };

  const activeDecisions = decisions.filter(d => d.decision_status !== "rejected" && d.execution_status !== "completed");
  const completedDecisions = decisions.filter(d => d.execution_status === "completed");
  const aicisQueue = decisions
    .filter(d => (d.linked_aicis_prediction_id || d.linked_aicis_recommendation_id) && d.decision_status === "pending")
    .sort((a, b) => (b.capped_confidence ?? 0) - (a.capped_confidence ?? 0));

  const avgOutcomeDelta = completedDecisions.length > 0
    ? completedDecisions.reduce((s, d) => s + (d.outcome_delta || 0), 0) / completedDecisions.length
    : null;

  const avgCalibrationError = completedDecisions.filter(d => d.calibration_error !== null).length > 0
    ? completedDecisions.filter(d => d.calibration_error !== null).reduce((s, d) => s + (d.calibration_error || 0), 0)
      / completedDecisions.filter(d => d.calibration_error !== null).length
    : null;

  // Require ≥10 completed decisions for a statistically meaningful success rate (WCAG plain-language: avoids "100%" on 1 decision)
  const MIN_DECISIONS_FOR_RATE = 10;
  const decisionSuccessRate = completedDecisions.length >= MIN_DECISIONS_FOR_RATE
    ? (completedDecisions.filter(d => (d.outcome_delta || 0) > 0).length / completedDecisions.length * 100)
    : null;

  useEffect(() => {
    if (expandedDecision || loading || activeDecisions.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("review") === "top") {
      setExpandedDecision(activeDecisions[0].id);
    }
  }, [activeDecisions, expandedDecision, loading]);

  useEffect(() => {
    if (!isExecutiveReviewMode || loading || !expandedDecision || !executiveReviewRef.current) return;
    window.setTimeout(() => {
      executiveReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [expandedDecision, isExecutiveReviewMode, loading]);

  const executiveReviewDecision = activeDecisions[0] ?? null;

  return (
    <>
        <header className="border-b border-border/30 flex items-center justify-between px-6 md:px-8 py-3 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 min-w-0">
            <SidebarMobileToggle />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary shrink-0" />
                <h1 className="text-[18px] font-semibold tracking-tight truncate">Decision Ledger</h1>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wide hidden sm:inline-flex">Governed</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                Recommendation → Decision → Outcome → Governance. Every decision auditable, every outcome measured.
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="gap-2 shrink-0" data-testid="create-decision">
            <Plus className="w-4 h-4" /> Log Decision
          </Button>
        </header>

          <IntelligenceDisclaimer variant="banner" context="advisory" />
          <LazyInputWarning decisions={decisions} />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          <SectionErrorBoundary sectionName="Decision Ledger">
          {isExecutiveReviewMode && executiveReviewDecision && currentOrgId && (
            <section
              ref={executiveReviewRef}
              id="executive-review-top-section"
              data-testid="executive-review-focus-anchor"
              className="scroll-mt-6 space-y-4 rounded-2xl border border-primary/25 bg-primary/[0.03] p-4 sm:p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
                    Today's Decision
                  </Badge>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                    Executive review first
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                    Start with the decision, evidence, approval gate, alternatives, and outcome plan. Analyst detail stays available below.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAnalystDetails(true)}>
                  Need more detail? Expand analyst details
                </Button>
              </div>
              <ExecutiveDecisionReview
                decision={executiveReviewDecision}
                organizationId={currentOrgId}
              />
            </section>
          )}

          <Collapsible
            defaultOpen={!isExecutiveReviewMode}
            onOpenChange={setShowAnalystDetails}
            className="space-y-4"
          >
            {isExecutiveReviewMode && (
              <div className="flex justify-center">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    Need more detail? {showAnalystDetails ? "Hide analyst details" : "Expand analyst details"}
                  </Button>
                </CollapsibleTrigger>
              </div>
            )}
            <CollapsibleContent className="space-y-6">
              {isExecutiveReviewMode && (
                <div className="rounded-xl border border-border/40 bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Analyst detail</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Metrics, queues, simulations, and full execution panels are collapsed by default in executive review mode.
                  </p>
                </div>
              )}
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Decisions logged</p>
                <p className="text-2xl font-bold font-mono mt-1">{decisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">In flight</p>
                <p className="text-2xl font-bold font-mono mt-1 text-primary">{activeDecisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Outcomes recorded</p>
                <p className="text-2xl font-bold font-mono mt-1 text-success">{completedDecisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Avg. outcome Δ</p>
                <p className={`text-2xl font-bold font-mono mt-1 ${avgOutcomeDelta !== null && avgOutcomeDelta > 0 ? "text-success" : avgOutcomeDelta !== null && avgOutcomeDelta < 0 ? "text-destructive" : ""}`}>
                  {avgOutcomeDelta !== null ? `${avgOutcomeDelta > 0 ? "+" : ""}${formatCompact(avgOutcomeDelta)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 cursor-help"><Activity className="w-3 h-3" /> Calibration error</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">Average gap between predicted and observed outcomes. Lower is better — under 30 indicates well-calibrated forecasts.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className={`text-2xl font-bold font-mono mt-1 ${avgCalibrationError !== null && avgCalibrationError < 30 ? "text-success" : avgCalibrationError !== null && avgCalibrationError > 50 ? "text-destructive" : "text-warning"}`}>
                  {avgCalibrationError !== null ? `${avgCalibrationError.toFixed(0)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 cursor-help"><ShieldCheck className="w-3 h-3" /> Hit rate</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">Share of completed decisions with positive outcome delta. Requires {MIN_DECISIONS_FOR_RATE}+ outcomes for statistical reliability.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className={`text-2xl font-bold font-mono mt-1 ${decisionSuccessRate !== null && decisionSuccessRate > 60 ? "text-success" : decisionSuccessRate !== null && decisionSuccessRate < 40 ? "text-destructive" : "text-warning"}`}>
                  {decisionSuccessRate !== null ? `${decisionSuccessRate.toFixed(0)}%` : "—"}
                </p>
                {decisionSuccessRate === null && completedDecisions.length > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{completedDecisions.length}/{MIN_DECISIONS_FOR_RATE} to qualify</p>
                )}
              </CardContent>
            </Card>
            <Card className={learningStats.totalCalibrated >= 5 ? "border-primary/30" : ""}>
              <CardContent className="p-4">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide flex items-center gap-1 cursor-help"><Zap className="w-3 h-3" /> Self-calibration</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">Confidence adjustment learned from your historical calibration error. Activates after 5 calibrated decisions.</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <p className="text-2xl font-bold font-mono mt-1">
                  {learningStats.totalCalibrated >= 5 ? (
                    <span className="text-primary">{learningStats.confidenceAdjustment > 0 ? "+" : ""}{learningStats.confidenceAdjustment.toFixed(1)}</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">{learningStats.totalCalibrated}/5</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {learningStats.totalCalibrated >= 5 ? "applied to new forecasts" : "decisions to learn"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Create form */}
          {showCreate && (
            <Card className="border-primary/20">
              <CardContent className="p-6 space-y-4">
                <h3 className="font-semibold">Log New Decision</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Textarea
                      placeholder="Describe the recommended action..."
                      value={newAction}
                      onChange={e => setNewAction(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="strategic">Strategic</SelectItem>
                        <SelectItem value="operational">Operational</SelectItem>
                        <SelectItem value="financial">Financial</SelectItem>
                        <SelectItem value="risk_mitigation">Risk Mitigation</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={createDecision} className="w-full" disabled={!newAction.trim()} data-testid="create-decision-submit">
                      Log Decision
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full text-muted-foreground"
                      onClick={() => { setShowCreate(false); setNewAction(""); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Impact Simulation Panel */}
          {simTarget && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  Decision Impact Simulation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Revenue Δ (%)</Label>
                    <Input
                      type="number"
                      value={impactForm.revenue_delta_pct}
                      onChange={e => setImpactForm(f => ({ ...f, revenue_delta_pct: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Cost Δ (%)</Label>
                    <Input
                      type="number"
                      value={impactForm.cost_delta_pct}
                      onChange={e => setImpactForm(f => ({ ...f, cost_delta_pct: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Churn Δ (%)</Label>
                    <Input
                      type="number"
                      value={impactForm.churn_change_pct}
                      onChange={e => setImpactForm(f => ({ ...f, churn_change_pct: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Impl. Cost</Label>
                    <Input
                      type="number"
                      value={impactForm.implementation_cost}
                      onChange={e => setImpactForm(f => ({ ...f, implementation_cost: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Time (months)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={impactForm.time_to_impact_months}
                      onChange={e => setImpactForm(f => ({ ...f, time_to_impact_months: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => runImpactSim(simTarget)}
                    disabled={simRunning}
                    className="gap-2"
                  >
                    {simRunning ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Running 10K paths…</>
                    ) : (
                      <><Zap className="w-4 h-4" /> Run Impact Simulation</>
                    )}
                  </Button>
                  <Button variant="ghost" onClick={() => { setSimTarget(null); setSimResult(null); }}>
                    Cancel
                  </Button>
                </div>

                {/* Simulation Results */}
                {simResult && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <ResultCard
                        label="Expected Net Impact"
                        value={`${simResult.expected_net_impact >= 0 ? "+" : ""}${fmt(simResult.expected_net_impact)}`}
                        positive={simResult.expected_net_impact >= 0}
                      />
                      <ResultCard
                        label="P(Positive ROI)"
                        value={`${Math.round(simResult.probability_positive_roi)}%`}
                        positive={simResult.probability_positive_roi >= 50}
                      />
                      <ResultCard
                        label="Risk-Adj. EV"
                        value={fmt(simResult.risk_adjusted_expected_value)}
                        positive={simResult.risk_adjusted_expected_value >= 0}
                      />
                      <ResultCard
                        label="P(Cash Stress)"
                        value={`${Math.round(simResult.probability_cashflow_stress)}%`}
                        positive={simResult.probability_cashflow_stress < 20}
                      />
                    </div>

                    {/* Impact distribution */}
                    <Card>
                      <CardContent className="pt-4 pb-3">
                        <ImpactDistribution sim={simResult} />
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant={simResult.data_sufficiency === "robust" ? "default" : "secondary"} className="text-xs">
                                Conf: {Number(simResult.capped_confidence).toFixed(1)}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              <p>Raw: {Number(simResult.raw_confidence).toFixed(1)}% → Capped: {Number(simResult.capped_confidence).toFixed(1)}%</p>
                              <p>{simResult.confidence_cap_reason}</p>
                              <p>Sample: {simResult.sample_size} | Variance: {Math.round(simResult.variance_score)}%</p>
                            </TooltipContent>
                          </Tooltip>
                          <span>Data sufficiency: <span className="capitalize font-medium text-foreground">{simResult.data_sufficiency}</span></span>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Decisions list */}
          <Tabs defaultValue="active" className="space-y-4">
            <TabsList className="border-0 bg-transparent p-0 gap-0 border-b border-border/30 rounded-none justify-start h-auto w-full">
              <TabsTrigger value="active" className="gap-2"><PlayCircle className="w-4 h-4" /> Active ({activeDecisions.length})</TabsTrigger>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="aicis" className="gap-2"><Zap className="w-4 h-4" /> AICIS Queue ({aicisQueue.length})</TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    AICIS Queue — Decisions automatically generated by the AI-Assisted Civilization Intelligence System. High-risk geopolitical signals above your configured threshold are converted to pending decisions here every 15 minutes.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TabsTrigger value="completed" className="gap-2"><CheckCircle2 className="w-4 h-4" /> Completed ({completedDecisions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="aicis" className="space-y-3">
              {aicisQueue.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Zap className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base">AICIS queue is clear</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md">
                      No external risk predictions or recommendations are awaiting governance review. The intelligence pipeline runs every 15 minutes and surfaces high-impact signals here.
                    </p>
                  </div>
                </CardContent></Card>
              ) : aicisQueue.map(d => {
                const isPrediction = !!d.linked_aicis_prediction_id;
                const approvalBlockReason = getLedgerApprovalBlockReason(d);
                return (
                  <Card key={d.id} className="border-primary/20">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <Badge className="bg-primary/15 text-primary border-none text-[10px]">AICIS</Badge>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {isPrediction ? "Risk Prediction" : "Recommendation"}
                            </Badge>
                            {d.capped_confidence !== null && (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <BarChart3 className="w-3 h-3" /> {Number(d.capped_confidence).toFixed(0)}% conf
                              </Badge>
                            )}
                            {d.predicted_net_impact !== null && (
                              <Badge variant="outline" className="text-[10px]">
                                Est. impact: {Number(d.predicted_net_impact) >= 0 ? "+" : ""}{fmt(Number(d.predicted_net_impact))}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium truncate">{d.recommended_action}</p>
                          {d.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.notes}</p>}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" className="h-7 text-xs" disabled={updatingId === d.id || !isLedgerDecisionReadyForApproval(d)}
                            title={approvalBlockReason ?? "Approve"}
                            onClick={() => updateDecision(d.id, { decision_status: "approved", decided_at: new Date().toISOString() })}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={updatingId === d.id}
                            onClick={() => updateDecision(d.id, { decision_status: "rejected" })}>
                            Dismiss
                          </Button>
                          {approvalBlockReason && (
                            <p className="max-w-44 text-[10px] leading-snug text-destructive">
                              {approvalBlockReason}
                            </p>
                          )}
                        </div>
                      </div>
                      <TrustCard
                        data={trustCardFromDecision(d as unknown as Record<string, unknown>)}
                        className="mt-3"
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="active" className="space-y-3">
              {loading ? (
                <Card><CardContent className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></CardContent></Card>
              ) : activeDecisions.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-20 flex flex-col items-center gap-4 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
                    <BookOpen className="w-8 h-8 text-primary" />
                  </div>
                  <div className="max-w-md">
                    <p className="font-semibold text-lg tracking-tight">No governed decisions yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Create your first decision from an insight, forecast, or manual entry.
                      Every decision is captured with evidence, confidence, approval trail, and outcome — fully auditable from recommendation to result.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Button size="sm" onClick={() => setShowCreate(true)} className="gap-2">
                      <Plus className="w-4 h-4" /> Log first decision
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                      <a href="/executive">Browse insights →</a>
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 text-[11px] text-muted-foreground max-w-md w-full">
                    <div className="flex flex-col items-center gap-1"><ShieldCheck className="w-4 h-4 text-primary/60" /><span>Evidence-backed</span></div>
                    <div className="flex flex-col items-center gap-1"><Activity className="w-4 h-4 text-primary/60" /><span>Approval trail</span></div>
                    <div className="flex flex-col items-center gap-1"><Target className="w-4 h-4 text-primary/60" /><span>Outcome tracked</span></div>
                  </div>
                </CardContent></Card>
              ) : activeDecisions.map(d => {
                const sCfg = STATUS_COLORS[d.decision_status] || STATUS_COLORS.pending;
                const eCfg = EXEC_STATUS[d.execution_status] || EXEC_STATUS.not_started;
                const approvalBlockReason = getLedgerApprovalBlockReason(d);
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    <div className="border-b border-border/30 py-4 px-1 last:border-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className="text-xs capitalize">{d.decision_type.replace(/_/g, " ")}</Badge>
                              <Badge className={`${sCfg.bg} ${sCfg.text} border-none text-xs`}>{sCfg.label}</Badge>
                              <Badge className={`${eCfg.bg} ${eCfg.text} border-none text-xs`}>{eCfg.label}</Badge>
                              {d.capped_confidence !== null && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1" title={d.confidence_cap_reason || undefined}>
                                  <BarChart3 className="w-3 h-3" /> {Number(d.capped_confidence).toFixed(1)}% conf.
                                </span>
                              )}
                              {d.predicted_roi_probability !== null && (
                                <Badge className={`border-none text-xs ${Number(d.predicted_roi_probability) >= 50 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                                  <DollarSign className="w-3 h-3 mr-0.5" /> P(ROI+): {Number(d.predicted_roi_probability).toFixed(0)}%
                                </Badge>
                              )}
                              {d.predicted_net_impact !== null && (
                                <span className="text-xs text-muted-foreground">
                                  Est. impact: {Number(d.predicted_net_impact) >= 0 ? "+" : ""}{fmt(Number(d.predicted_net_impact))}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium">{d.recommended_action}</p>
                            {d.chosen_action && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" /> Chosen: {d.chosen_action}
                              </p>
                            )}
                            {d.confidence_cap_reason && (
                              <p className="text-[10px] text-muted-foreground/60 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> {d.confidence_cap_reason}
                              </p>
                            )}
                            {d.notes && <p className="text-xs text-muted-foreground mt-1 italic">{d.notes}</p>}
                            <p className="text-xs text-muted-foreground mt-2">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(d.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
                            {d.decision_status === "pending" && (
                              <>
                                <Button size="sm" variant="outline" onClick={async () => {
                                  setEvaluabilityCheck(null);
                                  setApprovalTarget({ id: d.id, action: d.recommended_action });
                                  if (currentOrgId) {
                                    setEvaluabilityLoading(true);
                                    const metricByType: Record<string, string> = { growth: "revenue", retention: "churn_rate", cost_optimization: "cost", strategic: "revenue", operational: "cost", risk: "revenue" };
                                    const metric = metricByType[d.decision_type] ?? d.decision_type;
                                    const result = await checkEvaluability(currentOrgId, activeDatasetId ?? null, metric);
                                    setEvaluabilityCheck(result);
                                    setEvaluabilityLoading(false);
                                  }
                                }} disabled={updatingId === d.id || !isLedgerDecisionReadyForApproval(d)}
                                  title={approvalBlockReason ?? "Approve"}
                                >
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => updateDecision(d.id, { decision_status: "rejected" })} disabled={updatingId === d.id}>
                                  Reject
                                </Button>
                                {approvalBlockReason && (
                                  <p className="max-w-44 text-[10px] leading-snug text-destructive">
                                    {approvalBlockReason}
                                  </p>
                                )}
                              </>
                            )}
                            {d.decision_status === "approved" && d.execution_status === "not_started" && (
                              <Button size="sm" variant="outline" onClick={() => updateDecision(d.id, { execution_status: "in_progress", execution_started_at: new Date().toISOString() })} disabled={updatingId === d.id}>
                                <PlayCircle className="w-3 h-3 mr-1" /> Start
                              </Button>
                            )}
                            {d.execution_status === "in_progress" && (
                              <Button size="sm" variant="outline" onClick={() => updateDecision(d.id, { execution_status: "completed", execution_completed_at: new Date().toISOString() })} disabled={updatingId === d.id}>
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                              </Button>
                            )}
                            {!d.decision_simulation_id && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="gap-1 text-xs"
                                onClick={() => { setSimTarget(d.id); setSimResult(null); }}
                              >
                                <Zap className="w-3 h-3" /> Simulate
                              </Button>
                            )}
                          </div>
                        </div>
                        <DecisionComments decisionId={d.id} />

                        <TrustStrip
                          record={trustFromDecision(d, currentOrgId)}
                          variant="compact"
                          className="mt-3"
                        />

                        {/* Execution, Replay & Evidence panels */}
                        <div className="mt-4 flex gap-2">
                          <Button
                            size="sm"
                            variant={expandedDecision === d.id ? "default" : "outline"}
                            onClick={() => setExpandedDecision(expandedDecision === d.id ? null : d.id)}
                            className="gap-1.5 text-xs"
                          >
                            <ArrowRight className="w-3 h-3" /> Evidence & Execution
                          </Button>
                        </div>
                        {expandedDecision === d.id && currentOrgId && (
                          <div className="mt-4 space-y-4">
                            <ExecutiveDecisionReview
                              decision={d}
                              organizationId={currentOrgId}
                            />
                            <ExplainDecisionPanel
                              explanation={d.explanation_metadata}
                              sourceInsightSummary={d.source_insight_summary}
                              recommendationLogicType={d.recommendation_logic_type}
                              decisionOrigin={d.decision_origin}
                              createdAt={d.created_at}
                              advisoryInstanceId={d.advisory_instance_id}
                              datasetId={null}
                              confidenceAtDecision={d.confidence_at_decision}
                              cappedConfidence={d.capped_confidence}
                              rawConfidence={d.raw_confidence}
                              confidenceCapReason={d.confidence_cap_reason}
                            />
                            <DecisionEvidencePanel
                              decisionId={d.id}
                              organizationId={currentOrgId}
                              decisionText={d.recommended_action}
                            />
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <ExecutionTimeline
                                organizationId={currentOrgId}
                                decisionId={d.id}
                                decisionTitle={d.recommended_action}
                              />
                              <DecisionReplayPanel
                                organizationId={currentOrgId}
                                decisionId={d.id}
                                decisionTitle={d.recommended_action}
                              />
                            </div>
                          </div>
                        )}
                    </div>
                  </motion.div>
                );
              })}
            </TabsContent>

            <TabsContent value="completed" className="space-y-3">
              {completedDecisions.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-16 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-base">No completed decisions yet</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                      Decisions appear here once they've been approved and executed.
                      Log and approve your first decision to start building your outcome record.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Log a Decision
                  </Button>
                </CardContent></Card>
              ) : completedDecisions.map(d => (
                <Card key={d.id}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className="text-xs capitalize">{d.decision_type.replace(/_/g, " ")}</Badge>
                          <Badge className="bg-success/10 text-success border-none text-xs">Completed</Badge>
                          {d.outcome_delta !== null && (
                            <Badge className={`border-none text-xs ${d.outcome_delta >= 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                              {d.outcome_delta >= 0 ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                              {d.outcome_delta > 0 ? "+" : ""}{d.outcome_delta}% delta
                            </Badge>
                          )}
                          {d.prediction_accuracy_score !== null && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <ShieldCheck className="w-3 h-3" /> Accuracy: {Number(d.prediction_accuracy_score).toFixed(0)}%
                            </Badge>
                          )}
                          {d.calibration_error !== null && (
                            <Badge variant="outline" className={`text-xs gap-1 ${Number(d.calibration_error) > 50 ? "border-destructive/30 text-destructive" : "border-success/30 text-success"}`}>
                              <Activity className="w-3 h-3" /> Cal. Error: {Number(d.calibration_error).toFixed(0)}
                            </Badge>
                          )}
                          {d.predicted_roi_probability !== null && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <DollarSign className="w-3 h-3" /> Predicted ROI: {Number(d.predicted_roi_probability).toFixed(0)}%
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium">{d.recommended_action}</p>
                        {d.chosen_action && <p className="text-xs text-muted-foreground mt-1">Chosen: {d.chosen_action}</p>}
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                          {d.raw_confidence !== null && <span>Raw conf: {Number(d.raw_confidence).toFixed(0)}%</span>}
                          {d.capped_confidence !== null && <span>Capped conf: {Number(d.capped_confidence).toFixed(0)}%</span>}
                          {d.predicted_net_impact !== null && (
                            <span>Predicted impact: {Number(d.predicted_net_impact) >= 0 ? "+" : ""}{fmt(Number(d.predicted_net_impact))}</span>
                          )}
                          {d.baseline_value !== null && <span>Baseline: {d.baseline_value}</span>}
                          {d.actual_value !== null && <span>Actual: {d.actual_value}</span>}
                        </div>
                        {d.confidence_cap_reason && (
                          <p className="text-[10px] text-muted-foreground/60 mt-1">{d.confidence_cap_reason}</p>
                        )}
                      </div>
                    </div>
                    {(d.linked_aicis_prediction_id || d.linked_aicis_recommendation_id) && currentOrgId && (
                      <OutcomeFeedbackWidget
                        decisionId={d.id}
                        organizationId={currentOrgId}
                        alreadyEvaluated={evaluatedAicisIds.has(d.id)}
                        onSubmitted={() => setEvaluatedAicisIds(prev => new Set(prev).add(d.id))}
                      />
                    )}
                    <DecisionComments decisionId={d.id} />
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
            </CollapsibleContent>
          </Collapsible>
          </SectionErrorBoundary>
        </main>

      {/* Decision Responsibility Confirmation Dialog */}
      <DecisionResponsibilityDialog
        open={!!approvalTarget}
        onOpenChange={(open) => { if (!open) { setApprovalTarget(null); setEvaluabilityCheck(null); } }}
        actionLabel={approvalTarget?.action || ""}
        onConfirm={() => {
          if (approvalTarget) {
            updateDecision(approvalTarget.id, { decision_status: "approved", decided_at: new Date().toISOString() });
            setApprovalTarget(null);
            setEvaluabilityCheck(null);
          }
        }}
      >
        {/* Evaluability gate inline */}
        {evaluabilityLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Checking outcome evaluability…
          </div>
        )}
        {evaluabilityCheck && (
          <div className="mt-3 rounded-lg border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant={evaluabilityBadgeVariant(evaluabilityCheck.status)} className="text-xs">
                {evaluabilityCheck.status.replace(/_/g, " ")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Score: {evaluabilityCheck.score}/{evaluabilityCheck.maxScore}
              </span>
            </div>
            {evaluabilityCheck.reasons.length > 0 && (
              <ul className="text-xs space-y-1">
                {evaluabilityCheck.reasons.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${evaluabilityColor(evaluabilityCheck.status)}`} />
                    <span className="text-muted-foreground">{r}</span>
                  </li>
                ))}
              </ul>
            )}
            {evaluabilityCheck.suggestions.length > 0 && (
              <ul className="text-xs space-y-1">
                {evaluabilityCheck.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <Target className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ul>
            )}
            {evaluabilityCheck.status === "NOT_MEASURABLE" && (
              <p className="text-xs font-medium text-destructive">
                ⚠ Outcome tracking will not be scheduled. Approve anyway?
              </p>
            )}
          </div>
        )}
      </DecisionResponsibilityDialog>
    </>
  );
};

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ResultCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold font-mono mt-0.5 ${positive ? "text-success" : "text-destructive"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ImpactDistribution({ sim }: { sim: ImpactSim }) {
  const min = Number(sim.p10_impact);
  const max = Number(sim.p90_impact);
  const range = max - min || 1;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - min) / range) * 100));
  const median = pos(Number(sim.median_net_impact));
  const expected = pos(Number(sim.expected_net_impact));
  const zeroPos = pos(0);

  return (
    <div className="space-y-2">
      <div className="relative h-10 rounded-lg overflow-hidden bg-muted">
        <div className="absolute inset-0 bg-gradient-to-r from-destructive/20 via-muted to-emerald-500/20" />
        {/* Zero line */}
        {zeroPos > 0 && zeroPos < 100 && (
          <div className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${zeroPos}%` }} />
        )}
        {/* Median */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/70" style={{ left: `${median}%` }} />
        {/* Expected */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-primary border-dashed" style={{ left: `${expected}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>P10: {fmt(sim.p10_impact)}</span>
        <span>Median: {fmt(sim.median_net_impact)}</span>
        <span>P90: {fmt(sim.p90_impact)}</span>
      </div>
    </div>
  );
}

export default DecisionLedgerPage;
