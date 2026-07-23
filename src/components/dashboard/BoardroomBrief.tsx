import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { Crosshair, AlertTriangle, TrendingUp, Shield, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { filterCriticalInsights } from "@/lib/insight-filters";
import type { Insight } from "@/hooks/useInsights";
import type { MetricTypeSummary } from "@/hooks/useMetrics";

interface BoardroomBriefProps {
  insights: Insight[];
  pendingDecisions: number;
  calibrationScore: number | null;
  topMetrics?: MetricTypeSummary[];
}

/** Boardroom Brief — 3-5 line executive summary distilling the entire system state */
const BoardroomBrief = memo(({ insights, pendingDecisions, calibrationScore, topMetrics }: BoardroomBriefProps) => {
  const brief = useMemo(() => {
    const critical = filterCriticalInsights(insights);
    const medium = insights.filter(i => i.severity === "medium");
    const totalSignals = critical.length + medium.length;

    // 1. Most critical signal
    const topSignal = critical[0] || medium[0];
    const signalLine = topSignal
      ? topSignal.message
      : "No critical signals detected — governance posture is stable.";

    // 2. Primary action
    const actionLine = topSignal
      ? `${pendingDecisions} decision${pendingDecisions !== 1 ? "s" : ""} awaiting executive action — highest priority requires resolution within ${critical.length > 0 ? "7" : "14"} days.`
      : "All signals addressed. System is monitoring for emerging patterns.";

    // 3. Risk if ignored
    const riskLine = critical.length > 0
      ? `${critical.length} unresolved high-severity signal${critical.length !== 1 ? "s" : ""} — continued inaction compounds downside exposure.`
      : totalSignals > 0
        ? `${totalSignals} signal${totalSignals !== 1 ? "s" : ""} under watch — no immediate escalation required.`
        : null;

    // 4. Calibration / defensibility
    const calLine = calibrationScore != null
      ? calibrationScore >= 70
        ? `Calibration: ${calibrationScore}% — recommendations are well-calibrated against historical outcomes.`
        : `Calibration: ${calibrationScore}% — model accuracy is improving as more outcome data is collected.`
      : "Calibration requires more completed decisions to establish accuracy baseline.";

    // 5. Posture
    const posture: "critical" | "watch" | "stable" = critical.length > 0 ? "critical" : totalSignals > 0 ? "watch" : "stable";

    return { signalLine, actionLine, riskLine, calLine, posture, totalSignals };
  }, [insights, pendingDecisions, calibrationScore]);

  const postureConfig = {
    critical: {
      label: "Requires Action",
      border: "border-destructive/30",
      bg: "bg-destructive/[0.04]",
      accent: "text-destructive",
      icon: AlertTriangle,
    },
    watch: {
      label: "Under Watch",
      border: "border-warning/30",
      bg: "bg-warning/[0.04]",
      accent: "text-warning",
      icon: Shield,
    },
    stable: {
      label: "Stable",
      border: "border-success/30",
      bg: "bg-success/[0.04]",
      accent: "text-success",
      icon: TrendingUp,
    },
  };

  const cfg = postureConfig[brief.posture];
  const PostureIcon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border ${cfg.border} ${cfg.bg} p-3 sm:p-5`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.accent} bg-background/60 border border-current/20`}>
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Boardroom Brief</h2>
            <p className="text-[10px] text-muted-foreground">Closed-Loop Decision Operating System</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full flex items-center gap-1.5 ${cfg.accent} bg-background/60 border border-current/20`}>
          <PostureIcon className="w-3 h-3" />
          {cfg.label}
        </span>
      </div>

      <div className="space-y-1.5 sm:space-y-2">
        <p className="text-sm font-medium text-foreground leading-snug">{brief.signalLine}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{brief.actionLine}</p>
        {brief.riskLine && (
          <p className="text-xs text-muted-foreground/80 leading-relaxed italic hidden sm:block">{brief.riskLine}</p>
        )}
        <p className="text-[11px] text-muted-foreground/60 hidden sm:block">{brief.calLine}</p>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/20">
        <span className="text-[10px] text-muted-foreground/50">
          {brief.totalSignals} active signal{brief.totalSignals !== 1 ? "s" : ""} · {pendingDecisions} pending decision{pendingDecisions !== 1 ? "s" : ""}
        </span>
        <Link
          to="/board-report"
          className={`text-[11px] font-semibold flex items-center gap-1 hover:underline ${cfg.accent}`}
        >
          Full board report <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </motion.div>
  );
});

BoardroomBrief.displayName = "BoardroomBrief";

export default BoardroomBrief;
