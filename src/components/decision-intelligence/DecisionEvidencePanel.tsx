import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Brain, History, Target, ArrowDown, CheckCircle2, XCircle, Clock,
  Database, Lightbulb, Gavel, Play, AlertTriangle, ShieldCheck,
  TrendingUp, TrendingDown, Activity, Zap,
} from "lucide-react";
import SimilarDecisionsPanel from "@/components/dashboard/SimilarDecisionsPanel";

interface DecisionEvidencePanelProps {
  decisionId: string;
  organizationId: string;
  decisionText: string;
}

interface TraceStep {
  stage: string;
  icon: React.ReactNode;
  label: string;
  status: "complete" | "pending" | "missing";
  detail: string;
  timestamp?: string;
}

interface OutcomeData {
  outcome_status: string;
  accuracy_score: number | null;
  expected_change: number | null;
  observed_value_before: number | null;
  observed_value_after: number | null;
  evaluation_date: string | null;
  evaluation_window_days: number | null;
  expected_metric: string | null;
}

const DecisionEvidencePanel = ({ decisionId, organizationId, decisionText }: DecisionEvidencePanelProps) => {
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [outcome, setOutcome] = useState<OutcomeData | null>(null);
  const [calibration, setCalibration] = useState<any>(null);
  const [executionEvents, setExecutionEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const [decisionRes, outcomeRes, calRes, plansRes] = await Promise.all([
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
          .select("id, model_version, computed_at, overall_calibration_score, total_decisions_analyzed, overall_bias_direction")
          .eq("organization_id", organizationId)
          .order("computed_at", { ascending: false })
          .limit(1),
        supabase
          .from("execution_plans")
          .select("id")
          .eq("decision_id", decisionId)
          .eq("organization_id", organizationId),
      ]);

      const d = decisionRes.data;
      const oc = outcomeRes.data?.[0] as OutcomeData | undefined;
      const cal = calRes.data?.[0];
      setOutcome(oc || null);
      setCalibration(cal || null);

      // Get execution events for this decision's plans
      const planIds = (plansRes.data || []).map((p: { id: string }) => p.id);
      if (planIds.length > 0) {
        const { data: events } = await supabase
          .from("execution_events")
          .select("*")
          .in("execution_plan_id", planIds)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: true });
        setExecutionEvents(events || []);
      }

      if (!d) {
        setTrace([]);
        setLoading(false);
        return;
      }

      const advisory = d.advisory_instances as { id: string; title: string; category: string; created_at: string } | null;
      const steps: TraceStep[] = [
        {
          stage: "data",
          icon: <Database className="w-4 h-4" />,
          label: "Data Source",
          status: "complete",
          detail: advisory ? `Advisory: "${advisory.title}"` : "Direct decision entry",
          timestamp: advisory?.created_at ?? d.created_at,
        },
        {
          stage: "insight",
          icon: <Lightbulb className="w-4 h-4" />,
          label: "Intelligence Signal",
          status: advisory ? "complete" : "missing",
          detail: advisory ? `Category: ${advisory.category}` : "No linked advisory",
        },
        {
          stage: "decision",
          icon: <Gavel className="w-4 h-4" />,
          label: "Decision",
          status: d.decision_status === "approved" ? "complete" : d.decision_status === "rejected" ? "complete" : "pending",
          detail: `${d.decision_status} — Confidence: ${d.capped_confidence ?? d.confidence_at_decision ?? "?"}%`,
          timestamp: d.decided_at ?? d.created_at,
        },
        {
          stage: "execution",
          icon: <Play className="w-4 h-4" />,
          label: "Execution",
          status: d.execution_status === "completed" ? "complete" : d.execution_status !== "not_started" ? "pending" : "missing",
          detail: d.execution_status === "completed" ? "Completed" : d.execution_status === "in_progress" ? "In progress" : "Not started",
          timestamp: d.execution_completed_at ?? d.execution_started_at,
        },
        {
          stage: "outcome",
          icon: <Target className="w-4 h-4" />,
          label: "Outcome",
          status: oc?.outcome_status && !["pending", "not_evaluable"].includes(oc.outcome_status) ? "complete" : oc ? "pending" : "missing",
          detail: oc?.outcome_status === "pending"
            ? `Pending (${oc.evaluation_window_days}d window)`
            : oc?.accuracy_score != null
              ? `Accuracy: ${oc.accuracy_score.toFixed(0)}%`
              : oc ? oc.outcome_status : "No outcome record",
          timestamp: oc?.evaluation_date ?? undefined,
        },
        {
          stage: "calibration",
          icon: <Brain className="w-4 h-4" />,
          label: "Calibration",
          status: cal ? "complete" : "missing",
          detail: cal ? `Model v${cal.model_version} — ${cal.total_decisions_analyzed} decisions analyzed` : "No calibration model",
          timestamp: cal?.computed_at,
        },
      ];

      setTrace(steps);
      setLoading(false);
    };
    load();
  }, [decisionId, organizationId]);

  const statusColors = {
    complete: "bg-success/10 text-success border-success/20",
    pending: "bg-warning/10 text-warning border-warning/20",
    missing: "bg-muted text-muted-foreground border-border/50",
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
        <Clock className="w-3 h-3 animate-spin" /> Loading evidence…
      </div>
    );
  }

  const completedSteps = trace.filter(s => s.status === "complete").length;
  const totalSteps = trace.length;

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Decision Evidence Panel
          <Badge variant="outline" className="text-[10px] ml-auto">
            {completedSteps}/{totalSteps} stages verified
          </Badge>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          Full traceability from data source → calibration feedback loop
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="trace" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="trace" className="text-xs">Trace</TabsTrigger>
            <TabsTrigger value="memory" className="text-xs">Memory</TabsTrigger>
            <TabsTrigger value="evidence" className="text-xs">Evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="trace" className="mt-3 space-y-0">
            {trace.map((step, i) => (
              <div key={step.stage}>
                <div className={`flex items-start gap-3 p-2.5 rounded-lg ${statusColors[step.status]}`}>
                  <div className="mt-0.5">{step.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{step.label}</span>
                      {step.status === "complete" && <CheckCircle2 className="w-3 h-3 text-success" />}
                      {step.status === "pending" && <Clock className="w-3 h-3 text-warning" />}
                      {step.status === "missing" && <XCircle className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <p className="text-[10px] opacity-80 truncate">{step.detail}</p>
                    {step.timestamp && (
                      <p className="text-[9px] opacity-50">{new Date(step.timestamp).toLocaleString()}</p>
                    )}
                  </div>
                </div>
                {i < trace.length - 1 && (
                  <div className="flex justify-center py-0.5">
                    <ArrowDown className="w-3 h-3 text-muted-foreground/20" />
                  </div>
                )}
              </div>
            ))}
          </TabsContent>

          <TabsContent value="memory" className="mt-3">
            <SimilarDecisionsPanel
              organizationId={organizationId}
              queryText={decisionText}
            />
          </TabsContent>

          <TabsContent value="evidence" className="mt-3 space-y-3">
            {/* Outcome Evidence */}
            {outcome && (
              <div className="rounded-lg border border-border/30 p-3 space-y-2">
                <h5 className="text-xs font-semibold flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-primary" /> Outcome Measurement
                </h5>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="outline" className="ml-1 text-[10px] capitalize">{outcome.outcome_status}</Badge>
                  </div>
                  {outcome.expected_metric && (
                    <div><span className="text-muted-foreground">Metric:</span> {outcome.expected_metric}</div>
                  )}
                  {outcome.accuracy_score != null && (
                    <div>
                      <span className="text-muted-foreground">Accuracy:</span>
                      <span className={`ml-1 font-mono font-bold ${outcome.accuracy_score >= 70 ? "text-success" : outcome.accuracy_score >= 40 ? "text-warning" : "text-destructive"}`}>
                        {outcome.accuracy_score.toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {outcome.observed_value_before != null && outcome.observed_value_after != null && (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground">Change:</span>
                      <span className="font-mono">{outcome.observed_value_before.toFixed(1)}</span>
                      <ArrowDown className="w-3 h-3 rotate-[-90deg]" />
                      <span className="font-mono">{outcome.observed_value_after.toFixed(1)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Calibration Context */}
            {calibration && (
              <div className="rounded-lg border border-border/30 p-3 space-y-2">
                <h5 className="text-xs font-semibold flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5 text-primary" /> Calibration Context
                </h5>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Model:</span> v{calibration.model_version}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score:</span>
                    <span className="ml-1 font-mono font-bold">{calibration.overall_calibration_score?.toFixed(0)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Decisions analyzed:</span> {calibration.total_decisions_analyzed}
                  </div>
                  {calibration.overall_bias_direction && (
                    <div>
                      <span className="text-muted-foreground">Bias:</span> {calibration.overall_bias_direction}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Execution Events */}
            {executionEvents.length > 0 && (
              <div className="rounded-lg border border-border/30 p-3 space-y-2">
                <h5 className="text-xs font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" /> Execution Events ({executionEvents.length})
                </h5>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {executionEvents.map((ev: any) => (
                    <div key={ev.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-border/10 last:border-0">
                      <Badge variant="outline" className="text-[9px] px-1">{ev.event_type}</Badge>
                      <span className="text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Intelligence Classification */}
            <div className="rounded-lg border border-border/30 p-3">
              <h5 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                <Zap className="w-3.5 h-3.5 text-primary" /> Intelligence Classification
              </h5>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Statistical Engine</Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">Deterministic Rules</Badge>
                {outcome?.accuracy_score != null && (
                  <Badge className="bg-success/10 text-success border-success/20 text-[10px]">Outcome-Verified</Badge>
                )}
              </div>
              <p className="text-[9px] text-muted-foreground mt-1.5">
                Confidence scores derived from statistical analysis and calibration models.
                AI narratives are clearly labeled when present.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default DecisionEvidencePanel;
