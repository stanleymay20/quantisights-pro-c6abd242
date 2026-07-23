import { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Brain, AlertTriangle, TrendingDown, Clock, Sparkles, CheckCircle2, XCircle, Pencil, Loader2, ShieldCheck, FileCheck, Crosshair, Flame, Zap, User, CalendarDays, Target, Gauge } from "lucide-react";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import MissionAlignmentBadge from "./MissionAlignmentBadge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationalIdentity, assessMissionAlignment } from "@/hooks/useOrganizationalIdentity";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import DecisionResponsibilityDialog from "@/components/DecisionResponsibilityDialog";
import ModifyDecisionDialog from "./ModifyDecisionDialog";
import OutputClassificationBadge from "./OutputClassificationBadge";
import TraceabilityPanel from "./TraceabilityPanel";
import SimilarDecisionsPanel from "./SimilarDecisionsPanel";
import DismissReasonDialog from "./DismissReasonDialog";
import { useBuildDecisionQueue, type EnrichedDecision } from "@/hooks/useBuildDecisionQueue";
import { onDecisionApproved, onDecisionDismissed } from "@/lib/decision-lifecycle";
import type { Insight } from "@/hooks/useInsights";

export type { EnrichedDecision };

interface DecisionQueueProps {
  organizationId: string;
  insights: Insight[];
  churnRate: number;
  revenue: number;
  pendingDecisions: number;
  calibrationScore: number | null;
  datasetId?: string;
  activeContextId?: string | null;
}

const URGENCY_STYLES = {
  critical: {
    border: "border-destructive/30",
    bg: "bg-destructive/[0.04]",
    badge: "bg-destructive/10 text-destructive",
    icon: AlertTriangle,
  },
  high: {
    border: "border-warning/30",
    bg: "bg-warning/[0.04]",
    badge: "bg-warning/10 text-warning",
    icon: TrendingDown,
  },
  medium: {
    border: "border-primary/30",
    bg: "bg-primary/[0.04]",
    badge: "bg-primary/10 text-primary",
    icon: Brain,
  },
};

const COD_LABEL_STYLES: Record<string, string> = {
  critical: "bg-destructive/10 text-destructive",
  high: "bg-warning/10 text-warning",
  medium: "bg-primary/10 text-primary",
  low: "bg-muted/50 text-muted-foreground",
};

type EscalationTier = "fresh" | "aging" | "escalating" | "at_risk";

const ESCALATION_CONFIG: Record<EscalationTier, { label: string; badgeClass: string; icon: typeof Flame }> = {
  fresh: { label: "", badgeClass: "", icon: Clock },
  aging: { label: "Aging", badgeClass: "bg-warning/10 text-warning", icon: Clock },
  escalating: { label: "Escalating", badgeClass: "bg-destructive/10 text-destructive", icon: Flame },
  at_risk: { label: "At Risk", badgeClass: "bg-destructive/10 text-destructive animate-pulse", icon: Flame },
};

function getEscalationTier(createdAt: string | undefined, urgency: string): EscalationTier {
  if (!createdAt) return "fresh";
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (urgency === "critical") {
    if (ageHours > 120) return "at_risk";
    if (ageHours > 72) return "escalating";
    if (ageHours > 24) return "aging";
  } else if (urgency === "high") {
    if (ageHours > 168) return "at_risk";
    if (ageHours > 96) return "escalating";
    if (ageHours > 48) return "aging";
  } else {
    if (ageHours > 336) return "at_risk";
    if (ageHours > 168) return "escalating";
    if (ageHours > 72) return "aging";
  }
  return "fresh";
}

