import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRight, CheckCircle2, XCircle, Clock, Play,
  TrendingUp, TrendingDown, RotateCcw, Loader2, Activity,
  Target, BarChart3, Zap, AlertTriangle, Inbox, Shield,
} from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { useDecisionReplay } from "@/hooks/useDecisionReplay";
import { supabase } from "@/integrations/supabase/client";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import ExecutionCommandCenter from "@/components/execution/ExecutionCommandCenter";

/** Hard cap on execution plans fetched — keeps client-side aggregation fast. */
const PLANS_QUERY_LIMIT = 500;

interface ExecutionSummary {
  total_plans: number;
  pending: number;
  in_progress: number;
  completed: number;
  failed: number;
  completion_rate: number;
  overdue: number;
  /** True when the query hit the limit — totals may be approximate. */
  capped: boolean;
}

interface DecisionWithPlans {
  id: string;
  recommended_action: string;
  decision_status: string;
  execution_status: string;
  confidence_at_decision: number | null;
  capped_confidence: number | null;
  prediction_accuracy_score: number | null;
  created_at: string;
  plan_count: number;
  completed_plans: number;
}

const ExecutionDashboard = () => {
  const { currentOrgId } = useOrganization();
  const { driftReport, fetchDriftReport } = useDecisionReplay(currentOrgId);
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [decisions, setDecisions] = useState<DecisionWithPlans[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) { setLoading(false); return; }

    const fetchData = async () => {
      setLoading(true);

      // Bounded query — avoids unbounded client-side aggregation
      const { data: plans } = await supabase
        .from("execution_plans")
        .select("status, deadline, decision_id")
        .eq("organization_id", currentOrgId)
        .limit(PLANS_QUERY_LIMIT);

      if (plans) {
        const now = new Date();
        const capped = plans.length >= PLANS_QUERY_LIMIT;
        const pending = plans.filter((p) => p.status === "pending").length;
        const inProgress = plans.filter((p) => p.status === "in_progress").length;
        const completed = plans.filter((p) => p.status === "completed").length;
        const failed = plans.filter((p) => p.status === "failed").length;
        const overdue = plans.filter((p) =>
          p.deadline && new Date(p.deadline) < now && p.status !== "completed" && p.status !== "cancelled"
        ).length;

        setSummary({
          total_plans: plans.length,
          pending,
          in_progress: inProgress,
          completed,
          failed,
          completion_rate: plans.length > 0 ? completed / plans.length : 0,
          overdue,
          capped,
        });
      }

      // Fetch decisions
      const { data: ledger } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, decision_status, execution_status, confidence_at_decision, capped_confidence, prediction_accuracy_score, created_at")
        .eq("organization_id", currentOrgId)
        .in("decision_status", ["approved", "pending"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (ledger && plans) {
        const plansByDecision = new Map<string, { total: number; completed: number }>();
        for (const p of plans) {
          const entry = plansByDecision.get(p.decision_id) || { total: 0, completed: 0 };
          entry.total++;
          if (p.status === "completed") entry.completed++;
          plansByDecision.set(p.decision_id, entry);
        }

        const withPlans = (ledger as DecisionWithPlans[]).map((d) => {
          const counts = plansByDecision.get(d.id) || { total: 0, completed: 0 };
          return {
            ...d,
            plan_count: counts.total,
            completed_plans: counts.completed,
          };
        });
        setDecisions(withPlans);
      }

      fetchDriftReport();
      setLoading(false);
    };

    fetchData();
  }, [currentOrgId, fetchDriftReport]);

  const STATUS_ICON: Record<string, React.ElementType> = {
    not_started: Clock,
    in_progress: Play,
    completed: CheckCircle2,
    blocked: XCircle,
  };

  return (
    <>
      <>
        <header className="h-14 border-b border-border/30 flex items-center px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <SidebarMobileToggle />
          <h1 className="text-[18px] font-semibold tracking-tight ml-3">Execution Dashboard</h1>
          <p className="text-xs text-muted-foreground ml-3">Decision → Action → Outcome</p>
        </header>

        <IntelligenceDisclaimer variant="banner" context="advisory" />

        <main className="flex-1 p-8 overflow-auto space-y-6">
          <Tabs defaultValue="command" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="command" className="gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Command Center
              </TabsTrigger>
              <TabsTrigger value="operations" className="gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Operations
              </TabsTrigger>
            </TabsList>

            <TabsContent value="command">
              {currentOrgId && (
                <ExecutionCommandCenter organizationId={currentOrgId} />
              )}
            </TabsContent>

            <TabsContent value="operations">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !summary || summary.total_plans === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Inbox className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold text-lg mb-2">No Execution Plans Yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Approve decisions in the Decision Ledger and create execution actions to start tracking progress here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {summary.capped && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-sm text-warning">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Showing the most recent {PLANS_QUERY_LIMIT} execution plans. Totals below reflect this window, not all historical plans.
                </div>
              )}

              <SectionErrorBoundary sectionName="Execution summary metrics">
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        {summary.capped ? "Actions (capped)" : "Total Actions"}
                      </p>
                      <p className="text-2xl font-bold mt-1">{summary.total_plans}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</p>
                      <p className="text-2xl font-bold mt-1">{summary.pending}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      {/* "Active Plans", not "Active" — this counts execution_plans with
                          status='in_progress', a different entity from the "Active Decisions"
                          list below (decision_ledger rows with decision_status
                          pending/approved). Reusing the word "Active" for two different
                          counts made them look like they should match when they don't. */}
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Play className="w-3 h-3" /> Active Plans</p>
                      <p className="text-2xl font-bold mt-1 text-primary">{summary.in_progress}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Done</p>
                      <p className="text-2xl font-bold mt-1 text-success">{summary.completed}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><XCircle className="w-3 h-3" /> Failed</p>
                      <p className="text-2xl font-bold mt-1 text-destructive">{summary.failed}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Target className="w-3 h-3" /> Completion</p>
                      <p className="text-2xl font-bold mt-1">{Math.round(summary.completion_rate * 100)}%</p>
                    </CardContent>
                  </Card>
                  <Card className={summary.overdue ? "border-destructive/30" : ""}>
                    <CardContent className="p-4">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Overdue</p>
                      <p className={`text-2xl font-bold mt-1 ${summary.overdue ? "text-destructive" : ""}`}>{summary.overdue}</p>
                    </CardContent>
                  </Card>
                </div>
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="Decision drift report">
                {driftReport && driftReport.total_replays > 0 && (
                  <Card className="border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <RotateCcw className="w-4 h-4 text-primary" />
                        Organizational Decision Drift
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Replays Run</p>
                          <p className="text-lg font-bold">{driftReport.total_replays}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Avg Confidence Drift</p>
                          <p className={`text-lg font-bold ${Math.abs(driftReport.avg_confidence_drift) > 10 ? "text-warning" : "text-success"}`}>
                            {driftReport.avg_confidence_drift > 0 ? "+" : ""}{driftReport.avg_confidence_drift.toFixed(1)}pp
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Recommendations Changed</p>
                          <p className={`text-lg font-bold ${driftReport.recommendations_changed > 0 ? "text-warning" : "text-success"}`}>
                            {driftReport.recommendations_changed}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Stability Rate</p>
                          <p className="text-lg font-bold">{Math.round((1 - driftReport.change_rate) * 100)}%</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </SectionErrorBoundary>

              <SectionErrorBoundary sectionName="Active decisions list">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Active Decisions
                  </h2>
                  {decisions.length === 0 && (
                    <Card>
                      <CardContent className="py-8 text-center text-muted-foreground text-sm">
                        No active decisions. Log decisions from the Decision Ledger to start executing.
                      </CardContent>
                    </Card>
                  )}
                  {decisions.map(d => {
                    const ExecIcon = STATUS_ICON[d.execution_status] || Clock;
                    const progress = d.plan_count > 0 ? (d.completed_plans / d.plan_count) * 100 : 0;
                    const conf = d.confidence_at_decision || d.capped_confidence;

                    return (
                      <motion.div
                        key={d.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                      >
                        <Card className="hover:border-primary/20 transition-colors">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <ExecIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-sm truncate">{d.recommended_action}</span>
                                  <Badge variant="outline" className="text-[10px]">{d.decision_status}</Badge>
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                  {conf !== null && (
                                    <span className="text-[11px] text-muted-foreground">
                                      Confidence: <span className="font-medium text-foreground">{conf.toFixed(0)}%</span>
                                    </span>
                                  )}
                                  {d.prediction_accuracy_score !== null && (
                                    <span className="text-[11px] text-muted-foreground">
                                      Accuracy: <span className={`font-medium ${d.prediction_accuracy_score > 60 ? "text-success" : "text-warning"}`}>
                                        {d.prediction_accuracy_score.toFixed(0)}/100
                                      </span>
                                    </span>
                                  )}
                                  <span className="text-[11px] text-muted-foreground">
                                    Actions: {d.completed_plans}/{d.plan_count}
                                  </span>
                                </div>
                                {d.plan_count > 0 && (
                                  <Progress value={progress} className="mt-2 h-1.5" />
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </SectionErrorBoundary>
            </>
          )}
            </TabsContent>
          </Tabs>
        </main>
      </>
    </>
  );
};

export default ExecutionDashboard;