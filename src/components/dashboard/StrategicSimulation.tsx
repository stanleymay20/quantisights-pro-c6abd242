import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Activity, Loader2, Zap, TrendingUp, TrendingDown, AlertTriangle,
  ChevronRight, Siren, Target,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeWithRetry } from "@/lib/edge-function-retry";

interface SimulationResult {
  baseline_risk: number;
  baseline_components: { deviation: number; trend: number; volatility: number; forecast: number };
  projected_risk: number;
  projected_components: { deviation: number; trend: number; volatility: number; forecast: number };
  risk_delta: number;
  escalation_triggered: boolean;
  kpi_projections: { kpi_name: string; baseline_value: number; projected_value: number; delta_percent: number; model_type?: string; note?: string }[];
  ai_board_summary: string;
  ai_recommended_actions: string[];
  model_disclosure?: {
    classification?: string;
    kpi_model?: string;
    risk_model?: string;
  };
}

interface Props {
  organizationId: string;
  datasetId: string;
  roleType: string;
  tier: string | null;
}

/** Data-driven score-to-stroke color using semantic tokens */
function getScoreStroke(score: number): string {
  if (score <= 25) return "stroke-success";
  if (score <= 50) return "stroke-primary";
  if (score <= 75) return "stroke-warning";
  return "stroke-destructive";
}

/** Data-driven delta color: positive = good (success), negative = bad (destructive) */
function getDeltaColor(delta: number, invertPositive = false): string {
  if (delta === 0) return "text-muted-foreground";
  const isPositive = invertPositive ? delta < 0 : delta > 0;
  return isPositive ? "text-success" : "text-destructive";
}

/** Data-driven badge for slider values */
function getSliderBadgeColor(value: number, invertPositive = false): string {
  if (value === 0) return "";
  const isGood = invertPositive ? value < 0 : value > 0;
  return isGood ? "text-success" : "text-destructive";
}

const RiskDial = ({ score, label, size = "lg" }: { score: number; label: string; size?: "sm" | "lg" }) => {
  const radius = size === "lg" ? 70 : 45;
  const circumference = Math.PI * radius;
  const progress = (score / 100) * circumference;
  const viewW = size === "lg" ? 160 : 100;
  const viewH = size === "lg" ? 85 : 55;
  const arcStart = size === "lg" ? "M 10 80 A 70 70 0 0 1 150 80" : "M 5 50 A 45 45 0 0 1 95 50";

  return (
    <div className="flex flex-col items-center">
      <div className={size === "lg" ? "relative w-44 h-24 overflow-hidden" : "relative w-28 h-16 overflow-hidden"}>
        <svg viewBox={`0 0 ${viewW} ${viewH}`} className="w-full h-full">
          <path d={arcStart} fill="none" className="stroke-muted/30" strokeWidth={size === "lg" ? 10 : 7} strokeLinecap="round" />
          <path d={arcStart} fill="none" className={getScoreStroke(score)} strokeWidth={size === "lg" ? 10 : 7} strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: "stroke-dasharray 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
          <span className={`font-bold ${size === "lg" ? "text-3xl" : "text-xl"}`}>{score}</span>
        </div>
      </div>
      <span className="text-xs font-medium text-muted-foreground mt-1">{label}</span>
    </div>
  );
};

