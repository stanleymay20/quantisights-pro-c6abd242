import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Target, TrendingUp, CheckCircle2, XCircle, Minus } from "lucide-react";
import ConfidenceBadge from "@/components/ConfidenceBadge";

interface DecisionOutcome {
  id: string;
  decision_id: string;
  outcome_status: string;
  accuracy_score: number | null;
  expected_metric: string;
  expected_direction: string;
  expected_change: number | null;
  observed_metric: string | null;
  observed_value_before: number | null;
  observed_value_after: number | null;
  evaluation_date: string | null;
  notes: string | null;
}

interface LedgerDecision {
  id: string;
  recommended_action: string;
  decision_type: string;
  execution_status: string;
  capped_confidence: number | null;
  created_at: string;
}

interface Props {
  organizationId: string;
}

const OUTCOME_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  success: { icon: CheckCircle2, color: "text-success", label: "Success" },
  partial_success: { icon: TrendingUp, color: "text-primary", label: "Partial" },
  no_effect: { icon: Minus, color: "text-muted-foreground", label: "No Effect" },
  negative: { icon: XCircle, color: "text-destructive", label: "Negative" },
  negative_outcome: { icon: XCircle, color: "text-destructive", label: "Negative" },
  not_evaluable: { icon: Minus, color: "text-muted-foreground", label: "Not Evaluable" },
  pending: { icon: Target, color: "text-warning", label: "Pending" },
  pending_evaluation: { icon: Target, color: "text-warning", label: "Pending" },
};

const isPendingStatus = (s: string) => s === "pending" || s === "pending_evaluation";
const isEvaluatedStatus = (s: string) => !isPendingStatus(s) && s !== "not_evaluable";

/**
 * Decision Outcome Integrity panel — shows expected vs actual
 * with accuracy scores and classification for each decision.
 */
const DecisionOutcomeIntegrity = ({ organizationId }: Props) => {
  const [outcomes, setOutcomes] = useState<(DecisionOutcome & { decision?: LedgerDecision })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const [outcomesRes, decisionsRes] = await Promise.all([
        supabase
          .from("decision_outcomes")
          .select("id, decision_id, outcome_status, accuracy_score, expected_metric, expected_direction, expected_change, observed_metric, observed_value_before, observed_value_after, evaluation_date, notes")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("decision_ledger")
          .select("id, recommended_action, decision_type, execution_status, capped_confidence, created_at")
          .eq("organization_id", organizationId)
          .limit(200),
      ]);

      const decisions = (decisionsRes.data || []) as LedgerDecision[];
      const decMap = new Map(decisions.map(d => [d.id, d]));

      const merged = ((outcomesRes.data || []) as DecisionOutcome[]).map(o => ({
        ...o,
        decision: decMap.get(o.decision_id),
      }));

      setOutcomes(merged);
      setLoading(false);
    };
    fetch();
  }, [organizationId]);

  if (loading) return null;
  if (outcomes.length === 0) return null;

  const evaluated = outcomes.filter(o => isEvaluatedStatus(o.outcome_status));
  const scored = evaluated.filter(o => o.accuracy_score !== null);
  const avgAccuracy = scored.length > 0
    ? scored.reduce((s, o) => s + (o.accuracy_score ?? 0), 0) / scored.length
    : null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <CardTitle className="text-base">Decision Outcome Integrity</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {evaluated.length}/{outcomes.length} evaluated
            </Badge>
            {avgAccuracy !== null && (
              <Badge variant="secondary" className="text-[10px]">
                Avg Accuracy: {avgAccuracy.toFixed(1)}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {outcomes.slice(0, 10).map((outcome) => {
          const statusCfg = OUTCOME_STATUS_CONFIG[outcome.outcome_status] || OUTCOME_STATUS_CONFIG.pending;
          const StatusIcon = statusCfg.icon;
          const isExpanded = expandedId === outcome.id;

          return (
            <div key={outcome.id} className="rounded-lg border border-border/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <StatusIcon className={`w-4 h-4 shrink-0 ${statusCfg.color}`} />
                  <span className="text-sm font-medium truncate">
                    {outcome.decision?.recommended_action || outcome.expected_metric}
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${statusCfg.color} shrink-0`}>
                    {statusCfg.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {outcome.accuracy_score !== null && (
                    <span className="text-xs font-bold">
                      {outcome.accuracy_score.toFixed(0)}%
                    </span>
                  )}
                  {outcome.decision?.capped_confidence != null && (
                    <ConfidenceBadge confidence={outcome.decision.capped_confidence} />
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setExpandedId(isExpanded ? null : outcome.id)}>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-border/20 space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="font-semibold text-foreground">Expected: </span>
                      <span className="text-muted-foreground">
                        {outcome.expected_metric} {outcome.expected_direction}
                        {outcome.expected_change != null ? ` by ${outcome.expected_change}%` : ""}
                      </span>
                    </div>
                    <div>
                      <span className="font-semibold text-foreground">Observed: </span>
                      <span className="text-muted-foreground">
                        {outcome.observed_metric || "—"}
                        {outcome.observed_value_before != null && outcome.observed_value_after != null
                          ? ` (${outcome.observed_value_before} → ${outcome.observed_value_after})`
                          : ""}
                      </span>
                    </div>
                  </div>
                  {outcome.notes && (
                    <div>
                      <span className="font-semibold text-foreground">Notes: </span>
                      <span className="text-muted-foreground">{outcome.notes}</span>
                    </div>
                  )}
                  {outcome.evaluation_date && (
                    <div className="text-muted-foreground/60">
                      Evaluated: {new Date(outcome.evaluation_date).toLocaleDateString("de-DE")}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default DecisionOutcomeIntegrity;
