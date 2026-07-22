import { useState } from "react";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  RefreshCw,
  Target,
  TrendingUp,
  CheckCircle2,
  Brain,
  Gauge,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  orgId: string | null;
}

const SystemHealthDashboard = ({ orgId }: Props) => {
  const { health, loading, refresh } = useSystemHealth(orgId);
  const [expanded, setExpanded] = useState(false);

  if (loading && !health) {
    return (
      <Card role="status" aria-live="polite">
        <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin text-primary" />
          Loading system health…
        </CardContent>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card role="status" aria-live="polite" className="border-warning/30 bg-warning/5">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
            <div>
              <h3 className="font-semibold">System health is not available yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Quantivis could not load the health snapshot for this organization. This can happen before autonomous jobs, outcomes, or calibration data have been created.
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FallbackMetric label="Organization" value={orgId ? "Selected" : "Missing"} />
            <FallbackMetric label="Health snapshot" value="Pending" />
            <FallbackMetric label="User action" value="Refresh or upload data" />
          </div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={!orgId || loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
            Retry health check
          </Button>
        </CardContent>
      </Card>
    );
  }

  const loopStatus = health.closedLoopRate >= 50
    ? "healthy"
    : health.closedLoopRate >= 20
    ? "developing"
    : "initializing";

  const statusColor = {
    healthy: "text-green-500",
    developing: "text-amber-500",
    initializing: "text-red-400",
  }[loopStatus];

  const statusBg = {
    healthy: "bg-green-500/10 border-green-500/20",
    developing: "bg-amber-500/10 border-amber-500/20",
    initializing: "bg-red-400/10 border-red-400/20",
  }[loopStatus];

  return (
    <section aria-label="System Intelligence Dashboard" className="space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <h3 className="text-sm sm:text-[13px] font-semibold text-foreground">System Intelligence</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="h-7 sm:hidden text-[11px]"
          >
            {expanded ? "Less" : "More"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={loading}
            aria-label={loading ? "Refreshing system health" : "Refresh system health"}
            className="h-7 sm:h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className={`sm:hidden ${expanded ? "hidden" : "block"}`}>
        <div className={`rounded-lg border px-3 py-2.5 ${statusBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold ${statusColor}`}>Closed-Loop: {health.closedLoopRate}%</span>
            <Badge variant="outline" className={`text-[10px] ${statusColor}`}>{loopStatus}</Badge>
          </div>
          <Progress value={health.closedLoopRate} className="h-1 mt-1.5" />
          <p className="text-[10px] text-muted-foreground mt-1">{health.evaluatedOutcomes}/{health.totalDecisions} measured · {health.openAdvisories} open signals</p>
        </div>
      </div>

      <div className={`${expanded ? "block" : "hidden"} sm:block space-y-3`}>
        <Card className={`border ${statusBg}`}>
          <CardContent className="pt-3 sm:pt-4 pb-2 sm:pb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className={`h-4 w-4 ${statusColor}`} />
                <span className="text-sm font-medium text-foreground">Closed-Loop Rate</span>
              </div>
              <Badge variant="outline" className={statusColor}>{loopStatus}</Badge>
            </div>
            <div className="flex items-end gap-2 mb-2">
              <span className={`text-xl sm:text-2xl font-bold ${statusColor}`}>{health.closedLoopRate}%</span>
              <span className="text-xs text-muted-foreground mb-1">{health.evaluatedOutcomes}/{health.totalDecisions} measured</span>
            </div>
            <Progress value={health.closedLoopRate} className="h-1.5" aria-label={`Closed loop rate: ${health.closedLoopRate}%`} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <Card className="border border-border/50"><CardContent className="pt-3 pb-2 px-3"><div className="flex items-center gap-1.5 mb-1"><Brain className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Calibration</span></div><div className="text-lg font-bold text-foreground">{health.calibrationScore !== null ? `${health.calibrationScore}%` : "—"}</div>{health.biasDirection && health.biasDirection !== "neutral" && (<span className="text-xs text-warning">{health.biasDirection === "overconfident" ? "↑ Over" : "↓ Under"}confident</span>)}{health.latestCalibrationAt && (<div className="text-[10px] text-muted-foreground mt-0.5">v{health.calibrationModelVersion} · {formatDistanceToNow(new Date(health.latestCalibrationAt), { addSuffix: true })}</div>)}</CardContent></Card>
          <Card className="border border-border/50"><CardContent className="pt-3 pb-2 px-3"><div className="flex items-center gap-1.5 mb-1"><Gauge className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">Avg Confidence</span></div><div className="text-lg font-bold text-foreground">{health.avgConfidence !== null ? `${Math.round(health.avgConfidence)}%` : "—"}</div></CardContent></Card>
          <Card className="border border-border/50"><CardContent className="pt-3 pb-2 px-3"><div className="flex items-center gap-1.5 mb-1"><Zap className="h-3.5 w-3.5 text-warning" /><span className="text-xs text-muted-foreground">Open Signals</span></div><div className="text-lg font-bold text-foreground">{health.openAdvisories}</div></CardContent></Card>
          <Card className="border border-border/50"><CardContent className="pt-3 pb-2 px-3"><div className="flex items-center gap-1.5 mb-1"><TrendingUp className="h-3.5 w-3.5 text-success" /><span className="text-xs text-muted-foreground">Insights (24h)</span></div><div className="text-lg font-bold text-foreground">{health.insightsLast24h}</div></CardContent></Card>
        </div>

        <Card className="border border-border/50">
          <CardContent className="pt-3 pb-2 px-3">
            <div className="flex items-center gap-1.5 mb-2"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium text-foreground">Decision Pipeline</span></div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total Decisions</span><span className="font-medium text-foreground">{health.totalDecisions}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Completed</span><span className="font-medium text-foreground">{health.completedDecisions}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Outcomes Measured</span><span className="font-medium text-success">{health.evaluatedOutcomes}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Pending Evaluation</span><span className="font-medium text-warning">{health.pendingOutcomes}</span></div>
            </div>
          </CardContent>
        </Card>

        {health.cronJobs.length > 0 && (
          <Card className="border border-border/50">
            <CardContent className="pt-3 pb-2 px-3">
              <div className="flex items-center gap-1.5 mb-2"><Activity className="h-3.5 w-3.5 text-primary" /><span className="text-xs font-medium text-foreground">Autonomous Jobs</span></div>
              <div className="space-y-1.5">
                {health.cronJobs.map((job) => (
                  <div key={job.job_name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5"><div className={`w-1.5 h-1.5 rounded-full ${job.last_status === "completed" ? "bg-green-500" : job.last_status === "failed" ? "bg-red-500" : "bg-muted-foreground/40"}`} /><span className="text-muted-foreground capitalize">{job.job_name.replace(/-/g, " ")}</span></div>
                    <span className="text-[10px] text-muted-foreground">{job.last_completed_at ? formatDistanceToNow(new Date(job.last_completed_at), { addSuffix: true }) : "no runs"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
};

function FallbackMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border/60 pl-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

export default SystemHealthDashboard;