const StrategicSimulation = ({ organizationId, datasetId, roleType, tier }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const [revenueChange, setRevenueChange] = useState(0);
  const [costChange, setCostChange] = useState(0);
  const [headcountChange, setHeadcountChange] = useState(0);
  const [marketingChange, setMarketingChange] = useState(0);
  const [customNotes, setCustomNotes] = useState("");

  const isWarRoom = result?.escalation_triggered === true;

  const runSimulation = async () => {
    if (!datasetId) {
      toast({ title: "Simulation Error", description: "Select an active dataset before running simulation.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await invokeWithRetry<SimulationResult>("strategic-simulation", {
        body: {
          organization_id: organizationId,
          dataset_id: datasetId,
          role_type: roleType,
          scenario_parameters: {
            revenue_change_percent: revenueChange,
            cost_change_percent: costChange,
            headcount_change_percent: headcountChange,
            marketing_spend_change_percent: marketingChange,
            custom_notes: customNotes || null,
          },
        },
      });
      if (error) throw error;
      const rawData = data as unknown as Record<string, unknown> | null;
      if (rawData?.error) throw new Error(String(rawData.error));
      if (data) setResult(data);
    } catch (err: unknown) {
      toast({ title: "Simulation Error", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const resetSimulation = () => {
    setRevenueChange(0);
    setCostChange(0);
    setHeadcountChange(0);
    setMarketingChange(0);
    setCustomNotes("");
    setResult(null);
  };

  const formatSliderLabel = (val: number) => (val > 0 ? `+${val}%` : `${val}%`);

  return (
    <div className={`space-y-6 ${isWarRoom ? "war-room-active" : ""}`}>
      {/* War-Room Banner */}
      {isWarRoom && (
        <Card className="border-destructive bg-destructive/10 animate-pulse">
          <CardContent className="flex items-center gap-4 py-4">
            <Siren className="w-8 h-8 text-destructive shrink-0" />
            <div>
              <p className="font-bold text-destructive text-lg">🔴 WAR-ROOM MODE ACTIVATED</p>
              <p className="text-sm text-destructive/80">
                Projected risk ≥ 80. Emergency action plan generated below.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <Card className={`lg:col-span-1 ${isWarRoom ? "border-destructive/30" : ""}`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-primary" />
              Scenario Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Revenue Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Revenue Change</Label>
                <Badge variant="outline" className={`text-xs font-mono ${getSliderBadgeColor(revenueChange)}`}>
                  {formatSliderLabel(revenueChange)}
                </Badge>
              </div>
              <Slider value={[revenueChange]} onValueChange={([v]) => setRevenueChange(v)} min={-50} max={50} step={1} />
            </div>

            {/* Cost Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Cost Change</Label>
                <Badge variant="outline" className={`text-xs font-mono ${getSliderBadgeColor(costChange, true)}`}>
                  {formatSliderLabel(costChange)}
                </Badge>
              </div>
              <Slider value={[costChange]} onValueChange={([v]) => setCostChange(v)} min={-50} max={50} step={1} />
            </div>

            {/* Headcount Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Headcount Change</Label>
                <Badge variant="outline" className={`text-xs font-mono ${headcountChange < -15 ? "text-destructive" : headcountChange < 0 ? "text-warning" : ""}`}>
                  {formatSliderLabel(headcountChange)}
                </Badge>
              </div>
              <Slider value={[headcountChange]} onValueChange={([v]) => setHeadcountChange(v)} min={-50} max={50} step={1} />
            </div>

            {/* Marketing Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Marketing Spend</Label>
                <Badge variant="outline" className="text-xs font-mono">
                  {formatSliderLabel(marketingChange)}
                </Badge>
              </div>
              <Slider value={[marketingChange]} onValueChange={([v]) => setMarketingChange(v)} min={-50} max={50} step={1} />
            </div>

            {/* Custom Notes */}
            <div className="space-y-2">
              <Label className="text-sm">Strategic Context (optional)</Label>
              <Textarea
                placeholder="e.g. Considering Q3 market downturn..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                className="min-h-[60px]"
                rows={2}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={runSimulation} disabled={loading} className="flex-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                Run Simulation
              </Button>
              <Button variant="outline" onClick={resetSimulation} disabled={loading}>Reset</Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {loading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-muted-foreground font-medium">Computing strategic simulation…</p>
                <p className="text-xs text-muted-foreground">Deterministic modeling + AI narrative synthesis</p>
              </CardContent>
            </Card>
          )}

          {!result && !loading && (
            <Card className="border-dashed border-2 border-muted-foreground/20">
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Activity className="w-12 h-12 text-muted-foreground/50" />
                <h3 className="text-[14px] font-semibold">Strategic Simulation Engine</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                  Adjust scenario parameters and run a simulation to see projected risk shifts, KPI impacts, and board-ready strategic assessments.
                </p>
              </CardContent>
            </Card>
          )}

          {result && (
            <>
              {/* Risk Comparison */}
              <Card className={isWarRoom ? "border-destructive/30" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Risk Index Projection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <RiskDial score={result.baseline_risk} label="Baseline" />
                    <div className="flex flex-col items-center gap-2">
                      <div className={`text-3xl font-bold ${getDeltaColor(result.risk_delta, true)}`}>
                        {result.risk_delta > 0 ? "+" : ""}{result.risk_delta}
                      </div>
                      <span className="text-xs text-muted-foreground">Risk Delta</span>
                      {result.risk_delta > 0 ? (
                        <TrendingUp className="w-5 h-5 text-destructive" />
                      ) : result.risk_delta < 0 ? (
                        <TrendingDown className="w-5 h-5 text-success" />
                      ) : null}
                    </div>
                    <RiskDial score={result.projected_risk} label="Projected" />
                  </div>

                  {/* Component Breakdown */}
                  <div className="mt-6 grid grid-cols-4 gap-3">
                    {(["deviation", "trend", "volatility", "forecast"] as const).map((key) => {
                      const base = result.baseline_components[key];
                      const proj = result.projected_components[key];
                      const delta = proj - base;
                      return (
                        <div key={key} className="text-center p-3 rounded-lg bg-muted/30">
                          <p className="text-xs text-muted-foreground capitalize mb-1">{key}</p>
                          <p className="text-sm font-semibold">{base} → {proj}</p>
                          <p className={`text-xs font-mono ${getDeltaColor(delta, true)}`}>
                            {delta > 0 ? "+" : ""}{delta}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* KPI Projections */}
              {result.kpi_projections.length > 0 && (
                <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">KPI Impact Projections</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        result.model_disclosure?.classification === "CALIBRATED_MODEL"
                          ? "text-success bg-success/10"
                          : "text-warning bg-warning/10"
                      }`}>
                        {result.model_disclosure?.classification === "CALIBRATED_MODEL" ? "Calibrated" : "Estimate"}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {result.model_disclosure?.kpi_model || "KPI projections based on scenario deltas and historical sensitivity."}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {result.kpi_projections.map((kpi, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                          <div>
                            <p className="text-sm font-semibold">{kpi.kpi_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {kpi.baseline_value.toLocaleString()} → {kpi.projected_value.toLocaleString()}
                            </p>
                          </div>
                          <Badge
                            className={
                              kpi.delta_percent > 0
                                ? "bg-success/10 text-success border-none"
                                : kpi.delta_percent < 0
                                ? "bg-destructive/10 text-destructive border-none"
                                : "bg-muted text-muted-foreground border-none"
                            }
                          >
                            {kpi.delta_percent > 0 ? "+" : ""}{Math.round(kpi.delta_percent)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Board Summary */}
              {result.ai_board_summary && (
                <Card className={isWarRoom ? "border-destructive/30" : "border-primary/20"}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      {isWarRoom ? <AlertTriangle className="w-4 h-4 text-destructive" /> : <Zap className="w-4 h-4 text-primary" />}
                      {isWarRoom ? "Emergency Strategic Assessment" : "Board-Ready Summary"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{result.ai_board_summary}</p>
                  </CardContent>
                </Card>
              )}

              {/* Recommended Actions */}
              {result.ai_recommended_actions.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ChevronRight className="w-4 h-4 text-primary" />
                      {isWarRoom ? "Emergency Action Plan" : "Recommended Actions"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {result.ai_recommended_actions.map((action, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${isWarRoom ? "bg-destructive/5 border border-destructive/20" : "bg-muted/30"}`}>
                        <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${isWarRoom ? "bg-destructive/20 text-destructive" : "bg-primary/10 text-primary"}`}>
                          {i + 1}
                        </span>
                        <span className="text-sm">{action}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StrategicSimulation;
