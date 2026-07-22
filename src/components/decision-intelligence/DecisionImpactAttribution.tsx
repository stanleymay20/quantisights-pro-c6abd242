import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Props {
  decisions: Array<{ id: string; title?: string; impact_score?: number | null; confidence?: number; category?: string; [key: string]: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const DecisionImpactAttribution = ({ decisions }: Props) => {
  const data = useMemo(() => {
    const completed = decisions
      .filter((d) => d.execution_status === "completed" && d.outcome_measured_at && d.outcome_delta != null)
      .sort((a, b) => new Date(a.outcome_measured_at).getTime() - new Date(b.outcome_measured_at).getTime());

    if (completed.length < 2) return null;

    let cumulativeImpact = 0;
    let cumulativeAccuracy = 0;

    const points = completed.map((d, i) => {
      cumulativeImpact += Number(d.outcome_delta) || 0;
      const accuracy = Number(d.prediction_accuracy_score) || 0;
      cumulativeAccuracy = (cumulativeAccuracy * i + accuracy) / (i + 1);

      return {
        date: format(parseISO(d.outcome_measured_at), "MMM yy"),
        rawDate: d.outcome_measured_at,
        impact: Number(d.outcome_delta) || 0,
        cumulative: Math.round(cumulativeImpact * 100) / 100,
        accuracy: Math.round(cumulativeAccuracy),
        action: d.recommended_action?.substring(0, 40),
      };
    });

    const totalImpact = cumulativeImpact;
    const positiveCount = completed.filter((d) => (Number(d.outcome_delta) || 0) > 0).length;
    const hitRate = Math.round((positiveCount / completed.length) * 100);

    return { points, totalImpact, hitRate, count: completed.length, avgAccuracy: Math.round(cumulativeAccuracy) };
  }, [decisions]);

  if (!data) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Longitudinal Impact Attribution</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Needs at least 2 completed decisions with measured outcomes to track impact over time.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Longitudinal Impact Attribution</h3>
        </div>
        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
          {data.count} decisions tracked
        </span>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-muted/20 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Cumulative Impact</p>
          <p className={`text-lg font-bold tracking-tight ${data.totalImpact >= 0 ? "text-emerald-400" : "text-destructive"}`}>
            {data.totalImpact >= 0 ? "+" : ""}{data.totalImpact.toFixed(1)}%
          </p>
        </div>
        <div className="bg-muted/20 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Hit Rate</p>
          <p className={`text-lg font-bold tracking-tight ${data.hitRate >= 60 ? "text-emerald-400" : "text-warning"}`}>
            {data.hitRate}%
          </p>
        </div>
        <div className="bg-muted/20 rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-muted-foreground uppercase">Model Accuracy</p>
          <p className={`text-lg font-bold tracking-tight ${data.avgAccuracy >= 70 ? "text-emerald-400" : "text-warning"}`}>
            {Math.round(data.avgAccuracy)}%
          </p>
        </div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border border-border p-2 rounded-lg shadow-lg text-xs space-y-1">
                    <p className="font-semibold">{d.date}</p>
                    <p>Decision Impact: <span className="font-mono font-bold">{d.impact >= 0 ? "+" : ""}{d.impact.toFixed(1)}%</span></p>
                    <p>Cumulative: <span className="font-mono font-bold">{d.cumulative >= 0 ? "+" : ""}{d.cumulative.toFixed(1)}%</span></p>
                    <p className="text-muted-foreground truncate max-w-48">{d.action}</p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(var(--primary))" }}
            />
            <Line
              type="monotone"
              dataKey="impact"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={{ r: 2, fill: "hsl(var(--muted-foreground))" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary rounded" />
          Cumulative impact
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-muted-foreground rounded" style={{ borderTop: "1px dashed" }} />
          Per-decision impact
        </div>
      </div>
    </div>
  );
};

export default DecisionImpactAttribution;
