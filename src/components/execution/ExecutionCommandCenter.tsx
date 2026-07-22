import { useEffect, useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Shield, AlertTriangle, Target, TrendingUp, Activity,
  Zap, CheckCircle2, XCircle, Clock, RefreshCw, Loader2,
  ArrowUpRight, BarChart3, GitBranch, Eye, Heart,
  Lock, History, ChevronDown, ChevronUp, Gauge, Link2,
} from "lucide-react";
import { useExecutionIntelligence, type CommandSummary, type EngineHealth, type InferredBlocker, type OperationalMetrics } from "@/hooks/useExecutionIntelligence";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface ExecutionCommandCenterProps {
  organizationId: string;
}

const RISK_COLORS: Record<string, string> = {
  likely_failure: "bg-destructive text-destructive-foreground",
  at_risk: "bg-warning text-warning-foreground",
  delayed: "bg-primary/20 text-primary",
  on_track: "bg-success/20 text-success",
};

const ExecutionCommandCenter = memo(({ organizationId }: ExecutionCommandCenterProps) => {
  const {
    loading,
    scores,
    predictions,
    interventions,
    commandSummary,
    dependencyGraph,
    engineHealth,
    scanInterventions,
    fetchInterventions,
    resolveIntervention,
    computeScores,
    fetchScores,
    predictRisks,
    fetchPredictions,
    fetchCommandSummary,
    fetchDependencyGraph,
    fetchEngineHealth,
    fetchInferredBlockers,
    fetchOperationalMetrics,
  } = useExecutionIntelligence(organizationId);

  const [showEngineHealth, setShowEngineHealth] = useState(false);
  const [inferredBlockers, setInferredBlockers] = useState<InferredBlocker[]>([]);
  const [opMetrics, setOpMetrics] = useState<OperationalMetrics | null>(null);

  useEffect(() => {
    fetchCommandSummary();
    fetchInterventions();
    fetchPredictions();
    fetchScores();
    fetchDependencyGraph();
    fetchEngineHealth();
    fetchInferredBlockers().then(r => { if (r) setInferredBlockers(r.inferred_blockers); });
    fetchOperationalMetrics().then(r => { if (r) setOpMetrics(r); });
  }, [fetchCommandSummary, fetchInterventions, fetchPredictions, fetchScores, fetchDependencyGraph, fetchEngineHealth, fetchInferredBlockers, fetchOperationalMetrics]);

  const runFullAnalysis = async () => {
    await Promise.all([
      scanInterventions(),
      computeScores(),
      predictRisks(),
    ]);
    await Promise.all([
      fetchCommandSummary(),
      fetchDependencyGraph(),
      fetchEngineHealth(),
    ]);
  };

  const summary = commandSummary;
  const orgScore = summary?.org_score;

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Execution Command Center
          </h2>
          <p className="text-xs text-muted-foreground">
            Real-time execution control + predictive intelligence
            {summary?.generated_at && (
              <span className="ml-2 text-[10px] opacity-60">
                Updated {new Date(summary.generated_at).toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {engineHealth && (
            <Badge variant={engineHealth.overall_health === "healthy" ? "outline" : "destructive"} className="text-[10px] gap-1">
              <Heart className="w-3 h-3" />
              {engineHealth.overall_health}
            </Badge>
          )}
          <Button onClick={runFullAnalysis} disabled={loading} size="sm" className="gap-2">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Run Full Analysis
          </Button>
        </div>
      </div>

      {/* Executive Score Card */}
      <SectionErrorBoundary sectionName="Execution Health Score">
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
              <div className="col-span-2 md:col-span-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Execution Health</p>
                <div className="text-4xl font-bold tabular-nums">
                  {orgScore ? Math.round(orgScore.score) : "—"}
                  <span className="text-base text-muted-foreground">/100</span>
                </div>
                {orgScore && <Progress value={orgScore.score} className="mt-2 h-2" />}
                {orgScore?.scoring_model_version && (
                  <p className="text-[9px] text-muted-foreground mt-1">Model v{orgScore.scoring_model_version}</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Success Rate</p>
                <p className="text-2xl font-bold text-success">{orgScore?.success_rate ?? "—"}%</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Failure Rate</p>
                <p className="text-2xl font-bold text-destructive">{orgScore?.failure_rate ?? "—"}%</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Delay</p>
                <p className="text-2xl font-bold">{orgScore?.avg_delay_days ?? "—"}<span className="text-sm text-muted-foreground"> days</span></p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Plans Evaluated</p>
                <p className="text-2xl font-bold">{orgScore?.plans_evaluated ?? 0}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Blocked</p>
                <p className="text-2xl font-bold text-warning">{summary?.blocked_active ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionErrorBoundary>

      {/* Risk Distribution + Command Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionErrorBoundary sectionName="Risk Distribution">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Risk Distribution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary?.risk_distribution ? (
                <>
                  {[
                    { key: "likely_failure", label: "Likely Failure", icon: XCircle, color: "text-destructive" },
                    { key: "at_risk", label: "At Risk", icon: AlertTriangle, color: "text-warning" },
                    { key: "delayed", label: "Delayed", icon: Clock, color: "text-primary" },
                    { key: "on_track", label: "On Track", icon: CheckCircle2, color: "text-success" },
                  ].map(({ key, label, icon: Icon, color }) => {
                    const count = summary.risk_distribution[key as keyof typeof summary.risk_distribution];
                    const total = summary.total_active || 1;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <Icon className={`w-4 h-4 ${color} shrink-0`} />
                        <span className="text-sm flex-1">{label}</span>
                        <span className="font-bold tabular-nums">{count}</span>
                        <div className="w-20">
                          <Progress value={(count / total) * 100} className="h-1.5" />
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Run analysis to see risk distribution</p>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        <SectionErrorBoundary sectionName="Command Summary">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Command Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <p className="text-[10px] text-muted-foreground uppercase">Open Interventions</p>
                  <p className="text-2xl font-bold text-destructive">{summary?.open_interventions ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-warning/5 border border-warning/10">
                  <p className="text-[10px] text-muted-foreground uppercase">At-Risk Plans</p>
                  <p className="text-2xl font-bold text-warning">{summary?.at_risk_plans ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-[10px] text-muted-foreground uppercase">Critical Active</p>
                  <p className="text-2xl font-bold text-primary">{summary?.critical_active ?? 0}</p>
                </div>
                <div className="p-3 rounded-lg bg-secondary border border-border/40">
                  <p className="text-[10px] text-muted-foreground uppercase">Total Active</p>
                  <p className="text-2xl font-bold">{summary?.total_active ?? 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>
      </div>

      {/* Active Interventions */}
      <SectionErrorBoundary sectionName="Active Interventions">
        {interventions.filter(i => !i.resolved).length > 0 && (
          <Card className="border-warning/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-warning" />
                Active Interventions
                <Badge variant="destructive" className="ml-2 text-[10px]">{interventions.filter(i => !i.resolved).length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {interventions.filter(i => !i.resolved).slice(0, 10).map(iv => (
                <div key={iv.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border/30">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[10px]">{iv.intervention_type.replace(/_/g, " ")}</Badge>
                      {iv.auto_triggered && <Badge className="text-[10px] bg-primary/20 text-primary">Auto</Badge>}
                    </div>
                    <p className="text-xs mt-1">{iv.trigger_reason}</p>
                    {iv.corrective_action && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        <span className="font-medium">Recommended:</span> {iv.corrective_action}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => resolveIntervention(iv.id)} className="text-xs shrink-0">
                    Resolve
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Predictive Risk Table */}
      <SectionErrorBoundary sectionName="Predictive Execution Intelligence">
        {predictions.filter(p => p.risk_score > 20).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Predictive Risk Intelligence
                <Badge variant="outline" className="text-[10px] ml-auto">Model v{predictions[0]?.model_version || "—"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {predictions.filter(p => p.risk_score > 20).slice(0, 10).map(pred => (
                  <div key={pred.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 hover:bg-secondary/30 transition-colors">
                    <div className="shrink-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold ${
                        pred.risk_score >= 70 ? "bg-destructive/10 text-destructive" :
                        pred.risk_score >= 50 ? "bg-warning/10 text-warning" :
                        "bg-primary/10 text-primary"
                      }`}>
                        {pred.risk_score}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{pred.execution_plans?.action_title || "Unknown Plan"}</span>
                        <Badge className={`text-[10px] ${RISK_COLORS[pred.predicted_outcome] || ""}`}>
                          {pred.predicted_outcome.replace(/_/g, " ")}
                        </Badge>
                        {pred.feature_summary?.is_blocked && (
                          <Badge variant="destructive" className="text-[10px] gap-0.5"><Lock className="w-2.5 h-2.5" /> Blocked</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{pred.recommendation}</p>
                      {pred.risk_factors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {pred.risk_factors.slice(0, 3).map((rf, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {rf.factor}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {pred.delay_days_predicted > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Est. Delay</p>
                        <p className="text-sm font-bold">{pred.delay_days_predicted}d</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Dependency Graph */}
      <SectionErrorBoundary sectionName="Dependency Graph">
        {dependencyGraph && dependencyGraph.stats?.with_dependencies > 0 && (
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" />
                Execution Dependency Graph
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {dependencyGraph.stats.with_dependencies} linked • {dependencyGraph.stats.blocked} blocked • {dependencyGraph.stats.critical} critical path
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {dependencyGraph.blocked_chains.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Blocked Chains (cascading risk)</p>
                  {dependencyGraph.blocked_chains.slice(0, 5).map((chain, idx) => (
                    <div key={idx} className="flex items-center gap-1 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                      <Lock className="w-3.5 h-3.5 text-destructive shrink-0" />
                      <div className="flex items-center gap-1 overflow-x-auto">
                        {chain.chain.map((planId, i) => (
                          <span key={planId} className="flex items-center gap-1">
                            <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">{planId.slice(0, 8)}…</span>
                            {i < chain.chain.length - 1 && <ArrowUpRight className="w-3 h-3 text-muted-foreground" />}
                          </span>
                        ))}
                      </div>
                      <Badge variant="destructive" className="text-[9px] ml-auto shrink-0">depth {chain.depth}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {dependencyGraph.critical_path.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Critical Path Plans</p>
                  <div className="flex flex-wrap gap-1">
                    {dependencyGraph.critical_path.slice(0, 8).map((p) => (
                      <Badge key={p.id as string} variant="outline" className="text-[10px] border-primary/30">
                        <Target className="w-2.5 h-2.5 mr-1" />
                        {(p.action_title as string)?.slice(0, 30) || (p.id as string).slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Cross-Decision Dependencies */}
      <SectionErrorBoundary sectionName="Cross-Decision Dependencies">
        {summary?.multi_plan_decisions && summary.multi_plan_decisions.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Cross-Decision Execution Graph
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {summary.multi_plan_decisions.map(mpd => (
                  <div key={mpd.decision_id} className="flex items-center gap-3 p-2 rounded border border-border/30">
                    <ArrowUpRight className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-xs font-mono text-muted-foreground truncate">{mpd.decision_id.slice(0, 8)}…</span>
                    <Badge variant="outline" className="text-[10px]">{mpd.plan_count} plans</Badge>
                    <span className="text-[10px] text-muted-foreground ml-auto">Interdependent execution</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Recent Overrides */}
      <SectionErrorBoundary sectionName="Executive Overrides">
        {summary?.recent_overrides && summary.recent_overrides.length > 0 && (
          <Card className="border-warning/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="w-4 h-4 text-warning" />
                Recent Executive Overrides
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.recent_overrides.map(ov => (
                <div key={ov.id} className="flex items-center gap-3 p-2 rounded-lg bg-warning/5 border border-warning/10">
                  <Lock className="w-3.5 h-3.5 text-warning shrink-0" />
                  <Badge variant="outline" className="text-[10px]">{ov.override_type.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground truncate flex-1">{ov.reason}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{new Date(ov.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Inferred Blockers (Dependency Intelligence v2) */}
      <SectionErrorBoundary sectionName="Inferred Dependencies">
        {inferredBlockers.length > 0 && (
          <Card className="border-warning/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Link2 className="w-4 h-4 text-warning" />
                Inferred Dependencies
                <Badge variant="outline" className="text-[10px] ml-auto">{inferredBlockers.length} detected</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-[10px] text-muted-foreground mb-2">
                Auto-detected upstream blockers based on decision grouping, creation order, and deadline alignment.
              </p>
              {inferredBlockers.slice(0, 8).map((ib, idx) => (
                <div key={idx} className="flex items-start gap-3 p-2.5 rounded-lg bg-warning/5 border border-warning/10">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium truncate">{ib.plan_action_title}</span>
                      <Badge variant="outline" className="text-[9px]">may be blocked</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      ← Upstream: <span className="font-medium text-foreground">{ib.blocker_action_title}</span>
                      <Badge variant="outline" className="text-[9px] ml-1">{ib.blocker_status}</Badge>
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{ib.reason}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      {/* Operational Metrics (Production Proof) */}
      <SectionErrorBoundary sectionName="Operational Metrics">
        {opMetrics && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                Operational Proof (30-day window)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Interventions Created</p>
                  <p className="text-xl font-bold">{opMetrics.intervention_metrics.total_created}</p>
                </div>
                <div className="p-3 rounded-lg bg-success/5 border border-success/10">
                  <p className="text-[10px] text-muted-foreground uppercase">Resolution Rate</p>
                  <p className="text-xl font-bold text-success">{opMetrics.intervention_metrics.resolution_rate}%</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <p className="text-[10px] text-muted-foreground uppercase">Avg Resolution</p>
                  <p className="text-xl font-bold">{opMetrics.intervention_metrics.avg_resolution_hours}<span className="text-xs text-muted-foreground">h</span></p>
                </div>
                <div className="p-3 rounded-lg bg-secondary/50 border border-border/30">
                  <p className="text-[10px] text-muted-foreground uppercase">Dupes Prevented</p>
                  <p className="text-xl font-bold">{opMetrics.dedupe_effectiveness.total_duplicates_prevented}</p>
                </div>
              </div>

              {Object.keys(opMetrics.engine_performance).length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-2">Engine Latency</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {Object.entries(opMetrics.engine_performance).map(([name, perf]) => (
                      <div key={name} className="p-2.5 rounded-lg border border-border/30 bg-secondary/20">
                        <p className="text-[10px] text-muted-foreground uppercase truncate">{name.replace(/_/g, " ")}</p>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-sm font-bold">{Math.round(perf.p50_ms)}ms</span>
                          <span className="text-[10px] text-muted-foreground">P50</span>
                          <span className="text-sm font-bold text-warning">{Math.round(perf.p95_ms)}ms</span>
                          <span className="text-[10px] text-muted-foreground">P95</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground">{perf.total_runs} runs • {perf.errors} errors</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </SectionErrorBoundary>

      <SectionErrorBoundary sectionName="Engine Health">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 cursor-pointer" onClick={() => setShowEngineHealth(!showEngineHealth)}>
              <Heart className="w-4 h-4 text-primary" />
              Engine Health & Observability
              {showEngineHealth ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </CardTitle>
          </CardHeader>
          {showEngineHealth && engineHealth && (
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(engineHealth.engines).map(([name, engine]) => (
                  <div key={name} className={`p-3 rounded-lg border ${engine.errors > 0 ? "border-destructive/30 bg-destructive/5" : "border-border/30 bg-secondary/30"}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-2 h-2 rounded-full ${engine.status === "completed" ? "bg-success" : engine.status === "failed" ? "bg-destructive" : "bg-warning"}`} />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{name.replace(/_/g, " ")}</p>
                    </div>
                    <p className="text-sm font-bold">{Math.round(engine.avg_duration)}ms <span className="text-[10px] font-normal text-muted-foreground">avg</span></p>
                    <p className="text-[10px] text-muted-foreground">{engine.runs} runs • {engine.errors} errors</p>
                    <p className="text-[9px] text-muted-foreground">Last: {new Date(engine.latest).toLocaleTimeString()}</p>
                  </div>
                ))}
              </div>
              {engineHealth.recent_runs.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">Recent Runs</p>
                  <div className="space-y-1">
                    {engineHealth.recent_runs.slice(0, 5).map((run, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-[11px]">
                        <div className={`w-1.5 h-1.5 rounded-full ${run.status === "completed" ? "bg-success" : "bg-destructive"}`} />
                        <span className="text-muted-foreground">{(run.run_type as string).replace(/_/g, " ")}</span>
                        <span className="font-mono">{String(run.duration_ms ?? "")}ms</span>
                        <span className="text-muted-foreground">{String(run.items_processed ?? 0)} items</span>
                        <span className="text-muted-foreground ml-auto">{new Date(run.started_at as string).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </SectionErrorBoundary>
    </div>
  );
});

ExecutionCommandCenter.displayName = "ExecutionCommandCenter";

export default ExecutionCommandCenter;
