import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, TrendingUp, AlertTriangle, Target,
  ChevronRight, BarChart3, Expand, Minimize2,
} from "lucide-react";
import type { Insight } from "@/hooks/useInsights";
import type { MetricTypeSummary } from "@/hooks/useMetrics";
import { filterCriticalInsights } from "@/lib/insight-filters";
import { getSeverityStyle } from "@/lib/severity-colors";
import CrossWorkspaceIntelligence from "./CrossWorkspaceIntelligence";

interface ExecutiveQuickViewProps {
  organizationId: string;
  pendingDecisions: number;
  calibrationScore: number | null;
  criticalSignals: number;
  topMetrics?: MetricTypeSummary[];
  insights: Insight[];
  onExpandToFull: () => void;
}

const ExecutiveQuickView = memo(({
  organizationId,
  pendingDecisions,
  calibrationScore,
  criticalSignals,
  topMetrics,
  insights,
  onExpandToFull,
}: ExecutiveQuickViewProps) => {
  const riskLevel = criticalSignals > 3 ? "high" : criticalSignals > 0 ? "medium" : "low";
  const riskConfig = {
    high: { label: "Exposed", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/30", icon: AlertTriangle },
    medium: { label: "Watch", color: "text-warning", bg: "bg-warning/10", border: "border-warning/30", icon: AlertTriangle },
    low: { label: "Covered", color: "text-success", bg: "bg-success/10", border: "border-success/30", icon: Shield },
  };
  const risk = riskConfig[riskLevel];
  const RiskIcon = risk.icon;

  const quickMetrics = (topMetrics ?? []).slice(0, 4);
  const metricTypesList = quickMetrics.map(m => m.metricType);

  // Top 3 insights
  const topInsights = filterCriticalInsights(insights).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1200px] space-y-6"
    >
      {/* Executive Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Risk Status */}
        <div className={`rounded-xl border ${risk.border} ${risk.bg} p-5`}>
          <div className="flex items-center gap-2 mb-2">
            <RiskIcon className={`w-4 h-4 ${risk.color}`} />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Risk Posture</span>
          </div>
          <p className={`text-2xl font-bold ${risk.color}`}>{risk.label}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {criticalSignals} signal{criticalSignals !== 1 ? "s" : ""} requiring attention
          </p>
        </div>

        {/* Pending Decisions */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Decisions</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{pendingDecisions}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {pendingDecisions === 0 ? "All decisions resolved" : "awaiting executive action"}
          </p>
        </div>

        {/* Calibration Score */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calibration</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {calibrationScore != null ? `${calibrationScore}%` : "Learning"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {calibrationScore != null
              ? calibrationScore >= 70 ? "Well-calibrated" : "Improving with each outcome"
              : "Collecting outcome data"
            }
          </p>
        </div>

        {/* Data Points */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metrics</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{quickMetrics.length}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {metricTypesList.length > 0
              ? metricTypesList.map(t => t.replace(/_/g, " ")).join(", ")
              : "No metrics detected"
            }
          </p>
        </div>
      </div>

      {/* Top KPIs */}
      {quickMetrics.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <h3 className="text-sm font-semibold mb-4">Key Performance Indicators</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickMetrics.map((m) => {
              const changePct = m.previousTotal != null && m.previousTotal !== 0
                ? ((m.total - m.previousTotal) / Math.abs(m.previousTotal)) * 100
                : null;
              const changeColor = changePct == null ? "text-muted-foreground"
                : changePct >= 0 ? "text-success" : "text-destructive";
              return (
                <div key={m.metricType} className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider truncate">{m.metricType.replace(/_/g, " ")}</p>
                  <p className="text-xl font-bold">
                    {m.latest.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                  </p>
                  {changePct != null && (
                    <p className={`text-xs font-medium ${changeColor}`}>
                      {changePct >= 0 ? "▲" : "▼"} {Math.abs(changePct).toFixed(1)}%
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Critical Signals */}
      {topInsights.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 p-5">
          <h3 className="text-sm font-semibold mb-3">Priority Signals</h3>
          <div className="space-y-2">
            {topInsights.map((insight) => (
              <div
                key={insight.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${getSeverityStyle(insight.severity).dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-2">{insight.message}</p>
                </div>
                {(insight.capped_confidence ?? insight.confidence_score) != null && (
                  <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                    {Math.round((insight.capped_confidence ?? insight.confidence_score ?? 0))}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cross-Workspace Intelligence (only renders for multi-workspace orgs) */}
      <CrossWorkspaceIntelligence organizationId={organizationId} />

      {/* Expand Button */}
      <div className="flex items-center justify-center pt-2">
        <button
          onClick={onExpandToFull}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 transition-all group"
        >
          <Expand className="w-4 h-4" />
          Expand to Full Command Center
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
});

ExecutiveQuickView.displayName = "ExecutiveQuickView";

export default ExecutiveQuickView;
