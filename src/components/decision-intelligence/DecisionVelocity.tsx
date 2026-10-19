import { useMemo } from "react";
import { Timer, TrendingDown, TrendingUp, Minus, AlertTriangle } from "lucide-react";
import { getSystemConfig } from "@/lib/system-config";
import {
  calculateDecisionVelocity,
  formatVelocityDays,
  type DecisionVelocityRecord,
  type TimedSample,
} from "@/lib/decision-velocity-metrics";

const VelocityMetric = ({
  label, metric,
}: {
  label: string;
  metric: TimedSample;
}) => (
  <div className="text-center bg-muted/20 rounded-lg p-3">
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
    <p className="text-xl font-bold tracking-tight text-primary">
      {formatVelocityDays(metric.medianDays)}
    </p>
    <p className="text-[10px] text-muted-foreground mt-1">
      {metric.count} valid {metric.count === 1 ? "record" : "records"}
    </p>
  </div>
);

/**
 * Read-only internal lifecycle timing. This reuses the canonical Decision
 * Intelligence screen; it does NOT infer external provider confirmation.
 * The parent must supply rows from a successful, tenant-scoped query.
 */
const DecisionVelocity = ({ decisions }: { decisions: DecisionVelocityRecord[] }) => {
  const metrics = useMemo(
    () => calculateDecisionVelocity(
      decisions,
      Date.now(),
      getSystemConfig().decisionIntelligence.velocity,
    ),
    [decisions],
  );
  const { slowWarningDays } = getSystemConfig().decisionIntelligence.velocity;

  if (metrics.observedRows === 0) {
    return (
      <div className="glass-card p-6 rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <Timer className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Decision Velocity</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          No decision records available. Recorded decision and execution timing is not yet measurable.
        </p>
      </div>
    );
  }

  const trendAvailable = metrics.trend !== "insufficient";
  const TrendIcon = metrics.trend === "improving"
    ? TrendingDown
    : metrics.trend === "degrading"
      ? TrendingUp
      : Minus;
  const trendLabel = metrics.trend === "improving"
    ? "Recent decisions quicker"
    : metrics.trend === "degrading"
      ? "Recent decisions slower"
      : metrics.trend === "stable"
        ? "No material timing shift"
        : "Trend unavailable";

  return (
    <div className="glass-card p-6 rounded-xl">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">Decision Velocity</h3>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full ml-auto flex items-center gap-1 ${
            metrics.trend === "improving" ? "bg-success/10 text-success"
              : metrics.trend === "degrading" ? "bg-warning/10 text-warning"
                : "bg-muted text-muted-foreground"
          }`}
        >
          <TrendIcon className="w-3 h-3" />
          {trendLabel}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        Internal lifecycle timing from stored decision timestamps, not event detection or
        independently verified external execution.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <VelocityMetric label="Median created → decided" metric={metrics.timeToDecision} />
        <VelocityMetric label="Median execution started → internally completed" metric={metrics.internalExecutionTime} />
        <VelocityMetric label="Median created → internally completed" metric={metrics.internalCycleTime} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Decisions sampled</span>
          <span className="font-mono font-semibold">{metrics.observedRows}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Decision timestamps available</span>
          <span className="font-mono font-semibold">{metrics.timeToDecision.count}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pending decisions</span>
          <span className="font-mono font-semibold">{metrics.pendingCount}</span>
        </div>
        {metrics.pendingCount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Median pending age (valid dates)</span>
            <span className="font-mono font-semibold">
              {formatVelocityDays(metrics.pendingAge.medianDays)}
            </span>
          </div>
        )}
        {metrics.missingDecisionTimeCount > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Resolved rows missing timing evidence</span>
            <span className="font-mono font-semibold">{metrics.missingDecisionTimeCount}</span>
          </div>
        )}
      </div>

      {metrics.invalidRecordCount > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-warning/10 text-warning p-2.5 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {metrics.invalidRecordCount} invalid lifecycle {metrics.invalidRecordCount === 1 ? "record was" : "records were"}
          {" "}excluded from timing calculations; investigate source timestamps.
        </div>
      )}
      {metrics.timeToDecision.medianDays !== null
        && metrics.timeToDecision.medianDays > slowWarningDays && (
        <div className="mt-3 p-2.5 rounded-lg bg-warning/10 text-warning text-xs font-medium">
          Median time from record creation to decision exceeds {slowWarningDays} days.
          Review approval bottlenecks before proposing an intervention.
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-3 border-t border-border/40 pt-2">
        Median computed from {metrics.timeToDecision.count} valid decision intervals;
        {trendAvailable
          ? " trend compares the older half with the newer half by creation timestamp."
          : " too few valid observations for a trend."}
        {" "}Incomplete milestones remain unknown. An internal completion timestamp does not prove an external provider completed its action.
      </p>
    </div>
  );
};

export default DecisionVelocity;