function formatAge(createdAt: string | undefined): string {
  if (!createdAt) return "";
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Confirmation {
  decisionTitle: string;
  action: "approved" | "dismissed" | "modified";
}

function approvalBlockedReason(decision: EnrichedDecision): string | null {
  if (!decision.recommendation.isDecisionGrade) {
    return decision.recommendation.decisionGateMessage
      || "Evidence review required: this recommendation is not decision-grade yet.";
  }
  if (decision.recommendation.executionReadiness.level === "low") {
    return "Evidence review required: execution readiness is low.";
  }
  return null;
}

function isEvidenceReadyForApproval(decision: EnrichedDecision): boolean {
  return approvalBlockedReason(decision) === null;
}

const DecisionQueue = memo(({
  organizationId,
  insights,
  churnRate,
  revenue,
  pendingDecisions,
  calibrationScore,
  datasetId,
  activeContextId,
}: DecisionQueueProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { identity } = useOrganizationalIdentity(organizationId);
  const { decisions, setDecisions, loading } = useBuildDecisionQueue({
    organizationId,
    insights,
    churnRate,
    revenue,
    pendingDecisions,
    calibrationScore,
    datasetId,
    identity,
  });
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [modifyTarget, setModifyTarget] = useState<EnrichedDecision | null>(null);

  // Responsibility dialog state for approve flow
  const [approveTarget, setApproveTarget] = useState<EnrichedDecision | null>(null);

  // Dismiss reason dialog state
  const [dismissTarget, setDismissTarget] = useState<EnrichedDecision | null>(null);

  const focusedDecision = decisions[focusIndex] ?? null;

  // Stage 1: Open responsibility dialog before approve
  const initiateApprove = useCallback((decision: EnrichedDecision) => {
    const blockedReason = approvalBlockedReason(decision);
    if (blockedReason) {
      toast({ title: "Cannot approve", description: blockedReason, variant: "destructive" });
      return;
    }
    setApproveTarget(decision);
  }, [toast]);

  // Stage 2: After responsibility acknowledgment, persist
  const executeApprove = useCallback(async (decision: EnrichedDecision) => {
    setActingOn(decision.id);
    try {
      if (decision.type === "advisory" && decision.sourceId) {
        await supabase.from("advisory_instances").update({ status: "in_progress", assigned_to: user?.id }).eq("id", decision.sourceId).eq("organization_id", organizationId);
      }
      if (decision.type === "signal" && decision.sourceId) {
        await supabase.from("insights").update({ is_read: true }).eq("id", decision.sourceId).eq("organization_id", organizationId);
      }
      const { data: ledgerRow, error: ledgerError } = await supabase.from("decision_ledger").insert({
        organization_id: organizationId,
        recommended_action: decision.recommendation.recommendedAction,
        chosen_action: decision.recommendation.recommendedAction,
        decided_by: user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_status: "approved",
        confidence_at_decision: decision.confidence ?? 50,
        raw_confidence: decision.rawConfidence ?? null,
        capped_confidence: decision.cappedConfidence ?? null,
        confidence_cap_reason: decision.confidenceCapReason ?? null,
        decision_type: "strategic",
        decision_context_id: activeContextId ?? null,
        notes: `Owner: ${decision.recommendation.suggestedOwner} | Due: ${decision.costOfDelayResult.recommendedActionWindowDays}d | Metrics: ${decision.recommendation.successMetrics.join(", ")}`,
      }).select("id").single();
      if (ledgerError) throw ledgerError;

      // Lifecycle side effects: audit log + execution plan + outcome
      if (ledgerRow?.id) {
        await onDecisionApproved({
          decisionId: ledgerRow.id,
          organizationId,
          userId: user?.id ?? null,
          recommendedAction: decision.recommendation.recommendedAction,
          confidence: decision.cappedConfidence ?? decision.confidence ?? 50,
          datasetId: datasetId ?? null,
          expectedMetric: decision.recommendation.successMetrics?.[0] ?? null,
          evaluationWindowDays: decision.costOfDelayResult.recommendedActionWindowDays || 30,
          suggestedOwner: decision.recommendation.suggestedOwner ?? null,
        });
      }

      setDecisions(prev => prev.filter(d => d.id !== decision.id));
      setConfirmation({ decisionTitle: decision.title, action: "approved" });
    } catch (err) {
      console.error("[DecisionQueue] Approve failed:", err);
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  }, [organizationId, user?.id, toast, activeContextId, setDecisions, datasetId]);

  // Stage 1: Open dismiss reason dialog
  const initiateDismiss = useCallback((decision: EnrichedDecision) => {
    setDismissTarget(decision);
  }, []);

  // Stage 2: After reason provided, persist dismissal to ledger
  const executeDismiss = useCallback(async (decision: EnrichedDecision, reason: string) => {
    setActingOn(decision.id);
    try {
      if (decision.type === "advisory" && decision.sourceId) {
        await supabase.from("advisory_instances").update({ status: "dismissed" }).eq("id", decision.sourceId).eq("organization_id", organizationId);
      }
      if (decision.type === "signal" && decision.sourceId) {
        await supabase.from("insights").update({ is_read: true }).eq("id", decision.sourceId).eq("organization_id", organizationId);
      }
      const { data: ledgerRow } = await supabase.from("decision_ledger").insert({
        organization_id: organizationId,
        recommended_action: decision.recommendation.recommendedAction,
        chosen_action: "Dismissed",
        decided_by: user?.id ?? null,
        decided_at: new Date().toISOString(),
        decision_status: "dismissed",
        confidence_at_decision: decision.confidence ?? 50,
        raw_confidence: decision.rawConfidence ?? null,
        capped_confidence: decision.cappedConfidence ?? null,
        confidence_cap_reason: decision.confidenceCapReason ?? null,
        decision_type: "strategic",
        decision_context_id: activeContextId ?? null,
        notes: reason ? `Dismiss reason: ${reason}` : "Dismissed without reason",
      }).select("id").single();

      // Audit trail for dismissal
      if (ledgerRow?.id) {
        await onDecisionDismissed({
          decisionId: ledgerRow.id,
          organizationId,
          userId: user?.id ?? null,
          reason,
          recommendedAction: decision.recommendation.recommendedAction,
        });
      }
      setDecisions(prev => prev.filter(d => d.id !== decision.id));
      setConfirmation({ decisionTitle: decision.title, action: "dismissed" });
    } catch (err) {
      console.error("[DecisionQueue] Dismiss failed:", err);
      toast({ title: "Action failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setActingOn(null);
    }
  }, [organizationId, user?.id, toast, activeContextId, setDecisions]);

  const handleModifySaved = useCallback((updated: Partial<EnrichedDecision>) => {
    setDecisions(prev => prev.filter(d => d.id !== updated.id));
    setConfirmation({ decisionTitle: updated.title ?? "Decision", action: "modified" });
  }, [setDecisions]);

  // Keyboard shortcuts now go through the dialog gates
  useKeyboardShortcuts({
    onNext: () => setFocusIndex(i => Math.min(i + 1, decisions.length - 1)),
    onPrev: () => setFocusIndex(i => Math.max(i - 1, 0)),
    onApprove: () => { if (focusedDecision && !actingOn) initiateApprove(focusedDecision); },
    onDismiss: () => { if (focusedDecision && !actingOn) initiateDismiss(focusedDecision); },
  }, decisions.length > 0);

  // Reset focus when decisions change
  useEffect(() => {
    setFocusIndex(0);
  }, [decisions.length]);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (decisions.length === 0 && !confirmation) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12 px-6">
        <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-success" />
        </div>
        <h3 className="text-[14px] font-semibold mb-1">All clear</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          No decisions require your attention. The system is monitoring continuously.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Confirmation Banner */}
      <AnimatePresence>
        {confirmation && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="rounded-xl border border-success/30 bg-success/[0.04] p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-success">
                  Decision {confirmation.action}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{confirmation.decisionTitle}</p>
                <div className="flex items-center gap-3 mt-2.5 flex-wrap">
                  <span className="text-[10px] flex items-center gap-1 text-muted-foreground">
                    <FileCheck className="w-3 h-3 text-success" /> Audit trail logged
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {decisions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Decision Ledger</h2>
              <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">{decisions.length}</span>
            </div>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              <kbd className="px-1.5 py-0.5 rounded border border-border/50 text-[9px] font-mono mr-1">J</kbd>
              <kbd className="px-1.5 py-0.5 rounded border border-border/50 text-[9px] font-mono mr-1">K</kbd>
              navigate ·
              <kbd className="px-1.5 py-0.5 rounded border border-border/50 text-[9px] font-mono mx-1">A</kbd>
              approve ·
              <kbd className="px-1.5 py-0.5 rounded border border-border/50 text-[9px] font-mono mx-1">D</kbd>
              dismiss
            </span>
          </div>

          <AnimatePresence mode="popLayout">
            {decisions.map((decision, index) => {
              const style = URGENCY_STYLES[decision.urgency];
              const Icon = style.icon;
              const isActing = actingOn === decision.id;
              const isFocused = focusIndex === index;
              const escalation = getEscalationTier(decision.createdAt, decision.urgency);
              const escConfig = ESCALATION_CONFIG[escalation];
              const age = formatAge(decision.createdAt);
              const cod = decision.costOfDelayResult;
              const rec = decision.recommendation;

              return (
                <motion.div
                  key={decision.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100, height: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded-xl border ${style.border} ${style.bg} p-4 transition-all hover:shadow-lg hover:shadow-primary/5 ${
                    isFocused ? "ring-2 ring-primary/40 ring-offset-1 ring-offset-background" : ""
                  }`}
                  onClick={() => setFocusIndex(index)}
                >
                  <div className="flex flex-col sm:flex-row items-start gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Priority rank number */}
                        <div className="flex flex-col items-center gap-1.5 pt-0.5 shrink-0">
                          <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                            #{index + 1}
                          </span>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${style.badge}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <span className={`text-[9px] font-bold uppercase tracking-widest ${style.badge} px-1.5 py-0.5 rounded`}>
                            {decision.urgency}
                          </span>
                        </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="text-sm font-semibold leading-tight">{decision.title}</p>
                          {escalation !== "fresh" && (
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1 ${escConfig.badgeClass}`}>
                              <escConfig.icon className="w-2.5 h-2.5" />
                              {escConfig.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{decision.context}</p>

                        {/* Cost of Delay */}
                        <div className="flex items-start gap-2 mb-2.5 p-2.5 rounded-lg bg-background/80 border border-border/20">
                          <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${
                            cod.label === "critical" ? "text-destructive" :
                            cod.label === "high" ? "text-warning" : "text-muted-foreground"
                          }`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Cost of Delay
                              </span>
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${COD_LABEL_STYLES[cod.label]}`}>
                                {cod.label}
                              </span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {cod.score}/100
                              </span>
                              <OutputClassificationBadge classification="HEURISTIC_ESTIMATE" compact />
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="text-xs font-semibold text-foreground">{cod.estimatedDelayCost}</span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <CalendarDays className="w-2.5 h-2.5" />
                                Act within {cod.recommendedActionWindowDays}d
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{cod.reason}</p>
                          </div>
                        </div>

                        {/* Metadata badges */}
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded">
                            {decision.source}
                          </span>
                          {decision.confidence != null && (
                            <ConfidenceBadge
                              confidence={
                                decision.rawConfidence != null || decision.cappedConfidence != null
                                  ? {
                                      raw_confidence: decision.rawConfidence ?? undefined,
                                      capped_confidence: decision.cappedConfidence ?? undefined,
                                      confidence_cap_reason: decision.confidenceCapReason ?? undefined,
                                      sample_size: decision.sampleSize ?? undefined,
                                    }
                                  : decision.confidence
                              }
                              showDetails
                              isHeuristic={rec.confidenceBasis?.isHeuristic}
                            />
                          )}
                          {decision.missionAlignment && (
                            <MissionAlignmentBadge
                              score={decision.missionAlignment.score}
                              alignment={decision.missionAlignment.alignment}
                              factors={decision.missionAlignment.factors}
                              ethicalConflict={decision.missionAlignment.ethicalConflict}
                            />
                          )}
                          {!decision.missionAlignment && identity && (() => {
                            const alignment = assessMissionAlignment(identity, decision.type === "advisory" ? "risk_management" : "general", rec.recommendedAction);
                            return <MissionAlignmentBadge score={alignment.score} alignment={alignment.alignment} factors={alignment.factors} />;
                          })()}
                          {decision.confidenceCapReason && /heuristic/i.test(decision.confidenceCapReason) && (
                            <span className="text-[9px] font-bold text-warning bg-warning/10 px-1.5 py-0.5 rounded uppercase">
                              Heuristic
                            </span>
                          )}
                          {decision.timeframe && (
                            <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {decision.timeframe}
                            </span>
                          )}
                          {age && (
                            <span className="text-[10px] bg-muted/50 text-muted-foreground px-2 py-0.5 rounded flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5" /> {age}
                            </span>
                          )}
                        </div>

                        {/* FAIL-CLOSED GATE: Show gate message if not decision-grade */}
                        {rec.decisionGateMessage && (
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20 mb-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-0.5">Not Decision-Grade</p>
                              <p className="text-[10px] text-destructive/80">{rec.decisionGateMessage}</p>
                            </div>
                          </div>
                        )}

                        {/* Classified Recommendation Sections */}
                        <div className="p-2.5 rounded-lg bg-background/60 border border-border/30 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Structured Intelligence
                            </p>
                            {rec.qualityScore && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                rec.qualityScore.grade === "A" || rec.qualityScore.grade === "B"
                                  ? "bg-success/10 text-success"
                                  : rec.qualityScore.grade === "C"
                                  ? "bg-warning/10 text-warning"
                                  : "bg-destructive/10 text-destructive"
                              }`}>
                                Quality: {rec.qualityScore.grade} ({rec.qualityScore.overall}/100)
                              </span>
                            )}
                          </div>

                          {rec.sections.map((section, si) => (
                            <div key={si} className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <OutputClassificationBadge classification={section.classification} compact />
                                <span className="text-[10px] font-semibold text-foreground">{section.label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground pl-4 leading-relaxed">{section.content}</p>
                            </div>
                          ))}

                          {rec.assumptions && rec.assumptions.length > 0 && (
                            <p className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Assumptions:</span> {rec.assumptions.slice(0, 2).join("; ")}</p>
                          )}
                          {rec.riskIfWrong && (
                            <p className="text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Risk if wrong:</span> {rec.riskIfWrong}</p>
                          )}
                          {rec.confidenceBasis && (
                            <p className="text-[10px] text-muted-foreground italic">
                              {rec.confidenceBasis.isHeuristic ? "⚠ " : ""}{rec.confidenceBasis.label}
                            </p>
                          )}

                          <div className="flex items-center gap-4 flex-wrap pt-1 border-t border-border/20">
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <User className="w-2.5 h-2.5" /> <span className="font-semibold text-foreground">Owner:</span> {rec.suggestedOwner}
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <CalendarDays className="w-2.5 h-2.5" /> {rec.suggestedDeadlineDays}d deadline
                            </span>
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Target className="w-2.5 h-2.5" /> <span className="font-semibold text-foreground">Success:</span> {rec.successMetrics.slice(0, 2).join("; ")}
                            </span>
                            <span className={`text-[10px] flex items-center gap-1 ${
                              rec.executionReadiness.level === "high" ? "text-success" :
                              rec.executionReadiness.level === "moderate" ? "text-warning" : "text-destructive"
                            }`}>
                              <Gauge className="w-2.5 h-2.5" /> <span className="font-semibold">Readiness: {rec.executionReadiness.label}</span>
                            </span>
                          </div>
                        </div>

                        {/* Traceability Panel */}
                        <TraceabilityPanel
                          traceability={rec.traceability}
                          confidenceBasis={rec.confidenceBasis}
                          assumptions={rec.assumptions}
                        />

                        {/* Similar Past Decisions (Institutional Memory) */}
                        <SimilarDecisionsPanel
                          organizationId={organizationId}
                          queryText={rec.recommendedAction}
                        />
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-col gap-1.5 shrink-0 w-full sm:w-auto">
                      <button
                        onClick={() => initiateApprove(decision)}
                        disabled={isActing || !isEvidenceReadyForApproval(decision)}
                        title={approvalBlockedReason(decision) ?? "Approve"}
                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-target"
                      >
                        {isActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                        Approve
                      </button>
                      <div className="grid grid-cols-2 sm:grid-cols-1 gap-1.5">
                        <button
                          onClick={() => initiateDismiss(decision)}
                          disabled={isActing}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg border border-border/50 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50 touch-target"
                        >
                          <XCircle className="w-3 h-3" />
                          Dismiss
                        </button>
                        <button
                          onClick={() => setModifyTarget(decision)}
                          disabled={isActing}
                          className="flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50 touch-target"
                        >
                          <Pencil className="w-3 h-3" />
                          Modify
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </>
      )}

      {/* Responsibility acknowledgment gate for approvals */}
      <DecisionResponsibilityDialog
        open={!!approveTarget}
        onOpenChange={(open) => { if (!open) setApproveTarget(null); }}
        actionLabel={approveTarget?.recommendation.recommendedAction ?? ""}
        onConfirm={() => {
          if (approveTarget) {
            executeApprove(approveTarget);
            setApproveTarget(null);
          }
        }}
      />

      {/* Dismiss reason dialog */}
      <DismissReasonDialog
        open={!!dismissTarget}
        onOpenChange={(open) => { if (!open) setDismissTarget(null); }}
        decisionTitle={dismissTarget?.title ?? ""}
        onConfirm={(reason) => {
          if (dismissTarget) {
            executeDismiss(dismissTarget, reason);
            setDismissTarget(null);
          }
        }}
      />

      <ModifyDecisionDialog
        decision={modifyTarget}
        organizationId={organizationId}
        datasetId={datasetId}
        open={!!modifyTarget}
        onOpenChange={(open) => { if (!open) setModifyTarget(null); }}
        onSaved={handleModifySaved}
      />
    </div>
  );
});

DecisionQueue.displayName = "DecisionQueue";

export default DecisionQueue;
