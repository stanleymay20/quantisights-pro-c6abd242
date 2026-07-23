import { Activity, AlertTriangle, Clock, Lightbulb, Shield } from "lucide-react";
import type { Insight } from "@/hooks/useInsights";
import { countCriticalSignals } from "@/lib/insight-filters";

interface IntelligenceStatusBarProps {
  hasData: boolean;
  insights: Insight[];
  openAdvisories?: number;
  riskLevel?: "low" | "moderate" | "elevated" | "high";
  lastUpdated?: string | null;
}

const RISK_STYLES = {
  low: { color: "text-success", dot: "bg-success", label: "Low" },
  moderate: { color: "text-primary", dot: "bg-primary", label: "Moderate" },
  elevated: { color: "text-warning", dot: "bg-warning", label: "Elevated" },
  high: { color: "text-destructive", dot: "bg-destructive", label: "High" },
};

function formatFreshness(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const IntelligenceStatusBar = ({ hasData, insights, openAdvisories = 0, riskLevel, lastUpdated }: IntelligenceStatusBarProps) => {
  if (!hasData) return null;

  const signals = countCriticalSignals(insights);
  const infoCount = insights.filter(i => i.severity === "info" || i.severity === "low").length;

  const computedRisk = riskLevel || (signals >= 3 ? "high" : signals >= 1 ? "elevated" : infoCount > 0 ? "moderate" : "low");
  const riskStyle = RISK_STYLES[computedRisk];

  const systemStatus = signals === 0 ? "Nominal" : signals <= 2 ? "Active Signals" : "Attention Required";
  const statusColor = signals === 0 ? "text-success" : signals <= 2 ? "text-warning" : "text-destructive";

  return (
    <div className="h-7 sm:h-9 border-b border-border/30 bg-card/40 backdrop-blur-sm flex items-center px-3 md:px-8 gap-2 sm:gap-3 md:gap-6 shrink-0 overflow-x-auto scrollbar-hide">
      {/* System status */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div className={`w-1.5 h-1.5 rounded-full ${signals === 0 ? "bg-success" : signals <= 2 ? "bg-warning" : "bg-destructive"}`} />
        <span className={`text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider ${statusColor}`}>
          <span className="sm:hidden">{signals === 0 ? "OK" : signals <= 2 ? "Active" : "Attn"}</span>
          <span className="hidden sm:inline">{systemStatus}</span>
        </span>
      </div>

      <span className="w-px h-3.5 bg-border/50 shrink-0" />

      {/* Risk level */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Shield className={`w-3 h-3 ${riskStyle.color}`} />
        <span className={`text-[11px] font-semibold ${riskStyle.color}`}>{riskStyle.label}</span>
      </div>

      {/* Signals — hidden on mobile */}
      <span className="w-px h-3.5 bg-border/50 shrink-0 hidden sm:block" />
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <AlertTriangle className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Signals:</span>
        <span className={`text-[11px] font-semibold ${signals > 0 ? "text-warning" : "text-muted-foreground"}`}>
          {signals}
        </span>
      </div>

      {/* Advisories — hidden on mobile */}
      <span className="w-px h-3.5 bg-border/50 shrink-0 hidden sm:block" />
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Lightbulb className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Advisories:</span>
        <span className={`text-[11px] font-semibold ${openAdvisories > 0 ? "text-primary" : "text-muted-foreground"}`}>
          {openAdvisories} Open
        </span>
      </div>

      {/* Insights — hidden on mobile */}
      <span className="w-px h-3.5 bg-border/50 shrink-0 hidden sm:block" />
      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Activity className="w-3 h-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Insights:</span>
        <span className="text-[11px] font-semibold text-muted-foreground">{infoCount}</span>
      </div>

      {/* Data Freshness — hidden on mobile */}
      {lastUpdated && (
        <>
          <span className="w-px h-3.5 bg-border/50 shrink-0 hidden md:block" />
          <div className="hidden md:flex items-center gap-1.5 ml-auto shrink-0">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              Data updated: {formatFreshness(lastUpdated)}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default IntelligenceStatusBar;
