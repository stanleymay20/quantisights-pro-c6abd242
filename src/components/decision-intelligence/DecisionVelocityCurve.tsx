import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, ArrowRight, Clock, Zap, AlertTriangle, BookOpen } from "lucide-react";

/**
 * Decision Velocity Curve & Risk Trade-Off Analysis
 * 
 * From "Decision Intelligence" by Stanley Osei-Wusu (Chapter 1).
 * Finds the optimal point where sufficient information drives a timely,
 * high-quality choice — balancing analysis paralysis vs. hasty decisions.
 */

interface DecisionVelocityProps {
  decisions: Array<{ created_at: string; status?: string; [key: string]: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const DecisionVelocityCurve = ({ decisions }: DecisionVelocityProps) => {
  const analysis = useMemo(() => {
    if (decisions.length === 0) return null;

    // Categorize decisions by speed
    const withTiming = decisions
      .filter(d => d.created_at && d.decided_at)
      .map(d => {
        const created = new Date(d.created_at).getTime();
        const decided = new Date(d.decided_at).getTime();
        const hoursToDecide = (decided - created) / (1000 * 60 * 60);
        const accuracy = Number(d.prediction_accuracy_score) || null;
        const success = d.outcome_delta != null ? (Number(d.outcome_delta) >= 0) : null;
        return { ...d, hoursToDecide, accuracy, success };
      })
      .filter(d => d.hoursToDecide > 0);

    if (withTiming.length < 3) return null;

    // Bucket into speed categories
    const fast = withTiming.filter(d => d.hoursToDecide < 24);
    const moderate = withTiming.filter(d => d.hoursToDecide >= 24 && d.hoursToDecide < 168);
    const slow = withTiming.filter(d => d.hoursToDecide >= 168);

    const bucketStats = (bucket: typeof fast, label: string) => {
      const count = bucket.length;
      const withAccuracy = bucket.filter(d => d.accuracy !== null);
      const avgAccuracy = withAccuracy.length > 0
        ? withAccuracy.reduce((s, d) => s + d.accuracy!, 0) / withAccuracy.length
        : null;
      const withSuccess = bucket.filter(d => d.success !== null);
      const successRate = withSuccess.length > 0
        ? (withSuccess.filter(d => d.success).length / withSuccess.length) * 100
        : null;
      const avgHours = count > 0
        ? bucket.reduce((s, d) => s + d.hoursToDecide, 0) / count
        : 0;
      return { label, count, avgAccuracy, successRate, avgHours };
    };

    const buckets = [
      bucketStats(fast, "< 24h"),
      bucketStats(moderate, "1-7 days"),
      bucketStats(slow, "> 7 days"),
    ];

    // Overall velocity metrics
    const avgDecisionTime = withTiming.reduce((s, d) => s + d.hoursToDecide, 0) / withTiming.length;
    const pending = decisions.filter(d => d.decision_status === "pending");
    const stale = pending.filter(d => {
      const age = (Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return age > 7;
    });

    // Analysis paralysis score
    const paralysisScore = Math.min(100, Math.round(
      (stale.length / Math.max(1, pending.length)) * 50 +
      Math.min(50, avgDecisionTime / 24 * 5)
    ));

    // Optimal zone detection
    const bestBucket = buckets.reduce((best, b) => {
      const score = (b.successRate || 0) * 0.6 + (b.avgAccuracy || 0) * 0.4;
      const bestScore = (best.successRate || 0) * 0.6 + (best.avgAccuracy || 0) * 0.4;
      return score > bestScore ? b : best;
    });

    return {
      buckets,
      avgDecisionTime,
      paralysisScore,
      stalePending: stale.length,
      totalDecided: withTiming.length,
      optimalZone: bestBucket.label,
    };
  }, [decisions]);

  if (!analysis) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Decision Velocity Curve requires decisions with timestamps and outcome measurements.
          </p>
        </CardContent>
      </Card>
    );
  }

  const paralysisColor = analysis.paralysisScore >= 60 ? "text-destructive"
    : analysis.paralysisScore >= 30 ? "text-warning"
    : "text-success";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          Decision Velocity Curve
          <Badge variant="outline" className="ml-auto text-[10px]">
            {analysis.totalDecided} decisions analyzed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top metrics */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <div className="text-lg font-bold text-primary">
              {analysis.avgDecisionTime < 24
                ? `${Math.round(analysis.avgDecisionTime)}h`
                : `${(analysis.avgDecisionTime / 24).toFixed(1)}d`}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Avg Time to Decide</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className={`text-lg font-bold ${paralysisColor}`}>
              {analysis.paralysisScore}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Paralysis Index</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-lg font-bold text-primary">{analysis.optimalZone}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Optimal Zone</p>
          </div>
        </div>

        {/* Velocity buckets */}
        <div className="space-y-2">
          {analysis.buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30">
              <div className="w-16 text-xs font-mono font-semibold">{bucket.label}</div>
              <div className="flex-1 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <span className="text-muted-foreground">Count: </span>
                  <span className="font-semibold">{bucket.count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Success: </span>
                  <span className={`font-semibold ${(bucket.successRate || 0) >= 60 ? "text-success" : "text-warning"}`}>
                    {bucket.successRate !== null ? `${bucket.successRate.toFixed(0)}%` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Accuracy: </span>
                  <span className="font-semibold">
                    {bucket.avgAccuracy !== null ? `${bucket.avgAccuracy.toFixed(0)}%` : "—"}
                  </span>
                </div>
              </div>
              {bucket.label === analysis.optimalZone && (
                <Badge variant="default" className="text-[9px] shrink-0">Optimal</Badge>
              )}
            </div>
          ))}
        </div>

        {/* Paralysis alert */}
        {analysis.paralysisScore >= 40 && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              {analysis.stalePending} decisions stale &gt;7 days. The pursuit of absolute certainty 
              leads to Analysis Paralysis — find the optimal point on the Decision Velocity Curve.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2 pt-2 border-t border-border/50">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground/60">
            Decision Velocity Curve from <em>"Decision Intelligence"</em> Ch. 1 — "The challenge is to find the optimal 
            point where sufficient information drives a timely, high-quality choice."
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DecisionVelocityCurve;
