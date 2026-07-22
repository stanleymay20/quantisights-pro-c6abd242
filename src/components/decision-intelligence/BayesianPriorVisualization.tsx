import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

interface Decision {
  id: string;
  created_at: string;
  raw_confidence: number | null;
  capped_confidence: number | null;
  prediction_accuracy_score: number | null;
  calibration_error: number | null;
  model_calibration_adjustment: number | null;
}

/**
 * Shows how confidence scores evolve over time as more data arrives,
 * visualizing the Bayesian prior → posterior update cycle.
 */
const BayesianPriorVisualization = ({ decisions }: { decisions: Decision[] }) => {
  const chartData = useMemo(() => {
    const sorted = [...decisions]
      .filter(d => d.capped_confidence != null)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (sorted.length < 2) return [];

    let cumulativeAccuracy = 0;
    let measuredCount = 0;

    return sorted.map((d, i) => {
      if (d.prediction_accuracy_score != null) {
        cumulativeAccuracy += Number(d.prediction_accuracy_score);
        measuredCount++;
      }

      return {
        index: i + 1,
        date: new Date(d.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        rawConfidence: Number(d.raw_confidence) || 0,
        cappedConfidence: Number(d.capped_confidence) || 0,
        rollingAccuracy: measuredCount > 0 ? Math.round(cumulativeAccuracy / measuredCount) : null,
        calibrationAdj: Number(d.model_calibration_adjustment) || 0,
      };
    });
  }, [decisions]);

  if (chartData.length < 2) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Confidence Evolution</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Make 2+ decisions to visualize how the model's confidence calibrates over time (Bayesian updating).
        </p>
      </div>
    );
  }

  const latestAdj = chartData[chartData.length - 1]?.calibrationAdj || 0;
  const latestAccuracy = chartData[chartData.length - 1]?.rollingAccuracy;

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Confidence Evolution</h3>
        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full ml-auto">
          Bayesian Updating
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Prior → Posterior calibration across {chartData.length} decisions
      </p>

      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ fontSize: 11, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              formatter={(value: number, name: string) => [
                `${value}%`,
                name === "rawConfidence" ? "Raw Confidence" :
                name === "cappedConfidence" ? "Capped Confidence" :
                "Rolling Accuracy"
              ]}
            />
            <Line type="monotone" dataKey="rawConfidence" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="cappedConfidence" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="rollingAccuracy" stroke="hsl(var(--success))" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div className="text-center bg-muted/20 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">Calibration Adj.</p>
          <p className={`text-sm font-bold font-mono ${latestAdj > 0 ? "text-success" : latestAdj < 0 ? "text-warning" : ""}`}>
            {latestAdj > 0 ? "+" : ""}{(latestAdj * 100).toFixed(1)}%
          </p>
        </div>
        <div className="text-center bg-muted/20 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">Rolling Accuracy</p>
          <p className={`text-sm font-bold font-mono ${(latestAccuracy ?? 0) >= 70 ? "text-success" : "text-warning"}`}>
            {latestAccuracy != null ? `${Math.round(latestAccuracy)}%` : "—"}
          </p>
        </div>
        <div className="text-center bg-muted/20 rounded-lg p-2">
          <p className="text-[10px] text-muted-foreground">Decisions</p>
          <p className="text-sm font-bold font-mono">{chartData.length}</p>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-5 h-0.5 bg-muted-foreground" style={{ borderTop: "2px dashed" }} /> Raw
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 h-0.5 bg-primary" /> Capped
        </span>
        <span className="flex items-center gap-1">
          <span className="w-5 h-0.5 bg-success" /> Actual Accuracy
        </span>
      </div>
    </div>
  );
};

export default BayesianPriorVisualization;
