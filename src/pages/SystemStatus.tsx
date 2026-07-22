import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Activity, CheckCircle2, XCircle, Clock, RefreshCw,
  Shield, Database, Zap, Brain, Server, ArrowLeft,
  AlertTriangle, TrendingUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import logo from "@/assets/quantivis-logo.png";
import { deriveSystemStatus, type SystemStatus as StatusValue } from "@/lib/system-status";
import { useSeoHead } from "@/lib/useSeoHead";

interface CronJob {
  job_name: string;
  status: string;
  started_at?: string | null;
  last_run_at: string | null;
  next_expected_run_at: string | null;
  severity: "critical" | "warning" | "info";
  evidence_source: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  records_processed: number | null;
}

interface PublicStatusResponse {
  jobs: CronJob[];
  generated_at: string;
}

interface SystemMetrics {
  totalDecisions: number;
  completedDecisions: number;
  evaluatedOutcomes: number;
  calibrationModels: number;
  openAdvisories: number;
  totalDatasets: number;
  lastCronJobs: CronJob[];
  overallStatus: StatusValue;
}

const MONITORED_JOBS = [
  { name: "evaluate-outcomes", label: "Outcome Evaluation", critical: true },
  { name: "adaptive-calibration", label: "Calibration Engine", critical: true },
  { name: "refresh-aggregates", label: "Aggregate Refresh", critical: false },
  { name: "compute-rollups", label: "KPI Rollups", critical: false },
  { name: "retention-cleanup", label: "Data Retention Cleanup", critical: false },
  { name: "weekly-calibration-digest", label: "Weekly Digest", critical: false },
];

