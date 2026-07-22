import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Brain, CheckCircle2, XCircle, Clock, TrendingUp, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface DecisionMemoryWidgetProps {
  organizationId: string;
}

interface RecentDecision {
  id: string;
  recommended_action: string;
  decision_status: string;
  confidence_at_decision: number | null;
  created_at: string;
  outcome_delta: number | null;
  predicted_net_impact: number | null;
  prediction_accuracy_score: number | null;
  outcome_measured_at: string | null;
  execution_status: string;
  calibration_error: number | null;
}

const LIFECYCLE_STATES: Record<string, { label: string; color: string }> = {
  pending_review: { label: "Recommended", color: "text-muted-foreground" },
  approved: { label: "Approved", color: "text-primary" },
  executed: { label: "In Progress", color: "text-warning" },
  completed: { label: "Outcome Recorded", color: "text-success" },
  dismissed: { label: "Dismissed", color: "text-muted-foreground" },
};

function deriveLifecycleState(d: RecentDecision): { label: string; color: string } {
  if (d.outcome_measured_at && d.outcome_delta != null) {
    return d.calibration_error != null
      ? { label: "Recalibrated", color: "text-success" }
      : { label: "Outcome Recorded", color: "text-success" };
  }
  if (d.execution_status === "completed") return LIFECYCLE_STATES.completed;
  if (d.execution_status === "in_progress") return LIFECYCLE_STATES.executed;
  return LIFECYCLE_STATES[d.decision_status] ?? LIFECYCLE_STATES.pending_review;
}

function deriveLearning(d: RecentDecision): string | null {
  if (d.outcome_delta == null || d.outcome_measured_at == null) return null;
  const predicted = d.predicted_net_impact;
  const actual = d.outcome_delta;
  const accuracy = d.prediction_accuracy_score;

  if (predicted != null && actual != null) {
    const withinRange = Math.abs(actual - predicted) <= Math.abs(predicted) * 0.3;
    if (withinRange) {
      return `Outcome within modeled range (predicted ${predicted > 0 ? "+" : ""}${predicted.toFixed(1)}%, actual ${actual > 0 ? "+" : ""}${actual.toFixed(1)}%). Confidence reinforced for similar signals.`;
    }
    if (actual < predicted) {
      return `Model overestimated impact (predicted ${predicted > 0 ? "+" : ""}${predicted.toFixed(1)}%, actual ${actual > 0 ? "+" : ""}${actual.toFixed(1)}%). Confidence adjusted downward for this signal class.`;
    }
    return `Outcome exceeded prediction (predicted ${predicted > 0 ? "+" : ""}${predicted.toFixed(1)}%, actual ${actual > 0 ? "+" : ""}${actual.toFixed(1)}%). Model updated to recognize stronger effect patterns.`;
  }

  if (accuracy != null) {
    if (accuracy >= 70) return `Prediction accuracy ${Math.round(accuracy)}% — model confidence reinforced.`;
    if (accuracy >= 40) return `Prediction accuracy ${Math.round(accuracy)}% — model recalibrating for this signal class.`;
    return `Prediction accuracy ${Math.round(accuracy)}% — confidence reduced for similar future cases until more outcome data collected.`;
  }

  return `Outcome recorded (${actual > 0 ? "+" : ""}${actual.toFixed(1)}%). Feeding into calibration engine.`;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  approved: { icon: CheckCircle2, color: "text-success", label: "Approved" },
  executed: { icon: CheckCircle2, color: "text-success", label: "Executed" },
  dismissed: { icon: XCircle, color: "text-muted-foreground", label: "Dismissed" },
  pending_review: { icon: Clock, color: "text-warning", label: "Pending" },
  modified: { icon: TrendingUp, color: "text-primary", label: "Modified" },
};

