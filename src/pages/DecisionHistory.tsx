import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import {
  CheckCircle2, XCircle, Clock, Loader2, BookOpen, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import ExplainDecisionPanel from "@/components/dashboard/ExplainDecisionPanel";
import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";

interface HistoryRecord {
  id: string;
  recommended_action: string;
  decision_status: string;
  confidence_at_decision: number | null;
  outcome_delta: number | null;
  prediction_accuracy_score: number | null;
  outcome_measured_at: string | null;
  created_at: string;
  advisory_instance_id: string | null;
  raw_confidence: number | null;
  capped_confidence: number | null;
  confidence_cap_reason: string | null;
  explanation_metadata: ExplanationMetadata | null;
  source_insight_summary: string | null;
  recommendation_logic_type: string | null;
  decision_origin: string;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  approved: { icon: CheckCircle2, color: "text-success", label: "Approved" },
  rejected: { icon: XCircle, color: "text-destructive", label: "Rejected" },
  pending: { icon: Clock, color: "text-warning", label: "Pending" },
};

const DecisionHistory = () => {
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, decision_status, confidence_at_decision, outcome_delta, prediction_accuracy_score, outcome_measured_at, created_at, advisory_instance_id, raw_confidence, capped_confidence, confidence_cap_reason, explanation_metadata, source_insight_summary, recommendation_logic_type, decision_origin")
        .eq("organization_id", currentOrgId)
        .eq("is_suppressed", false)
        .order("created_at", { ascending: false })
        .limit(200);
      setRecords((data as HistoryRecord[] | null) ?? []);
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Decision History</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every decision your team has made, and what happened.
            </p>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold mb-1">No decision history yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-5">
              Every decision you log, approve, and execute builds a permanent, board-defensible
              audit trail here — including what was predicted and what actually happened.
            </p>
            <Button size="sm" onClick={() => navigate("/decisions")}>
              Go to Decision Ledger <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((r, i) => {
              const cfg = STATUS_CONFIG[r.decision_status] ?? STATUS_CONFIG.pending;
              const Icon = cfg.icon;
              const hasOutcome = r.outcome_measured_at && r.outcome_delta != null;
              const isExpanded = expandedId === r.id;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Card
                    className="cursor-pointer hover:border-primary/20 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start gap-3">
                        <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium leading-snug">{r.recommended_action}</p>
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            <Badge variant="secondary" className="text-[10px]">{cfg.label}</Badge>
                            {r.decision_origin === "ai_generated" && (
                              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">AI-Generated</Badge>
                            )}
                            {r.confidence_at_decision != null && (
                              <span className="text-[11px] text-muted-foreground">
                                {Math.round(r.confidence_at_decision)}% confidence
                              </span>
                            )}
                            {hasOutcome && (
                              <Badge
                                variant={(r.outcome_delta ?? 0) >= 0 ? "default" : "destructive"}
                                className="text-[10px]"
                              >
                                {(r.outcome_delta ?? 0) >= 0 ? "+" : ""}{(r.outcome_delta ?? 0).toFixed(1)}%
                              </Badge>
                            )}
                            {r.prediction_accuracy_score != null && (
                              <span className="text-[11px] text-muted-foreground">
                                {r.prediction_accuracy_score.toFixed(0)}% accuracy
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                          {format(new Date(r.created_at), "MMM d")}
                        </span>
                      </div>

                      {isExpanded && (
                        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                          <ExplainDecisionPanel
                            explanation={r.explanation_metadata}
                            sourceInsightSummary={r.source_insight_summary}
                            recommendationLogicType={r.recommendation_logic_type}
                            decisionOrigin={r.decision_origin}
                            createdAt={r.created_at}
                            advisoryInstanceId={r.advisory_instance_id}
                            confidenceAtDecision={r.confidence_at_decision}
                            cappedConfidence={r.capped_confidence}
                            rawConfidence={r.raw_confidence}
                            confidenceCapReason={r.confidence_cap_reason}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};

export default DecisionHistory;
