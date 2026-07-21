import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  BookOpen, CheckCircle2, Clock, TrendingUp, TrendingDown,
  Loader2, Plus, PlayCircle, Target, BarChart3, ArrowRight,
  ShieldCheck, AlertTriangle, Activity, Zap, DollarSign,
} from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DecisionResponsibilityDialog from "@/components/DecisionResponsibilityDialog";
import DecisionComments from "@/components/decisions/DecisionComments";
import LazyInputWarning from "@/components/dashboard/LazyInputWarning";
import DatasetRequired from "@/components/layout/DatasetRequired";
import ExecutionTimeline from "@/components/execution/ExecutionTimeline";
import DecisionReplayPanel from "@/components/execution/DecisionReplayPanel";
import { onExecutionStatusChanged } from "@/lib/decision-lifecycle";

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

const DecisionLedgerPage = () => {
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

  // Impact simulation state
  const [simTarget, setSimTarget] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simResult, setSimResult] = useState<ImpactSim | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<{ id: string; action: string } | null>(null);
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

  const fetchDecisions = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("decision_ledger")
      .select("*")
      .eq("organization_id", currentOrgId)
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
      const deltas = data.map((d: any) => Number(d.calibration_delta));
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
    }
  }, [currentOrgId]);

  const createDecision = async () => {
    if (!currentOrgId || !newAction.trim()) return;
    const { error } = await supabase
      .from("decision_ledger")
      .insert({
        organization_id: currentOrgId,
        recommended_action: newAction,
        decision_type: newType,
        decided_by: user?.id,
      });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Decision logged" });
      setNewAction("");
      setShowCreate(false);
      fetchDecisions();
    }
  };

  const runImpactSim = async (decisionId: string) => {
    if (!currentOrgId) return;
    setSimRunning(true);
    setSimResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("decision-impact-sim", {
        body: {
          organization_id: currentOrgId,
          dataset_id: activeDatasetId,
          decision_id: decisionId,
          ...impactForm,
        },
        ...(session?.access_token ? { headers: { Authorization: `Bearer ${session.access_token}` } } : {}),
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSimResult(data as ImpactSim);
      toast({ title: "Impact simulation complete" });
      fetchDecisions();
    } catch (e: any) {
      toast({ title: "Simulation failed", description: e.message, variant: "destructive" });
    } finally {
      setSimRunning(false);
    }
  };

  const updateDecision = async (id: string, updates: Record<string, any>) => {
    setUpdatingId(id);
    const decision = decisions.find(d => d.id === id);
    let error: { message: string } | null = null;

    if (updates.decision_status === "approved") {
      ({ error } = await supabase.rpc("approve_decision", {
        _decision_id: id,
        _dataset_id: activeDatasetId ?? undefined,
        _expected_metric: decision?.recommended_action?.substring(0, 30) ?? "metric",
        _evaluation_window_days: 30,
        _suggested_owner: undefined,
      }));
    } else if (updates.decision_status === "rejected") {
      ({ error } = await supabase.rpc("reject_decision", { _decision_id: id }));
    } else {
      if (updates.execution_status === "completed" && decision) {
        const conf = decision.confidence_at_decision || decision.capped_confidence || 50;
        const hasOutcome = decision.outcome_delta !== null;
        const outcomePositive = (decision.outcome_delta || 0) >= 0;
        const calibrationError = Math.abs(conf - (outcomePositive ? 100 : 0));
        updates.calibration_error = calibrationError;
        updates.prediction_accuracy_score = hasOutcome ? Math.max(0, 100 - calibrationError) : null;
      }
      ({ error } = await supabase.from("decision_ledger").update(updates).eq("id", id));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      if (updates.execution_status) {
        await onExecutionStatusChanged({
          decisionId: id,
          organizationId: decision?.organization_id ?? "",
          userId: user?.id ?? null,
          newStatus: updates.execution_status,
        });
      }
      fetchDecisions();
    }
    setUpdatingId(null);
  };

  const activeDecisions = decisions.filter(d => d.decision_status !== "rejected" && d.execution_status !== "completed");
  const completedDecisions = decisions.filter(d => d.execution_status === "completed");

  const avgOutcomeDelta = completedDecisions.length > 0
    ? completedDecisions.reduce((s, d) => s + (d.outcome_delta || 0), 0) / completedDecisions.length
    : null;

  const avgCalibrationError = completedDecisions.filter(d => d.calibration_error !== null).length > 0
    ? completedDecisions.filter(d => d.calibration_error !== null).reduce((s, d) => s + (d.calibration_error || 0), 0)
      / completedDecisions.filter(d => d.calibration_error !== null).length
    : null;

  const decisionSuccessRate = completedDecisions.length > 0
    ? (completedDecisions.filter(d => (d.outcome_delta || 0) > 0).length / completedDecisions.length * 100)
    : null;

  return (
    <DatasetRequired moduleName="Decision Ledger">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-xl font-semibold font-display">Decision Ledger</h1>
            <p className="text-xs text-muted-foreground">Track decisions, simulate impact, calibrate predictions</p>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> Log Decision
          </Button>
        </header>

          <IntelligenceDisclaimer variant="banner" context="advisory" />
          <LazyInputWarning decisions={decisions} />
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold mt-1">{decisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-2xl font-bold mt-1 text-primary">{activeDecisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold mt-1 text-success">{completedDecisions.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Avg Outcome</p>
                <p className={`text-2xl font-bold mt-1 ${avgOutcomeDelta !== null && avgOutcomeDelta > 0 ? "text-success" : avgOutcomeDelta !== null && avgOutcomeDelta < 0 ? "text-destructive" : ""}`}>
                  {avgOutcomeDelta !== null ? `${avgOutcomeDelta > 0 ? "+" : ""}${avgOutcomeDelta.toFixed(1)}%` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> Cal. Error</p>
                <p className={`text-2xl font-bold mt-1 ${avgCalibrationError !== null && avgCalibrationError < 30 ? "text-success" : avgCalibrationError !== null && avgCalibrationError > 50 ? "text-destructive" : "text-warning"}`}>
                  {avgCalibrationError !== null ? `${avgCalibrationError.toFixed(0)}` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Success Rate</p>
                <p className={`text-2xl font-bold mt-1 ${decisionSuccessRate !== null && decisionSuccessRate > 60 ? "text-success" : decisionSuccessRate !== null && decisionSuccessRate < 40 ? "text-destructive" : "text-warning"}`}>
                  {decisionSuccessRate !== null ? `${decisionSuccessRate.toFixed(0)}%` : "—"}
                </p>
              </CardContent>
            </Card>
            <Card className={learningStats.totalCalibrated >= 5 ? "border-primary/30" : ""}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Learning</p>
                <p className="text-2xl font-bold mt-1">
                  {learningStats.totalCalibrated >= 5 ? (
                    <span className="text-primary">{learningStats.confidenceAdjustment > 0 ? "+" : ""}{learningStats.confidenceAdjustment.toFixed(1)}</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">{learningStats.totalCalibrated}/5</span>
                  )}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {learningStats.totalCalibrated >= 5 ? "Confidence adj." : "Decisions to learn"}
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
                    <Button onClick={createDecision} className="w-full" disabled={!newAction.trim()}>
                      Log Decision
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
                        value={`${simResult.probability_positive_roi}%`}
                        positive={simResult.probability_positive_roi >= 50}
                      />
                      <ResultCard
                        label="Risk-Adj. EV"
                        value={fmt(simResult.risk_adjusted_expected_value)}
                        positive={simResult.risk_adjusted_expected_value >= 0}
                      />
                      <ResultCard
                        label="P(Cash Stress)"
                        value={`${simResult.probability_cashflow_stress}%`}
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
                                Conf: {simResult.capped_confidence}%
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              <p>Raw: {simResult.raw_confidence}% → Capped: {simResult.capped_confidence}%</p>
                              <p>{simResult.confidence_cap_reason}</p>
                              <p>Sample: {simResult.sample_size} | Variance: {simResult.variance_score}%</p>
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
            <TabsList>
              <TabsTrigger value="active" className="gap-2"><PlayCircle className="w-4 h-4" /> Active ({activeDecisions.length})</TabsTrigger>
              <TabsTrigger value="completed" className="gap-2"><CheckCircle2 className="w-4 h-4" /> Completed ({completedDecisions.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-3">
              {loading ? (
                <Card><CardContent className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></CardContent></Card>
              ) : activeDecisions.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-16 flex flex-col items-center gap-3">
                  <BookOpen className="w-10 h-10 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">No active decisions. Log a decision to start tracking.</p>
                </CardContent></Card>
              ) : activeDecisions.map(d => {
                const sCfg = STATUS_COLORS[d.decision_status] || STATUS_COLORS.pending;
                const eCfg = EXEC_STATUS[d.execution_status] || EXEC_STATUS.not_started;
                return (
                  <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className="text-xs capitalize">{d.decision_type.replace(/_/g, " ")}</Badge>
                              <Badge className={`${sCfg.bg} ${sCfg.text} border-none text-xs`}>{sCfg.label}</Badge>
                              <Badge className={`${eCfg.bg} ${eCfg.text} border-none text-xs`}>{eCfg.label}</Badge>
                              {d.capped_confidence !== null && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1" title={d.confidence_cap_reason || undefined}>
                                  <BarChart3 className="w-3 h-3" /> {d.capped_confidence}% conf.
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
                                <Button size="sm" variant="outline" onClick={() => setApprovalTarget({ id: d.id, action: d.recommended_action })} disabled={updatingId === d.id}>
                                  Approve
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => updateDecision(d.id, { decision_status: "rejected" })} disabled={updatingId === d.id}>
                                  Reject
                                </Button>
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

                        {/* Execution & Replay panels */}
                        <div className="mt-4 flex gap-2">
                          <Button
                            size="sm"
                            variant={expandedDecision === d.id ? "default" : "outline"}
                            onClick={() => setExpandedDecision(expandedDecision === d.id ? null : d.id)}
                            className="gap-1.5 text-xs"
                          >
                            <ArrowRight className="w-3 h-3" /> Execution & Replay
                          </Button>
                        </div>
                        {expandedDecision === d.id && currentOrgId && (
                          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </TabsContent>

            <TabsContent value="completed" className="space-y-3">
              {completedDecisions.length === 0 ? (
                <Card className="border-dashed"><CardContent className="py-16 flex flex-col items-center gap-3">
                  <Target className="w-10 h-10 text-muted-foreground" />
                  <p className="text-muted-foreground text-sm">No completed decisions yet.</p>
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
                    <DecisionComments decisionId={d.id} />
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        </main>

      {/* Decision Responsibility Confirmation Dialog */}
      <DecisionResponsibilityDialog
        open={!!approvalTarget}
        onOpenChange={(open) => { if (!open) setApprovalTarget(null); }}
        actionLabel={approvalTarget?.action || ""}
        onConfirm={() => {
          if (approvalTarget) {
            updateDecision(approvalTarget.id, { decision_status: "approved", decided_at: new Date().toISOString() });
            setApprovalTarget(null);
          }
        }}
      />
    </>
    </DatasetRequired>
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
