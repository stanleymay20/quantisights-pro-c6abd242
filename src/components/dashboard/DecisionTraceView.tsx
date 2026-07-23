import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Database, Lightbulb, AlertTriangle, Gavel, Play, Target, Brain,
  ArrowDown, CheckCircle2, XCircle, Clock,
} from "lucide-react";

interface TraceStep {
  stage: string;
  icon: React.ReactNode;
  label: string;
  status: "complete" | "pending" | "missing";
  detail: string;
  timestamp?: string;
}

interface DecisionTraceViewProps {
  decisionId: string;
  organizationId: string;
}

const DecisionTraceView = ({ decisionId, organizationId }: DecisionTraceViewProps) => {
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const build = async () => {
      setLoading(true);

      const [decisionRes, outcomeRes, calibrationRes] = await Promise.all([
        supabase
          .from("decision_ledger")
          .select("*, advisory_instances(id, title, category, created_at)")
          .eq("id", decisionId)
          .eq("organization_id", organizationId)
          .single(),
        supabase
          .from("decision_outcomes")
          .select("*")
          .eq("decision_id", decisionId)
          .eq("organization_id", organizationId)
          .limit(1),
        supabase
          .from("calibration_models")
          .select("id, model_version, computed_at, overall_calibration_score")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(1),
      ]);

      const d = decisionRes.data;
      const outcome = outcomeRes.data?.[0];
      const cal = calibrationRes.data?.[0];

      if (!d) {
        setTrace([]);
        setLoading(false);
        return;
      }

      const advisory = d.advisory_instances as { id: string; title: string; category: string; created_at: string } | null;
      const steps: TraceStep[] = [];

      // 1. Data Source
      steps.push({
        stage: "data",
        icon: <Database className="w-4 h-4" />,
        label: "Data Source",
        status: "complete",
        detail: advisory
          ? `Advisory "${advisory.title}" (${advisory.category})`
          : "Direct decision entry",
        timestamp: advisory?.created_at ?? d.created_at,
      });

      // 2. Insight / Advisory
      steps.push({
        stage: "insight",
        icon: <Lightbulb className="w-4 h-4" />,
        label: "Intelligence Signal",
        status: advisory ? "complete" : "missing",
        detail: advisory
          ? `Category: ${advisory.category}`
          : "No linked advisory signal",
        timestamp: advisory?.created_at,
      });

      // 3. Decision
      steps.push({
        stage: "decision",
        icon: <Gavel className="w-4 h-4" />,
        label: "Decision Approved",
        status: d.decision_status === "approved" ? "complete" : "pending",
        detail: `${d.recommended_action?.substring(0, 60)} — Confidence: ${d.capped_confidence ?? d.confidence_at_decision ?? "?"}%`,
        timestamp: d.decided_at ?? d.created_at,
      });

      // 4. Execution
      steps.push({
        stage: "execution",
        icon: <Play className="w-4 h-4" />,
        label: "Execution",
        status: d.execution_status === "completed"
          ? "complete"
          : d.execution_status === "in_progress"
            ? "pending"
            : "missing",
        detail: d.execution_status === "completed"
          ? "Execution completed"
          : d.execution_status === "in_progress"
            ? "In progress"
            : "Awaiting execution",
        timestamp: d.execution_completed_at ?? d.execution_started_at,
      });

      // 5. Outcome
      steps.push({
        stage: "outcome",
        icon: <Target className="w-4 h-4" />,
        label: "Outcome Measured",
        status: outcome?.outcome_status === "evaluated"
          ? "complete"
          : outcome
            ? "pending"
            : "missing",
        detail: outcome?.outcome_status === "evaluated"
          ? `Accuracy: ${outcome.accuracy_score?.toFixed(0) ?? "?"}% | Expected Δ: ${outcome.expected_change?.toFixed(2) ?? "?"}`
          : outcome
            ? `Pending evaluation (window: ${outcome.evaluation_window_days}d)`
            : "No outcome record yet",
        timestamp: outcome?.evaluation_date,
      });

      // 6. Calibration
      steps.push({
        stage: "calibration",
        icon: <Brain className="w-4 h-4" />,
        label: "Calibration Updated",
        status: cal ? "complete" : "missing",
        detail: cal
          ? `Model v${cal.model_version} — Score: ${cal.overall_calibration_score?.toFixed(1) ?? "?"}%`
          : "No calibration model yet",
        timestamp: cal?.computed_at,
      });

      setTrace(steps);
      setLoading(false);
    };

    build();
  }, [decisionId, organizationId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 animate-spin" /> Loading trace…
      </div>
    );
  }

  const statusColors = {
    complete: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    missing: "bg-muted text-muted-foreground border-border/50",
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowDown className="w-4 h-4 text-primary" />
          Decision Trace — End-to-End Lineage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {trace.map((step, i) => (
          <div key={step.stage}>
            <div className={`flex items-start gap-3 p-3 rounded-lg ${statusColors[step.status]}`}>
              <div className="mt-0.5">{step.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold">{step.label}</span>
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                    {step.status === "complete" ? "✓" : step.status === "pending" ? "⏳" : "—"}
                  </Badge>
                </div>
                <p className="text-[10px] opacity-80 truncate">{step.detail}</p>
                {step.timestamp && (
                  <p className="text-[9px] opacity-50 mt-0.5">
                    {new Date(step.timestamp).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {i < trace.length - 1 && (
              <div className="flex justify-center py-1">
                <ArrowDown className="w-3 h-3 text-muted-foreground/30" />
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default DecisionTraceView;