const DecisionMemoryWidget = memo(({ organizationId }: DecisionMemoryWidgetProps) => {
  const [decisions, setDecisions] = useState<RecentDecision[]>([]);
  const [calibrationTrend, setCalibrationTrend] = useState<{ current: number | null; previous: number | null }>({ current: null, previous: null });
  const [totalDecisions, setTotalDecisions] = useState(0);

  useEffect(() => {
    if (!organizationId) return;

    const fetchData = async () => {
      const [decRes, calRes, countRes] = await Promise.all([
        supabase
          .from("decision_ledger")
          .select("id, recommended_action, decision_status, confidence_at_decision, created_at, outcome_delta, predicted_net_impact, prediction_accuracy_score, outcome_measured_at, execution_status, calibration_error")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("calibration_models")
          .select("overall_calibration_score, computed_at")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(2),
        supabase
          .from("decision_ledger")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", organizationId),
      ]);

      if (decRes.data) setDecisions(decRes.data as unknown as RecentDecision[]);
      if (calRes.data && calRes.data.length > 0) {
        setCalibrationTrend({
          current: calRes.data[0]?.overall_calibration_score ?? null,
          previous: calRes.data[1]?.overall_calibration_score ?? null,
        });
      }
      setTotalDecisions(countRes.count || 0);
    };

    fetchData();
  }, [organizationId]);

  const isEmpty = decisions.length === 0 && calibrationTrend.current == null;

  const calDelta = calibrationTrend.current != null && calibrationTrend.previous != null
    ? calibrationTrend.current - calibrationTrend.previous
    : null;

  const [expanded, setExpanded] = useState(false);
  const measuredCount = decisions.filter(d => d.outcome_measured_at != null).length;
  const recalibratedCount = decisions.filter(d => d.calibration_error != null).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.4 }}
      className="glass-card rounded-xl p-3 sm:p-5 border border-border/30"
    >
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs sm:text-sm font-semibold tracking-tight">Decision Memory</h3>
        </div>
        <Link to="/decisions" className="text-[10px] sm:text-[11px] font-semibold text-primary hover:underline flex items-center gap-0.5">
          {isEmpty ? "Log first" : "Full ledger"} <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isEmpty ? (
        <div className="p-3 sm:p-4 rounded-lg bg-muted/20 border border-border/20 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Records every decision with confidence and expected outcome, then compares predictions to reality.
          </p>
          <p className="text-[10px] text-primary mt-2 font-medium">
            Start building your organization's decision memory.
          </p>
        </div>
      ) : (
        <>
          {/* Mobile compact summary */}
          <div className="sm:hidden">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
              <div className="text-xs">
                <span className="font-semibold">{totalDecisions}</span> <span className="text-muted-foreground">decisions</span>
                {measuredCount > 0 && <> · <span className="font-semibold text-success">{measuredCount}</span> <span className="text-muted-foreground">measured</span></>}
                {recalibratedCount > 0 && <> · <span className="font-semibold text-primary">{recalibratedCount}</span> <span className="text-muted-foreground">recalibrated</span></>}
              </div>
              <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-primary font-medium">{expanded ? "Less" : "More"}</button>
            </div>
            {calibrationTrend.current != null && (
              <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="text-muted-foreground">Calibration:</span>
                <span className="font-bold font-mono">{calibrationTrend.current}%</span>
                {calDelta != null && calDelta !== 0 && (
                  <span className={`text-[11px] font-medium ${calDelta > 0 ? "text-success" : "text-destructive"}`}>
                    {calDelta > 0 ? "+" : ""}{calDelta.toFixed(1)}pp
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Desktop full view / mobile expanded */}
          <div className={`${expanded ? "block" : "hidden"} sm:block`}>
          {/* Calibration Score */}
          {calibrationTrend.current != null && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 mb-3">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Calibration Score</p>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-xl font-bold font-mono">{calibrationTrend.current}%</span>
                  {calDelta != null && calDelta !== 0 && (
                    <span className={`text-[11px] font-medium ${calDelta > 0 ? "text-success" : "text-destructive"}`}>
                      {calDelta > 0 ? "+" : ""}{calDelta.toFixed(1)}pp
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">Total decisions</p>
                <p className="text-sm font-semibold font-mono">{totalDecisions}</p>
              </div>
            </div>
          )}

          {/* Recent Decisions with Lifecycle + Outcome */}
          {decisions.length > 0 && (
            <div className="space-y-1">
              {decisions.slice(0, 5).map((d) => {
                const cfg = STATUS_CONFIG[d.decision_status] || STATUS_CONFIG.pending_review;
                const StatusIcon = cfg.icon;
                const daysAgo = Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000);
                const lifecycle = deriveLifecycleState(d);
                const learning = deriveLearning(d);
                const hasOutcome = d.outcome_delta != null && d.outcome_measured_at != null;

                return (
                  <div key={d.id} className="py-2 px-2.5 rounded-lg hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-2.5">
                      <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">{d.recommended_action}</p>
                      </div>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${lifecycle.color} bg-muted/40`}>
                        {lifecycle.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">
                        {daysAgo === 0 ? "today" : `${daysAgo}d`}
                      </span>
                    </div>

                    {/* Outcome comparison row */}
                    {hasOutcome && (
                      <div className="mt-1.5 ml-6 flex items-center gap-3 text-[10px]">
                        {d.predicted_net_impact != null && (
                          <span className="text-muted-foreground">
                            Predicted: <span className="font-mono font-semibold">{d.predicted_net_impact > 0 ? "+" : ""}{d.predicted_net_impact.toFixed(1)}%</span>
                          </span>
                        )}
                        <span className={`font-mono font-semibold ${(d.outcome_delta ?? 0) >= 0 ? "text-success" : "text-destructive"}`}>
                          Actual: {(d.outcome_delta ?? 0) > 0 ? "+" : ""}{(d.outcome_delta ?? 0).toFixed(1)}%
                        </span>
                        {d.prediction_accuracy_score != null && (
                          <span className={`${d.prediction_accuracy_score >= 70 ? "text-success" : d.prediction_accuracy_score >= 40 ? "text-warning" : "text-destructive"}`}>
                            Accuracy: {Math.round(d.prediction_accuracy_score)}%
                          </span>
                        )}
                      </div>
                    )}

                    {/* Learning line */}
                    {learning && (
                      <p className="mt-1 ml-6 text-[10px] text-muted-foreground italic leading-relaxed">
                        ↳ {learning}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Lifecycle legend */}
          <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/20 flex-wrap">
            {["Recommended", "Approved", "Outcome Recorded", "Recalibrated"].map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                {i > 0 && <span className="text-[8px] text-muted-foreground/40">→</span>}
                <span className="text-[9px] text-muted-foreground/60">{stage}</span>
              </div>
            ))}
          </div>
          </div>
        </>
      )}
    </motion.div>
  );
});

DecisionMemoryWidget.displayName = "DecisionMemoryWidget";

export default DecisionMemoryWidget;
