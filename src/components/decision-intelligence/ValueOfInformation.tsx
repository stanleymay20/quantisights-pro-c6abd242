import { useMemo } from "react";
import { Scale, ArrowRight, AlertTriangle } from "lucide-react";
import { getSystemConfig } from "@/lib/system-config";

interface Decision {
  id: string;
  recommended_action: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
  probability_of_success: number | null;
  decision_status: string;
}

/**
 * Value of Information (VoI) analysis.
 * All parameters configurable via system-config.
 */
const ValueOfInformation = ({ decisions }: { decisions: Decision[] }) => {
  const analysis = useMemo(() => {
    const cfg = getSystemConfig().decisionIntelligence.voi;
    const pending = decisions.filter(
      d => d.decision_status === "pending" &&
           d.capped_confidence != null &&
           d.predicted_net_impact != null
    );

    if (pending.length === 0) return null;

    return pending.slice(0, 5).map(d => {
      const confidence = Number(d.capped_confidence) / 100;
      const impact = Number(d.predicted_net_impact) || 0;
      const probSuccess = Number(d.probability_of_success) / 100 || confidence;

      const evCurrent = impact * probSuccess;
      const evPerfect = Math.max(impact, 0);
      const evpi = evPerfect - evCurrent;

      const dataPointsNeeded = Math.ceil((1 - confidence) / cfg.uncertaintyReduction);
      const costPerDataPoint = Math.abs(impact) * cfg.costPerDataPointRatio;
      const evsi = evpi * cfg.sampleInfoRatio;

      const dataCost = dataPointsNeeded * costPerDataPoint;
      const netVoI = evsi - dataCost;

      const recommendation = confidence >= cfg.decideNowConfidence
        ? "decide_now"
        : netVoI > 0
        ? "gather_data"
        : "decide_now";

      return {
        id: d.id,
        action: d.recommended_action,
        confidence: Math.round(confidence * 100),
        evCurrent: Math.round(evCurrent),
        evpi: Math.round(evpi),
        evsi: Math.round(evsi),
        dataPointsNeeded,
        dataCost: Math.round(dataCost),
        netVoI: Math.round(netVoI),
        recommendation,
      };
    });
  }, [decisions]);

  if (!analysis || analysis.length === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Scale className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Value of Information</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Pending decisions needed. VoI tells you whether gathering more data before acting is worth the delay.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <Scale className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Value of Information</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Should you decide now or gather more data first?
      </p>

      <div className="space-y-3">
        {analysis.map(item => (
          <div key={item.id} className="border border-border/30 rounded-lg p-3">
            <p className="text-xs font-medium truncate mb-3">{item.action}</p>
            
            <div className="grid grid-cols-4 gap-2 text-center mb-3">
              <div>
                <p className="text-[10px] text-muted-foreground">Confidence</p>
                <p className={`text-sm font-bold font-mono ${item.confidence >= 75 ? "text-success" : item.confidence >= 50 ? "text-warning" : "text-destructive"}`}>
                  {Math.round(item.confidence)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">EV Current</p>
                <p className="text-sm font-bold font-mono">€{item.evCurrent.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">EVPI</p>
                <p className="text-sm font-bold font-mono text-primary">€{item.evpi.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">Net VoI</p>
                <p className={`text-sm font-bold font-mono ${item.netVoI > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                  €{item.netVoI.toLocaleString()}
                </p>
              </div>
            </div>

            <div className={`flex items-center gap-2 p-2 rounded-lg text-xs font-medium ${
              item.recommendation === "gather_data"
                ? "bg-warning/10 text-warning"
                : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {item.recommendation === "gather_data" ? (
                <>
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  Gather ~{item.dataPointsNeeded} more data points before deciding (est. cost: €{item.dataCost.toLocaleString()})
                </>
              ) : (
                <>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                  Confidence sufficient — proceed with decision
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ValueOfInformation;
