import { useEffect } from "react";
import { Target, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, BarChart3, Brain, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useDecisionPerformance } from "@/hooks/useDecisionPerformance";
import { useOrganization } from "@/hooks/useOrganization";

const DecisionPerformanceDashboard = () => {
  const { currentOrgId } = useOrganization();
  const { performance, loading, refresh } = useDecisionPerformance(currentOrgId);

  if (!performance && !loading) {
    return (
      <div className="glass-card p-6 rounded-xl text-center">
        <Target className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No evaluated decisions yet. Approve decisions to start tracking outcomes.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="glass-card p-6 rounded-xl text-center">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Loading decision performance…</p>
      </div>
    );
  }

  const p = performance!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight uppercase tracking-wide text-muted-foreground">
            Decision Intelligence Performance
          </h3>
        </div>
        <Button variant="ghost" size="sm" onClick={refresh} className="text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Evaluated</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{p.evaluableDecisions}</p>
            <p className="text-[10px] text-muted-foreground">{p.totalDecisions} total tracked</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Success Rate</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {p.successRate !== null ? `${p.successRate.toFixed(0)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">{p.successCount} positive outcomes</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Avg Accuracy</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {p.avgAccuracy !== null ? `${p.avgAccuracy.toFixed(0)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">Forecast vs actual</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {p.calibrationGap !== null && p.calibrationGap > 5
                ? <AlertTriangle className="w-4 h-4 text-yellow-500" />
                : <Brain className="w-4 h-4 text-muted-foreground" />
              }
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Calibration</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {p.calibrationGap !== null ? `${p.calibrationGap > 0 ? "+" : ""}${p.calibrationGap.toFixed(1)}` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {p.calibrationGap !== null
                ? p.calibrationGap > 5 ? "Overconfident" : p.calibrationGap < -5 ? "Underconfident" : "Well calibrated"
                : "Needs ≥5 decisions"
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Metric Breakdown */}
      {p.metricBreakdown.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">Performance by Metric</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {p.metricBreakdown.map((mb) => (
              <div key={mb.metric} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{mb.metric.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">
                    {mb.successRate.toFixed(0)}% success · {mb.total} decisions
                  </span>
                </div>
                <Progress value={mb.successRate} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Learnings */}
      {p.learnings.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" /> Decision Learning System
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {p.learnings.map((learning, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <p className="text-xs text-foreground/80 leading-relaxed">{learning}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* False positive warning */}
      {p.negativeCount > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <TrendingDown className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {p.negativeCount} decision{p.negativeCount > 1 ? "s" : ""} produced negative outcomes
            ({p.falsePositiveRate?.toFixed(0)}% false positive rate). Review recommendation methodology.
          </p>
        </div>
      )}
    </div>
  );
};

export default DecisionPerformanceDashboard;
