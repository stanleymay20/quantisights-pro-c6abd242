import { useMemo } from "react";
import { GitBranch, ArrowRight, CheckCircle2 } from "lucide-react";

interface Decision {
  id: string;
  recommended_action: string;
  decision_status: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
  probability_of_success: number | null;
  predicted_roi_probability: number | null;
}

interface Simulation {
  id: string;
  decision_id: string | null;
  expected_net_impact: number | null;
  p10_impact: number | null;
  p90_impact: number | null;
  probability_positive_roi: number | null;
  probability_cashflow_stress: number | null;
  implementation_cost: number | null;
}

/**
 * Decision Tree with Option Value analysis.
 * Shows branching outcomes for pending decisions and calculates
 * the value of keeping options open (real options theory).
 */
const DecisionTreePanel = ({ decisions, simulations }: { decisions: Decision[]; simulations: Simulation[] }) => {
  const trees = useMemo(() => {
    const pending = decisions.filter(d => d.decision_status === "pending" && d.predicted_net_impact != null);
    if (pending.length === 0) return [];

    return pending.slice(0, 4).map(d => {
      const sim = simulations.find(s => s.decision_id === d.id);
      const impact = Number(d.predicted_net_impact) || 0;
      const probSuccess = Number(d.probability_of_success) / 100 || Number(d.capped_confidence) / 100 || 0.5;
      const probFailure = 1 - probSuccess;

      // Branch: Act Now
      const actExpected = impact * probSuccess;
      const actDownside = sim ? Number(sim.p10_impact) || impact * -0.3 : impact * -0.3;
      const implCost = sim ? Number(sim.implementation_cost) || 0 : 0;

      // Branch: Defer (real option value)
      // Value of deferral = time value of information + avoided downside risk
      const deferValue = Math.abs(actDownside) * probFailure * 0.5; // Partial avoidance
      const deferCost = impact * 0.05; // Opportunity cost of waiting (~5% decay/month)

      // Branch: Abandon
      const abandonValue = 0; // Baseline: do nothing

      // Option value = max(act, defer, abandon) - act
      const optionValue = Math.max(0, deferValue - deferCost - actExpected);

      // Cashflow stress
      const stressProb = sim ? Number(sim.probability_cashflow_stress) || 0 : 0;

      return {
        id: d.id,
        action: d.recommended_action,
        confidence: Number(d.capped_confidence) || 0,
        branches: [
          {
            label: "Act Now",
            expected: Math.round(actExpected),
            probability: Math.round(probSuccess * 100),
            implCost: Math.round(implCost),
            recommended: optionValue <= 0,
          },
          {
            label: "Defer",
            expected: Math.round(deferValue - deferCost),
            probability: null,
            implCost: 0,
            recommended: optionValue > 0,
          },
          {
            label: "Abandon",
            expected: 0,
            probability: null,
            implCost: 0,
            recommended: false,
          },
        ],
        optionValue: Math.round(optionValue),
        stressProb: Math.round(stressProb),
      };
    });
  }, [decisions, simulations]);

  if (trees.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Decision Tree & Option Value</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Pending decisions needed. Shows branching outcomes and the value of keeping options open.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Decision Tree & Option Value</h3>
        <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full ml-auto">
          Real Options
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Branching outcomes with embedded option value analysis
      </p>

      <div className="space-y-4">
        {trees.map(tree => (
          <div key={tree.id} className="border border-border/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-xs font-semibold truncate flex-1">{tree.action}</p>
              {tree.optionValue > 0 && (
                <span className="text-[10px] bg-warning/10 text-warning px-2 py-0.5 rounded-full shrink-0">
                  Option Value: €{tree.optionValue.toLocaleString()}
                </span>
              )}
            </div>

            {/* Tree branches */}
            <div className="space-y-2">
              {tree.branches.map(branch => (
                <div
                  key={branch.label}
                  className={`flex items-center gap-3 p-2.5 rounded-lg transition-all ${
                    branch.recommended
                      ? "bg-primary/5 border border-primary/20"
                      : "bg-muted/20"
                  }`}
                >
                  <div className="flex items-center gap-1.5 w-20 shrink-0">
                    {branch.recommended && <CheckCircle2 className="w-3 h-3 text-primary" />}
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-medium">{branch.label}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-4 text-[11px]">
                    <span className="text-muted-foreground">
                      EV: <span className={`font-mono font-semibold ${branch.expected >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                        €{branch.expected.toLocaleString()}
                      </span>
                    </span>
                    {branch.probability != null && (
                      <span className="text-muted-foreground">
                        P(success): <span className="font-mono font-semibold">{Math.round(branch.probability)}%</span>
                      </span>
                    )}
                    {branch.implCost > 0 && (
                      <span className="text-muted-foreground">
                        Cost: <span className="font-mono font-semibold text-warning">€{branch.implCost.toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {tree.stressProb > 20 && (
              <p className="text-[10px] text-destructive mt-2">
                ⚠ {tree.stressProb}% probability of cash-flow stress
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default DecisionTreePanel;