const SystemStatus = () => {
  useSeoHead({
    title: "System Status | Quantivis",
    description: "Live Quantivis system status, scheduled-job telemetry, and operational evidence for public trust and procurement review.",
    canonicalPath: "/status",
  });

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [telemetryAvailable, setTelemetryAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [decisionsRes, advisoriesRes, datasetsRes, statusRes, calibrationRes] = await Promise.all([
        supabase.from("decision_ledger").select("decision_status, outcome_measured_at", { count: "exact", head: false }).limit(1000),
        supabase.from("advisory_instances").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("datasets").select("id", { count: "exact", head: true }),
        supabase.functions.invoke<PublicStatusResponse>("public-system-status"),
        supabase.from("calibration_models").select("id", { count: "exact", head: true }),
      ]);

      const decisions = decisionsRes.data ?? [];
      const completed = decisions.filter(d => d.decision_status === "completed" || d.decision_status === "executed").length;
      const evaluated = decisions.filter(d => d.outcome_measured_at).length;

      const telemetryAvailable = !statusRes.error && Array.isArray(statusRes.data?.jobs);
      const cronJobs = telemetryAvailable ? statusRes.data?.jobs ?? [] : [];
      const recentFailures = cronJobs.filter(j => {
        const lastRunAt = j.last_run_at ?? j.started_at;
        return j.status === "failed" && lastRunAt && new Date(lastRunAt) > new Date(Date.now() - 24 * 60 * 60 * 1000);
      });
      const criticalFailures = recentFailures.filter(j =>
        MONITORED_JOBS.some(m => m.critical && m.name === j.job_name)
      );

      const queriesSucceeded = [
        decisionsRes,
        advisoriesRes,
        datasetsRes,
        statusRes,
      ].every((result) => !result.error);
      const staleCriticalJobs = MONITORED_JOBS.filter((job) => {
        if (!job.critical) return false;
        const last = cronJobs.find((run) => run.job_name === job.name);
        const lastRunAt = last?.last_run_at ?? last?.started_at;
        if (!lastRunAt) return false;
        return Date.now() - new Date(lastRunAt).getTime() > 24 * 60 * 60 * 1000;
      }).length;
      const overallStatus = deriveSystemStatus({
        queriesSucceeded: queriesSucceeded && telemetryAvailable,
        recordedRuns: cronJobs.length,
        criticalFailures: criticalFailures.length,
        nonCriticalFailures: recentFailures.length - criticalFailures.length,
        staleCriticalJobs,
      });

      setMetrics({
        totalDecisions: decisions.length,
        completedDecisions: completed,
        evaluatedOutcomes: evaluated,
        calibrationModels: calibrationRes.count ?? 0,
        openAdvisories: advisoriesRes.count ?? 0,
        totalDatasets: datasetsRes.count ?? 0,
        lastCronJobs: cronJobs,
        overallStatus,
      });
      setTelemetryAvailable(telemetryAvailable);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[SystemStatus] fetch error:", err);
      setTelemetryAvailable(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  // Auto-refresh every 60s
  useEffect(() => {
    const interval = setInterval(fetchStatus, 60_000);
    return () => clearInterval(interval);
  }, []);

  const getJobStatus = (jobName: string): { last: CronJob | null; status: "ok" | "failed" | "stale" | "never" } => {
    if (!metrics) return { last: null, status: "never" };
    const runs = metrics.lastCronJobs.filter(j => j.job_name === jobName);
    if (runs.length === 0) return { last: null, status: "never" };
    const last = runs[0];
    if (last.status === "failed") return { last, status: "failed" };
    const lastRunAt = last.last_run_at ?? last.started_at;
    if (!lastRunAt) return { last, status: "never" };
    const age = Date.now() - new Date(lastRunAt).getTime();
    if (age > 48 * 60 * 60 * 1000) return { last, status: "stale" };
    return { last, status: "ok" };
  };

  const statusConfig = {
    unknown: {
      color: "text-muted-foreground",
      bg: "bg-muted/30 border-border",
      label: telemetryAvailable ? "Telemetry Partially Available" : "Telemetry Unavailable",
      icon: Clock,
    },
    operational: { color: "text-success", bg: "bg-success/10 border-success/20", label: "All Systems Operational", icon: CheckCircle2 },
    degraded: { color: "text-warning", bg: "bg-warning/10 border-warning/20", label: "Degraded Performance", icon: AlertTriangle },
    outage: { color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", label: "System Issues Detected", icon: XCircle },
  };

  const jobStatusConfig = {
    ok: { color: "text-success", bg: "bg-success/10", icon: CheckCircle2, label: "Healthy" },
    failed: { color: "text-destructive", bg: "bg-destructive/10", icon: XCircle, label: "Failed" },
    stale: { color: "text-warning", bg: "bg-warning/10", icon: Clock, label: "Stale" },
    never: { color: "text-muted-foreground", bg: "bg-muted/30", icon: Clock, label: "Scheduled" },
  };

  const overall = metrics ? statusConfig[metrics.overallStatus] : statusConfig.unknown;
  const OverallIcon = overall.icon;

  const closedLoopRate = metrics && metrics.totalDecisions > 0
    ? Math.round((metrics.evaluatedOutcomes / metrics.totalDecisions) * 100)
    : 0;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <img src={logo} alt="Quantivis" className="h-7" />
            </Link>
            <span className="text-sm text-muted-foreground font-medium">/ System Status</span>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchStatus} disabled={loading} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline text-xs">Refresh</span>
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Overall Status Banner */}
        <Card className={`border-2 ${overall.bg}`}>
          <CardContent className="py-6 flex items-center gap-4">
            <OverallIcon className={`w-8 h-8 ${overall.color}`} />
            <div>
              <h1 className={`text-[16px] font-semibold tracking-tight ${overall.color}`}>{overall.label}</h1>
              <p className="text-sm text-muted-foreground">
                Last checked {formatDistanceToNow(lastRefresh, { addSuffix: true })} · Auto-refreshes every 60s
              </p>
              {metrics?.overallStatus === "unknown" && (
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                  Health is not marked operational until all required public checks and scheduled-job evidence are available.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Platform Metrics */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Platform Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Decisions", value: metrics?.totalDecisions ?? "—", icon: Brain },
              { label: "Outcomes Measured", value: metrics?.evaluatedOutcomes ?? "—", icon: TrendingUp },
              { label: "Calibration Models", value: metrics?.calibrationModels ?? "—", icon: Zap },
              { label: "Open Advisories", value: metrics?.openAdvisories ?? "—", icon: AlertTriangle },
              { label: "Datasets", value: metrics?.totalDatasets ?? "—", icon: Database },
              { label: "Completed Decisions", value: metrics?.completedDecisions ?? "—", icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label} className="border border-border/50">
                <CardContent className="pt-3 pb-2 px-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[11px] text-muted-foreground">{label}</span>
                  </div>
                  <div className="text-lg font-bold text-foreground">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Closed-Loop Rate */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Learning Loop Health
          </h2>
          <Card className="border border-border/50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Closed-Loop Rate</span>
                <Badge variant="outline">{closedLoopRate}%</Badge>
              </div>
              <Progress value={closedLoopRate} className="h-2 mb-2" />
              <p className="text-xs text-muted-foreground">
                {metrics?.evaluatedOutcomes ?? 0} of {metrics?.totalDecisions ?? 0} decisions have measured outcomes
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Scheduled Jobs */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" /> Scheduled Jobs
          </h2>
          <div className="space-y-2">
            {MONITORED_JOBS.map((job) => {
              const { last, status } = getJobStatus(job.name);
              const config = jobStatusConfig[status];
              const StatusIcon = config.icon;
              return (
                <Card key={job.name} className="border border-border/50">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                        <StatusIcon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {job.label}
                          {job.critical && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Critical</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {last?.last_run_at || last?.started_at ? (
                            <>
                              Last run {formatDistanceToNow(new Date(last.last_run_at ?? last.started_at!), { addSuffix: true })}
                              {last.duration_ms != null && <> · {last.duration_ms}ms</>}
                              {last.records_processed != null && <> · {last.records_processed} processed</>}
                            </>
                          ) : !telemetryAvailable ? (
                            "Telemetry unavailable. No scheduler evidence was returned."
                          ) : (
                            "Awaiting first recorded run"
                          )}
                        </div>
                        {last && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Next expected: {last.next_expected_run_at
                              ? new Date(last.next_expected_run_at).toLocaleString()
                              : "not available"}
                            {" · "}Severity: {last.severity}
                            {" · "}Evidence: {last.evidence_source}
                          </div>
                        )}
                        {status === "failed" && last?.error_message && (
                          <p className="text-[11px] text-destructive mt-0.5 truncate max-w-[400px]">
                            {last.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`${config.color} shrink-0`}>
                      {config.label}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Recent Job History */}
        {metrics && metrics.lastCronJobs.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" /> Recent Job History
            </h2>
            <Card className="border border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 bg-muted/20">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Job</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground text-xs">When</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground text-xs">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.lastCronJobs.slice(0, 15).map((job, i) => (
                      <tr key={(job.last_run_at ?? job.started_at ?? job.job_name) + i} className="border-b border-border/10 last:border-0">
                        <td className="py-2 px-3 font-medium">{job.job_name}</td>
                        <td className="py-2 px-3">
                          <Badge
                            variant="outline"
                            className={job.status === "completed" ? "text-success" : job.status === "failed" ? "text-destructive" : "text-warning"}
                          >
                            {job.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground text-xs">
                          {job.last_run_at || job.started_at
                            ? formatDistanceToNow(new Date(job.last_run_at ?? job.started_at!), { addSuffix: true })
                            : "No recorded run"}
                        </td>
                        <td className="py-2 px-3 text-right text-muted-foreground">
                          {job.duration_ms != null ? `${job.duration_ms}ms` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-8 border-t border-border/30">
          <p className="text-xs text-muted-foreground">
            Quantivis Platform Status · Updated automatically
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            <Link to="/security" className="text-xs text-primary hover:underline">Security</Link>
            <Link to="/dashboard" className="text-xs text-primary hover:underline">Dashboard</Link>
            <Link to="/" className="text-xs text-primary hover:underline">Home</Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SystemStatus;
