import { Brain, Target, AlertTriangle, Zap, TrendingUp } from "lucide-react";
import logo from "@/assets/quantivis-logo.png";

interface ScorecardProps {
  tierLabel: string;
  tierColor: string;
  calibrationScore: number;
  brierScore: number;
  overconfidenceScore: number;
  underconfidenceScore: number;
  rangeCompression: number;
  tailNeglect: number;
  biasMarkers: string[];
  downsideReduction: number;
}

const TIER_ICON_MAP: Record<string, typeof Brain> = {
  "Volatile Intuition": AlertTriangle,
  "Tactical Optimist": TrendingUp,
  "Structured Realist": Target,
  "Strategic Bayesian": Brain,
  "Institutional-Grade": Zap,
};

const ShareableScorecard = (props: ScorecardProps) => {
  const TierIcon = TIER_ICON_MAP[props.tierLabel] || Brain;

  return (
    <div
      id="calibration-scorecard"
      className="w-full max-w-lg mx-auto rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-background via-background to-primary/5 shadow-xl"
    >
      {/* Header band */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <img src={logo} alt="Quantivis" className="h-6 w-auto opacity-80" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
            Calibration Scorecard
          </span>
        </div>
      </div>

      {/* Tier hero */}
      <div className="px-6 py-8 text-center space-y-3">
        <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
          <TierIcon className={`w-7 h-7 ${props.tierColor}`} />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium mb-1">
            Calibration Tier
          </p>
          <h2 className={`text-[18px] font-semibold tracking-tight ${props.tierColor}`}>
            {props.tierLabel}
          </h2>
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="text-xs font-mono font-bold text-foreground bg-muted px-2.5 py-1 rounded-md">
            {props.calibrationScore}% calibrated
          </span>
          <span className="text-xs font-mono text-muted-foreground bg-muted px-2.5 py-1 rounded-md">
            Brier: {props.brierScore}
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-6 pb-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Over-\nconfidence", value: `+${props.overconfidenceScore}pp`, danger: props.overconfidenceScore > 15 },
            { label: "Under-\nconfidence", value: `-${props.underconfidenceScore}pp`, danger: props.underconfidenceScore > 15 },
            { label: "Range\nCompression", value: `${props.rangeCompression}%`, danger: props.rangeCompression > 30 },
            { label: "Tail\nNeglect", value: `${props.tailNeglect}pp`, danger: props.tailNeglect > 20 },
          ].map((m) => (
            <div key={m.label} className="text-center p-2.5 rounded-lg bg-muted/50 border border-border/50">
              <p className="text-[9px] text-muted-foreground font-medium leading-tight whitespace-pre-line">{m.label}</p>
              <p className={`text-base font-bold font-mono mt-1 ${m.danger ? "text-destructive" : "text-success"}`}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bias markers */}
      {props.biasMarkers.length > 0 && (
        <div className="px-6 pb-4">
          <div className="flex flex-wrap gap-1.5 justify-center">
            {props.biasMarkers.map((b) => (
              <span key={b} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                {b}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Impact bar */}
      <div className="mx-6 mb-4 p-3 rounded-lg bg-success/5 border border-success/20 text-center">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Estimated Downside Reduction</p>
        <p className="text-xl font-bold text-success font-mono">~{props.downsideReduction}%</p>
      </div>

      {/* Footer CTA */}
      <div className="px-6 py-4 border-t border-border/40 bg-muted/30 text-center">
        <p className="text-xs text-muted-foreground">
          Measure your judgment →{" "}
          <span className="text-primary font-semibold">quantivis.io/calibration</span>
        </p>
      </div>
    </div>
  );
};

export default ShareableScorecard;
