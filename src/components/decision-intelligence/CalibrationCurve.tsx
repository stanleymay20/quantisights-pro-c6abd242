import { useMemo } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Target } from "lucide-react";

interface Props {
  decisions: Array<{ confidence?: number; outcome_success?: boolean | null; [key: string]: unknown }>;
}

const CalibrationCurve = ({ decisions }: Props) => {
  const data = useMemo(() => {
    const calibrated = decisions.filter(
      (d) => d.prediction_accuracy_score != null && d.capped_confidence != null && d.actual_value != null
    );
    if (calibrated.length === 0) return null;

    // Bin by predicted confidence deciles
    const bins: Record<number, { predicted: number; actual: number[]; count: number }> = {};
    for (let b = 0; b <= 90; b += 10) {
      bins[b] = { predicted: b + 5, actual: [], count: 0 };
    }

    calibrated.forEach((d) => {
      const conf = Math.min(99, Math.max(0, Number(d.capped_confidence ?? d.raw_confidence ?? 50)));
      const bin = Math.floor(conf / 10) * 10;
      const wasPositive = (Number(d.outcome_delta) || 0) >= 0 ? 1 : 0;
      bins[bin].actual.push(wasPositive);
      bins[bin].count++;
    });

    const points = Object.values(bins)
      .filter((b) => b.count > 0)
      .map((b) => ({
        predicted: b.predicted,
        actual: Math.round((b.actual.reduce((s, v) => s + v, 0) / b.actual.length) * 100),
        count: b.count,
      }));

    // Reliability score: mean absolute difference from diagonal
    const reliability =
      points.length > 0
        ? 100 - points.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / points.length
        : 0;

    return { points, reliability: Math.max(0, reliability), totalCalibrated: calibrated.length };
  }, [decisions]);

  if (!data || data.points.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Calibration Curve</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Needs completed decisions with measured outcomes to plot predicted vs. actual reliability.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Calibration Curve</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">{data.totalCalibrated} decisions</span>
          <span
            className={`text-xs font-bold font-mono px-2 py-0.5 rounded-full ${
              data.reliability >= 80
                ? "bg-emerald-500/10 text-emerald-400"
                : data.reliability >= 60
                ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive"
            }`}
          >
            {data.reliability.toFixed(0)}% reliable
          </span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground mb-3">
        Perfect calibration follows the diagonal — points above mean overconfidence, below mean underconfidence.
      </p>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="predicted"
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: "Predicted Confidence %", position: "bottom", fontSize: 10, fill: "hsl(var(--muted-foreground))", offset: 5 }}
            />
            <YAxis
              dataKey="actual"
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              label={{ value: "Actual Success %", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
              stroke="hsl(var(--primary))"
              strokeDasharray="5 5"
              strokeOpacity={0.5}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-popover border border-border p-2 rounded-lg shadow-lg text-xs">
                    <p>Predicted: <span className="font-mono font-bold">{d.predicted}%</span></p>
                    <p>Actual: <span className="font-mono font-bold">{d.actual}%</span></p>
                    <p className="text-muted-foreground">{d.count} decisions in bin</p>
                  </div>
                );
              }}
            />
            <Scatter data={data.points} fill="hsl(var(--primary))" fillOpacity={0.8} r={6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CalibrationCurve;
