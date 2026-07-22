import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Target, CheckCircle2, TrendingUp, Brain, BarChart3 } from "lucide-react";

interface ProofMetrics {
  totalDecisions: number;
  outcomesMeasured: number;
  predictionAccuracy: number | null;
  calibrationScore: number | null;
  closedLoopRate: number;
}

interface ProofBarProps {
  organizationId: string | null;
}

const ProofBar = ({ organizationId }: ProofBarProps) => {
  const [metrics, setMetrics] = useState<ProofMetrics | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const fetch = async () => {
      const [decisionsRes, outcomesRes, calRes] = await Promise.all([
        supabase
          .from("decision_ledger")
          .select("id, capped_confidence", { count: "exact", head: false })
          .eq("organization_id", organizationId)
          .limit(1000),
        supabase
          .from("decision_outcomes")
          .select("id, outcome_status, accuracy_score", { count: "exact", head: false })
          .eq("organization_id", organizationId)
          .limit(1000),
        supabase
          .from("calibration_models")
          .select("overall_calibration_score")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(1),
      ]);

      const decisions = decisionsRes.data || [];
      const outcomes = outcomesRes.data || [];
      const evaluated = outcomes.filter(o => o.outcome_status !== "pending");

      // Compute prediction accuracy from accuracy_score on outcomes
      const accuracyScores = evaluated
        .map(o => o.accuracy_score)
        .filter((v): v is number => v !== null);
      const predictionAccuracy = accuracyScores.length > 0
        ? Math.round((accuracyScores.reduce((s, v) => s + v, 0) / accuracyScores.length) * 10) / 10
        : null;

      const closedLoopRate = decisions.length > 0
        ? Math.round((evaluated.length / decisions.length) * 1000) / 10
        : 0;

      setMetrics({
        totalDecisions: decisions.length,
        outcomesMeasured: evaluated.length,
        predictionAccuracy,
        calibrationScore: calRes.data?.[0]?.overall_calibration_score ?? null,
        closedLoopRate,
      });
    };

    fetch();
  }, [organizationId]);

  if (!metrics) return null;

  const items = [
    {
      icon: Target,
      label: "Decisions",
      value: metrics.totalDecisions > 0 ? metrics.totalDecisions.toLocaleString() : "Get started",
      tooltip: metrics.totalDecisions > 0 ? "Total strategic decisions logged in the Decision Ledger across all contexts." : "Log your first decision to begin building institutional memory.",
    },
    {
      icon: CheckCircle2,
      label: "Outcomes",
      value: metrics.outcomesMeasured > 0 ? metrics.outcomesMeasured.toLocaleString() : "Pending",
      tooltip: "Decisions with verified real-world outcomes — comparing predicted vs. actual results.",
    },
    {
      icon: TrendingUp,
      label: "Prediction Accuracy",
      value: metrics.predictionAccuracy !== null ? `${Math.round(metrics.predictionAccuracy)}%` : "Awaiting data",
      tooltip: metrics.predictionAccuracy !== null
        ? `Average accuracy score across ${metrics.outcomesMeasured} measured outcomes. Derived from expected vs actual outcome variance.`
        : "Accuracy will be computed once outcomes are evaluated against predictions.",
    },
    {
      icon: Brain,
      label: "Calibration",
      value: metrics.calibrationScore !== null ? `${metrics.calibrationScore}%` : "Learning",
      tooltip: metrics.calibrationScore !== null
        ? "Bayesian calibration score — measures how well confidence estimates match real-world success rates across confidence bands."
        : "Calibration score requires sufficient outcome data. The engine runs every 12 hours.",
    },
    {
      icon: BarChart3,
      label: "Closed-Loop",
      value: `${metrics.closedLoopRate}%`,
      tooltip: `${metrics.outcomesMeasured} of ${metrics.totalDecisions} decisions have measured outcomes. Higher = more institutional learning.`,
    },
  ];

  return (
    <div className="border-b border-border/30 bg-card/30 backdrop-blur-sm">
      <div className="flex items-center gap-1 px-3 md:px-8 py-1.5 overflow-x-auto scrollbar-hide">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mr-2 shrink-0">
          Proof
        </span>
        {items.map((item) => (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md hover:bg-muted/40 transition-colors cursor-default shrink-0">
                <item.icon className="w-3 h-3 text-primary/70" />
                <span className="text-[10px] text-muted-foreground">{item.label}:</span>
                <span className="text-[11px] font-bold text-foreground">{item.value}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {item.tooltip}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
};

export default ProofBar;
