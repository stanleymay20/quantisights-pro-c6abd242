interface Convergence {
  score: number;
  dispersion: number;
  conflict_penalty: number;
  volatility_divergence: number;
  alignment_status: string;
}

interface RiskAttributionProps {
  convergence: Convergence | null;
}

const RiskAttribution = ({ convergence }: RiskAttributionProps) => {
  if (!convergence) {
    return (
      <div className="px-16 py-12 border-b border-border/50 print:border-border">
        <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
          Risk Attribution Breakdown
        </h2>
        <p className="text-muted-foreground italic">Convergence index not yet computed.</p>
      </div>
    );
  }

  const total = convergence.dispersion + convergence.conflict_penalty + convergence.volatility_divergence;
  const safeTotal = total > 0 ? total : 1;

  const factors = [
    {
      label: "Dispersion",
      value: convergence.dispersion,
      pct: Math.round((convergence.dispersion / safeTotal) * 100),
      colorClass: "bg-primary text-primary",
      description: "Spread of risk scores across executive roles",
    },
    {
      label: "Conflict Penalty",
      value: convergence.conflict_penalty,
      pct: Math.round((convergence.conflict_penalty / safeTotal) * 100),
      colorClass: "bg-warning text-warning",
      description: "Governance conflicts between executive functions",
    },
    {
      label: "Volatility Divergence",
      value: convergence.volatility_divergence,
      pct: Math.round((convergence.volatility_divergence / safeTotal) * 100),
      colorClass: "bg-destructive text-destructive",
      description: "Difference in risk volatility patterns across roles",
    },
  ];

  return (
    <div className="px-16 py-12 border-b border-border/50 print:border-border">
      <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
        Risk Attribution Breakdown
      </h2>

      {/* Stacked bar */}
      <div className="mb-8">
        <div className="flex h-8 rounded-lg overflow-hidden">
          {factors.map((f) => (
            <div
              key={f.label}
              className={`flex items-center justify-center text-xs font-bold text-primary-foreground ${f.colorClass.split(" ")[0]}`}
              style={{ width: `${f.pct}%`, minWidth: f.pct > 0 ? "40px" : "0" }}
            >
              {f.pct > 10 ? `${f.pct}%` : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Detailed breakdown */}
      <div className="space-y-6">
        {factors.map((f) => (
          <div key={f.label} className="flex items-center gap-6">
            <div className={`w-4 h-4 rounded-full shrink-0 ${f.colorClass.split(" ")[0]}`} />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-foreground/90 print:text-foreground">{f.label}</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-mono text-foreground/70 print:text-foreground">{Number(f.value).toFixed(1)}</span>
                  <span className={`text-sm font-bold ${f.colorClass.split(" ")[1]}`}>
                    {f.pct}%
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{f.description}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-muted/50 print:bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${f.colorClass.split(" ")[0]}`}
                  style={{ width: `${f.pct}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-border/30 print:border-border flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Composite ECI Score</span>
        <span className="text-2xl font-bold text-foreground/90 print:text-foreground">{convergence.score}/100</span>
      </div>
    </div>
  );
};

export default RiskAttribution;
