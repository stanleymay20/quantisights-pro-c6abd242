import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DecisionTraceView from "@/components/dashboard/DecisionTraceView";
import {
  Target, TrendingUp, TrendingDown, RefreshCw, CheckCircle2,
  XCircle, AlertTriangle, BarChart3, Brain, ArrowRight,
} from "lucide-react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart, Line, Legend,
} from "recharts";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface DecisionRecord {
  id: string;
  recommended_action: string;
  confidence_at_decision: number | null;
  capped_confidence: number | null;
  outcome_delta: number | null;
  predicted_net_impact: number | null;
  prediction_accuracy_score: number | null;
  outcome_measured_at: string | null;
  created_at: string;
  calibration_error: number | null;
}

const DecisionAccuracy = () => {
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("decision_ledger")
        .select("id, recommended_action, confidence_at_decision, capped_confidence, outcome_delta, predicted_net_impact, prediction_accuracy_score, outcome_measured_at, created_at, calibration_error")
        .eq("organization_id", currentOrgId)
        .eq("decision_status", "approved")
        .order("created_at", { ascending: true })
        .limit(500);
      setDecisions(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [currentOrgId]);

  const evaluated = useMemo(
    () => decisions.filter(d => d.outcome_measured_at && d.outcome_delta != null),
    [decisions]
  );

  const scatterData = useMemo(
    () => evaluated.map(d => ({
      confidence: d.capped_confidence ?? d.confidence_at_decision ?? 50,
      accuracy: d.prediction_accuracy_score ?? 0,
      action: d.recommended_action?.substring(0, 40),
      delta: d.outcome_delta,
    })),
    [evaluated]
  );

  const trendData = useMemo(() => {
    const sorted = [...evaluated].sort(
      (a, b) => new Date(a.outcome_measured_at!).getTime() - new Date(b.outcome_measured_at!).getTime()
    );
    let runningAccuracy = 0;
    return sorted.map((d, i) => {
      const acc = d.prediction_accuracy_score ?? 0;
      runningAccuracy = (runningAccuracy * i + acc) / (i + 1);
      return {
        index: i + 1,
        date: new Date(d.outcome_measured_at!).toLocaleDateString(),
        accuracy: Math.round(acc),
        rollingAvg: Math.round(runningAccuracy),
        calibrationError: d.calibration_error ?? 0,
      };
    });
  }, [evaluated]);

  const avgAccuracy = evaluated.length > 0
    ? evaluated.reduce((s, d) => s + (d.prediction_accuracy_score ?? 0), 0) / evaluated.length
    : null;

  const avgCalibrationError = evaluated.filter(d => d.calibration_error != null).length > 0
    ? evaluated.filter(d => d.calibration_error != null)
        .reduce((s, d) => s + Math.abs(d.calibration_error!), 0) /
      evaluated.filter(d => d.calibration_error != null).length
    : null;

  const positiveOutcomes = evaluated.filter(d => (d.outcome_delta ?? 0) > 0).length;

  return (
    <SectionErrorBoundary sectionName="Decision Accuracy">
    <div className="min-h-dvh bg-background flex flex-col">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <SidebarMobileToggle />
          <div>
            <h1 className="text-[16px] font-semibold tracking-tight tracking-tight tracking-tight">Decision Accuracy</h1>
            <p className="text-xs text-muted-foreground">Confidence vs Reality — proving the system learns</p>
          </div>
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Evaluated</span>
              </div>
              <p className="text-2xl font-bold">{evaluated.length}</p>
              <p className="text-[10px] text-muted-foreground">{decisions.length} total decisions</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Accuracy</span>
              </div>
              <p className="text-2xl font-bold">
                {avgAccuracy != null ? `${avgAccuracy.toFixed(0)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">prediction vs outcome</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Positive Outcomes</span>
              </div>
              <p className="text-2xl font-bold">
                {evaluated.length > 0 ? `${((positiveOutcomes / evaluated.length) * 100).toFixed(0)}%` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{positiveOutcomes} of {evaluated.length}</p>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Calibration Gap</span>
              </div>
              <p className="text-2xl font-bold">
                {avgCalibrationError != null ? `${avgCalibrationError.toFixed(1)}pp` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">avg |predicted − actual|</p>
            </CardContent>
          </Card>
        </div>

        {evaluated.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-10 flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Target className="w-7 h-7 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-base mb-1">No evaluated decisions yet</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Quantivis compares each decision's predicted confidence against its real-world outcome —
                  building a calibration curve that makes every future recommendation more accurate.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={() => navigate("/decisions")}>
                  Log a Decision <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/deliberation")}>
                  Review Pending
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Confidence vs Accuracy Scatter */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Confidence vs Actual Accuracy
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  Each dot is a decision. Points near the diagonal = well-calibrated predictions.
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="confidence" name="Confidence" unit="%"
                      domain={[0, 100]} type="number"
                      tick={{ fontSize: 10 }} label={{ value: "Predicted Confidence %", position: "bottom", fontSize: 10 }}
                    />
                    <YAxis
                      dataKey="accuracy" name="Accuracy" unit="%"
                      domain={[0, 100]} type="number"
                      tick={{ fontSize: 10 }} label={{ value: "Actual Accuracy %", angle: -90, position: "left", fontSize: 10 }}
                    />
                    <ReferenceLine
                      segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                      stroke="hsl(var(--primary))" strokeDasharray="5 5" opacity={0.5}
                    />
                    <Tooltip
                      content={({ payload }) => {
                        if (!payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg p-2 text-xs shadow-lg">
                            <p className="font-medium truncate max-w-[200px]">{d.action}</p>
                            <p>Confidence: {Math.round(d.confidence)}%</p>
                            <p>Accuracy: {Math.round(d.accuracy)}%</p>
                            <p>Outcome Δ: {d.delta?.toFixed(2)}</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatterData} fill="hsl(var(--primary))" fillOpacity={0.7} r={5} />
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Accuracy Trend Over Time */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  Accuracy Trend — System Learning Curve
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">
                  Rising rolling average = the system is learning from outcomes and improving.
                </p>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="index" tick={{ fontSize: 10 }} label={{ value: "Decision #", position: "bottom", fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8, fontSize: 11,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line
                      type="monotone" dataKey="accuracy" stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1} dot={{ r: 2 }} name="Per-Decision"
                    />
                    <Line
                      type="monotone" dataKey="rollingAvg" stroke="hsl(var(--primary))"
                      strokeWidth={2.5} dot={false} name="Rolling Average"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            {/* Sample Decision Trace */}
            {evaluated.length > 0 && currentOrgId && (
              <div>
                <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-primary" />
                  Sample Trace — Most Recent Evaluated Decision
                </h2>
                <DecisionTraceView
                  decisionId={evaluated[evaluated.length - 1].id}
                  organizationId={currentOrgId}
                />
              </div>
            )}
          </>
        )}

        <IntelligenceDisclaimer context="general" />
      </div>
    </div>
    </SectionErrorBoundary>
  );
};

export default DecisionAccuracy;
