interface SimulationSectionProps {
  simulation: Array<{ scenario: string; expected_value?: number; p10?: number; p50?: number; p90?: number; [key: string]: unknown }>;
}

const SimulationSection = ({ simulation }: SimulationSectionProps) => {
  if (simulation.length === 0) return null;

  const shown = simulation.slice(0, 5);
  // Every projection showing the exact same simulated_value with a zero
  // delta means the scenario's adjustments never actually changed any of
  // these KPIs' inputs (e.g. the assumption targets a metric none of them
  // depend on) -- the numbers are technically real, not fabricated, but
  // presenting five identical "projections" with no caveat reads as a
  // broken simulation to anyone comparing them, which is worse than
  // explaining the degenerate case.
  const allZeroDelta = shown.every((sim) => Number(sim.delta_value) === 0);
  const allIdenticalValue = shown.length > 1 &&
    shown.every((sim) => Number(sim.simulated_value) === Number(shown[0].simulated_value));

  return (
    <div className="px-16 py-12 border-b border-border/50 print:border-border">
      <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
        Strategic Simulation Summary
      </h2>
      {(allZeroDelta || allIdenticalValue) && (
        <p className="text-xs text-muted-foreground mb-4 -mt-4">
          These KPI projections show no change from baseline under the current scenario's
          assumptions — the scenario's adjustments may not target a metric any of these
          KPIs depend on. Review the scenario's assumptions before presenting this section.
        </p>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {shown.map((sim: { scenario: string; expected_value?: number; p10?: number; p50?: number; p90?: number; [key: string]: unknown }, i: number) => (
          <div key={i} className="border border-border/50 print:border-border rounded-xl p-4 text-center">
            <div className="text-xs text-muted-foreground mb-2">Projection {i + 1}</div>
            <div className="text-lg font-semibold text-foreground/90 print:text-foreground">
              {Number(sim.simulated_value).toLocaleString()}
            </div>
            <div className={`text-sm font-mono ${Number(sim.delta_value) >= 0 ? "text-success" : "text-destructive"}`}>
              {Number(sim.delta_value) >= 0 ? "+" : ""}
              {Number(sim.delta_value).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SimulationSection;
