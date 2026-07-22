import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { GitCompare } from "lucide-react";

interface Props {
  simulations: Array<{ id: string; scenario_name?: string; expected_value?: number; confidence_interval_low?: number; confidence_interval_high?: number; [key: string]: unknown }>;
}

const ScenarioComparison = ({ simulations }: Props) => {
  const comparison = useMemo(() => {
    if (simulations.length < 2) return null;

    // Take the two most recent simulations
    const [a, b] = simulations.slice(0, 2);

    const metrics = [
      // median_net_impact, not expected_net_impact (the arithmetic mean): the
      // underlying simulation is log-normal/right-skewed, so the mean can
      // legitimately fall outside the P10-P90 band for volatile scenarios.
      // Median is the P50 percentile of the same sorted path array, so it is
      // always bounded by P10 and P90.
      { label: "Expected Net", a: Number(a.median_net_impact) || 0, b: Number(b.median_net_impact) || 0 },
      { label: "P10 (Downside)", a: Number(a.p10_impact) || 0, b: Number(b.p10_impact) || 0 },
      { label: "P90 (Upside)", a: Number(a.p90_impact) || 0, b: Number(b.p90_impact) || 0 },
      { label: "P(+ROI) %", a: Number(a.probability_positive_roi) || 0, b: Number(b.probability_positive_roi) || 0 },
      { label: "Risk-Adj EV", a: Number(a.risk_adjusted_expected_value) || 0, b: Number(b.risk_adjusted_expected_value) || 0 },
    ];

    return { a, b, metrics };
  }, [simulations]);

  if (!comparison) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Scenario Comparison</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Run at least 2 decision simulations to compare scenarios side by side.
        </p>
      </div>
    );
  }

  const chartData = comparison.metrics.map((m) => ({
    metric: m.label,
    "Scenario A": m.a,
    "Scenario B": m.b,
  }));

  const aWins = comparison.metrics.filter((m) => m.a > m.b).length;
  const bWins = comparison.metrics.filter((m) => m.b > m.a).length;

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Scenario Comparison</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
            A: {aWins} wins
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground font-semibold">
            B: {bWins} wins
          </span>
        </div>
      </div>

      {/* Side by side metrics table */}
      <div className="grid grid-cols-3 gap-1 mb-4 text-[10px]">
        <div className="text-muted-foreground font-medium uppercase tracking-wider">Metric</div>
        <div className="text-center font-semibold text-primary">Scenario A</div>
        <div className="text-center font-semibold text-muted-foreground">Scenario B</div>
        {comparison.metrics.map((m) => {
          const aWin = m.a > m.b;
          const bWin = m.b > m.a;
          return (
            <div key={m.label} className="contents">
              <div className="py-1.5 text-xs text-muted-foreground border-t border-border/20">{m.label}</div>
              <div className={`py-1.5 text-center font-mono text-xs font-bold border-t border-border/20 ${aWin ? "text-emerald-400" : ""}`}>
                {m.label.includes("%") ? `${m.a.toFixed(0)}%` : `€${m.a >= 1000 ? `${(m.a / 1000).toFixed(0)}K` : m.a.toLocaleString()}`}
              </div>
              <div className={`py-1.5 text-center font-mono text-xs font-bold border-t border-border/20 ${bWin ? "text-emerald-400" : ""}`}>
                {m.label.includes("%") ? `${m.b.toFixed(0)}%` : `€${m.b >= 1000 ? `${(m.b / 1000).toFixed(0)}K` : m.b.toLocaleString()}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="metric" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar dataKey="Scenario A" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Scenario B" fill="hsl(var(--muted-foreground))" opacity={0.5} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ScenarioComparison;
