import { AlertTriangle, TrendingDown, DollarSign, ArrowRight, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import type { Insight } from "@/hooks/useInsights";
import { filterCriticalInsights } from "@/lib/insight-filters";
import { getSeverityStyle } from "@/lib/severity-colors";

const ICONS = [TrendingDown, DollarSign, AlertTriangle];

interface AnomalyDetectionProps {
  insights: Insight[];
}

const AnomalyDetection = ({ insights }: AnomalyDetectionProps) => {
  const anomalies = filterCriticalInsights(insights).slice(0, 4);

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anomalies</h3>
        {anomalies.length > 0 && (
          <Link to="/diagnostics" className="text-[11px] font-semibold text-destructive hover:underline flex items-center gap-0.5">
            Diagnose all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">Detected deviations</p>
      {anomalies.length === 0 ? (
        <div className="py-6 text-center">
          <Shield className="w-7 h-7 text-success/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No anomalies — systems nominal</p>
        </div>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a, i) => {
            const Icon = ICONS[i % ICONS.length];
            const style = getSeverityStyle(a.severity);
            return (
              <div
                key={a.id}
                className={`group p-2.5 rounded-lg transition-all ${style.bg} border ${style.border}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${style.text}`} />
                  <span className="text-[12px] leading-snug flex-1">{a.message}</span>
                </div>
                {/* Decision shortcuts */}
                <div className="flex items-center gap-3 mt-2 ml-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    to="/diagnostics"
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Investigate
                  </Link>
                  <button className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    Dismiss
                  </button>
                  <Link
                    to="/executive"
                    className="text-[10px] font-semibold text-warning hover:underline"
                  >
                    Escalate
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnomalyDetection;
