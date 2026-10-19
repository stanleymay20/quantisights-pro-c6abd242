import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Gauge, AlertTriangle, BookOpen } from "lucide-react";

/**
 * Descriptive speed buckets. No optimal zone is inferred from a small sample.
 * Raw outcome_delta is not a universal success target: some KPIs should fall.
 */
interface DecisionTimingRow {
  created_at: string;
  decided_at?: string | null;
  decision_status?: string | null;
  prediction_accuracy_score?: number | null;
}

interface TimingBucket {
  label: string;
  count: number;
  avgHours: number | null;
  avgAccuracy: number | null;
}

const DecisionVelocityCurve = ({ decisions }: { decisions: DecisionTimingRow[] }) => {
  const analysis = useMemo(() => {
    const now = Date.now();
    const completed = decisions.flatMap((d) => {
      if (!d.created_at || !d.decided_at || d.decision_status === "pending") return [];
      const created = Date.parse(d.created_at);
      const decided = Date.parse(d.decided_at);
      const hours = (decided - created) / 3_600_000;
      if (!Number.isFinite(hours) || hours < 0) return [];
      const n = d.prediction_accuracy_score;
      const accuracy = typeof n === "number" && Number.isFinite(n)
        && n >= 0 && n <= 100 ? n : null;
      return [{ hours, accuracy }];
    });

    if (completed.length < 3) return null;

    const buildBucket = (label: string, min: number, max: number): TimingBucket => {
      const rows = completed.filter((d) => d.hours >= min && d.hours < max);
      const recorded = rows.filter((d) => d.accuracy !== null);
      return {
        label,
        count: rows.length,
        avgHours: rows.length
          ? rows.reduce((sum, row) => sum + row.hours, 0) / rows.length : null,
        avgAccuracy: recorded.length
          ? recorded.reduce((sum, row) => sum + row.accuracy!, 0) / recorded.length : null,
      };
    };

    const pending = decisions.filter((d) => d.decision_status === "pending");
    const stalePending = pending.filter((d) => {
      const timestamp = Date.parse(d.created_at);
      return Number.isFinite(timestamp) && timestamp <= now
        && now - timestamp > 7 * 86_400_000;
    }).length;

    return {
      totalDecided: completed.length,
      avgDecisionHours: completed.reduce((sum, row) => sum + row.hours, 0) / completed.length,
      accuracyCount: completed.filter((row) => row.accuracy !== null).length,
      stalePending,
      buckets: [
        buildBucket("< 24 h", 0, 24),
        buildBucket("1–7 days", 24, 168),
        buildBucket("7+ days", 168, Infinity),
      ],
    };
  }, [decisions]);

  if (!analysis) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Gauge className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Decision timing distribution requires at least 3 valid recorded
            created-to-decided intervals.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4 text-primary" />
          Decision Velocity Curve
          <Badge variant="outline" className="ml-auto text-[10px]">
            {analysis.totalDecided} timed decisions
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Descriptive timing distribution. It cannot identify a causally optimal
          decision speed or prove that execution was completed externally.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-center">
            <div className="text-lg font-bold text-primary">
              {analysis.avgDecisionHours < 24
                ? `${analysis.avgDecisionHours.toFixed(1)} h`
                : `${(analysis.avgDecisionHours / 24).toFixed(1)} d`}
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
              Avg created → decided
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-lg font-bold">{analysis.stalePending}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
              Pending over 7 days
            </p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 text-center">
            <div className="text-lg font-bold">{analysis.accuracyCount}</div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
              Recorded accuracy samples
            </p>
          </div>
        </div>

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
                  <span className="text-muted-foreground">Avg: </span>
                  <span className="font-semibold">
                    {bucket.avgHours !== null ? `${bucket.avgHours.toFixed(1)}h` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Accuracy: </span>
                  <span className="font-semibold">
                    {bucket.avgAccuracy !== null ? `${bucket.avgAccuracy.toFixed(0)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {analysis.stalePending > 0 && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-warning">
              {analysis.stalePending} pending decisions exceed 7 days.
              Check ownership, missing evidence and approval queues before assigning a cause.
            </p>
          </div>
        )}

        <div className="flex items-start gap-2 pt-2 border-t border-border/50">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
          <p className="text-[10px] text-muted-foreground/60">
            Decision Velocity framework: speed must be assessed alongside validated
            decision quality. No optimal-speed or success-rate claim is made without
            outcome-direction, measured quality and adequate evidence.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default DecisionVelocityCurve;
