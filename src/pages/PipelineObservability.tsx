import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import {
  AlertTriangle, CheckCircle2, Clock, Database,
  RefreshCw, Shield, HelpCircle,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  partial_success: "secondary",
  failed: "destructive",
  pending: "outline",
};

export default function PipelineObservability() {
  const { currentOrgId: organizationId } = useOrganization();
  const { activeDatasetId } = useProject();
  const [syncJobs, setSyncJobs] = useState<any[]>([]);
  const [pipelineRuns, setPipelineRuns] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [qualityChecks, setQualityChecks] = useState<any[]>([]);
  const [aicisSurfaces, setAicisSurfaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      setSyncJobs([]);
      setPipelineRuns([]);
      setDataSources([]);
      setQualityChecks([]);
      setAicisSurfaces([]);
      setLoadError(null);
      setEvidenceReady(false);
      setLoading(false);
      return;
    }
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, activeDatasetId]);

  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);
    setLoadError(null);
    setEvidenceReady(false);

    const jobsQuery = supabase.from("data_sync_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);

    let pipelineQuery = supabase.from("pipeline_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("started_at", { ascending: false })
      .limit(100);

    let qualityQuery = supabase.from("data_quality_checks")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (activeDatasetId) {
      pipelineQuery = pipelineQuery.eq("dataset_id", activeDatasetId);
      qualityQuery = qualityQuery.eq("dataset_id", activeDatasetId);
    }

    const [jobsRes, pipelineRes, sourcesRes, qualityRes, aicisRes] = await Promise.all([
      jobsQuery,
      pipelineQuery,
      supabase.from("data_sources")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      qualityQuery,
      supabase.from("aicis_sync_surface_status")
        .select("surface, consecutive_failures, circuit_breaker_until, last_status")
        .eq("organization_id", organizationId),
    ]);

    const failures = [
      ["sync jobs", jobsRes.error],
      ["pipeline runs", pipelineRes.error],
      ["data sources", sourcesRes.error],
      ["quality checks", qualityRes.error],
      ["AICIS bridge status", aicisRes.error],
    ].filter(([, error]) => Boolean(error)) as Array<[string, { message?: string }]>;

    setSyncJobs(jobsRes.data || []);
    setPipelineRuns(pipelineRes.data || []);
    setDataSources(sourcesRes.data || []);
    setQualityChecks(qualityRes.data || []);
    setAicisSurfaces(aicisRes.data || []);

    if (failures.length > 0) {
      setLoadError(`Unable to verify ${failures.map(([name]) => name).join(", ")}. Health and success claims are withheld until observability evidence is complete.`);
      setEvidenceReady(false);
    } else {
      setEvidenceReady(true);
    }
    setLoading(false);
  };

  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentJobs = syncJobs.filter(job => new Date(job.created_at) > last24h);
  const recentRuns = pipelineRuns.filter(run => new Date(run.started_at || run.created_at) > last24h);

  const completedJobs = recentJobs.filter(job => job.status === "completed");
  const failedJobs = recentJobs.filter(job => job.status === "failed");
  const completedRuns = recentRuns.filter(run => run.status === "completed");
  const partialRuns = recentRuns.filter(run => run.status === "partial_success");
  const failedRuns = recentRuns.filter(run => run.status === "failed");

  const totalRecords = completedJobs.reduce((sum, job) => sum + (job.records_synced || 0), 0);
  const avgLatency = completedJobs.length > 0
    ? Math.round(completedJobs.reduce((sum, job) => {
        const start = new Date(job.started_at || job.created_at).getTime();
        const end = new Date(job.completed_at || job.created_at).getTime();
        return sum + Math.max(0, end - start);
      }, 0) / completedJobs.length / 1000)
    : null;

  const now = Date.now();
  const degradedAicisSurfaces = aicisSurfaces.filter(surface =>
    (surface.circuit_breaker_until && new Date(surface.circuit_breaker_until).getTime() > now) ||
    (surface.consecutive_failures ?? 0) >= 3 ||
    ["failed", "error", "degraded"].includes(String(surface.last_status || "").toLowerCase())
  );

  const totalFailures = failedJobs.length + failedRuns.length + degradedAicisSurfaces.length;
  const totalAttempts = recentJobs.length + recentRuns.length;
  const verifiedSuccesses = completedJobs.length + completedRuns.length;
  const successRate = evidenceReady && totalAttempts > 0
    ? Math.round((verifiedSuccesses / totalAttempts) * 100)
    : null;

  const healthStatus = !evidenceReady || totalAttempts === 0
    ? "unknown"
    : totalFailures >= 3
      ? "critical"
      : totalFailures > 0 || partialRuns.length > 0
        ? "degraded"
        : "healthy";

  const healthColor = healthStatus === "healthy"
    ? "text-green-500"
    : healthStatus === "degraded"
      ? "text-yellow-500"
      : healthStatus === "critical"
        ? "text-destructive"
        : "text-muted-foreground";

  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(Date.now() - (23 - i) * 60 * 60 * 1000);
    const hourJobs = syncJobs.filter(job => {
      const jobDate = new Date(job.created_at);
      return jobDate.getHours() === hour.getHours() && jobDate.toDateString() === hour.toDateString();
    });
    const hourRuns = pipelineRuns.filter(run => {
      const runDate = new Date(run.started_at || run.created_at);
      return runDate.getHours() === hour.getHours() && runDate.toDateString() === hour.toDateString();
    });
    return {
      hour: format(hour, "HH:mm"),
      completed: hourJobs.filter(job => job.status === "completed").length + hourRuns.filter(run => run.status === "completed").length,
      partial: hourRuns.filter(run => run.status === "partial_success").length,
      failed: hourJobs.filter(job => job.status === "failed").length + hourRuns.filter(run => run.status === "failed").length,
      records: hourJobs.reduce((sum, job) => sum + (job.records_synced || 0), 0),
    };
  });

  const sourceTypeData = dataSources.reduce((acc: Array<{ name: string; count: number }>, source) => {
    const existing = acc.find(item => item.name === source.source_type);
    if (existing) existing.count += 1;
    else acc.push({ name: source.source_type, count: 1 });
    return acc;
  }, []);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#22c55e", "#f59e0b"];

  return (
    <SectionErrorBoundary sectionName="Pipeline Observability">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Pipeline Observability</h1>
            <p className="text-muted-foreground">Evidence-backed monitoring of ingestion, transformation, intelligence stages, sync health, and quality.</p>
          </div>
          <Button onClick={() => void loadData()} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {loadError && (
          <Card className="border-destructive/30 bg-destructive/[0.03]">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Observability evidence unavailable</p>
                <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                {healthStatus === "unknown" ? <HelpCircle className={`h-8 w-8 ${healthColor}`} /> : <Shield className={`h-8 w-8 ${healthColor}`} />}
                <div>
                  <p className="text-sm text-muted-foreground">Pipeline Health</p>
                  <p className={`text-xl font-bold capitalize ${healthColor}`}>{healthStatus}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className={`h-8 w-8 ${successRate === null ? "text-muted-foreground" : "text-green-500"}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Verified Success (24h)</p>
                  <p className="text-xl font-bold">{successRate === null ? "—" : `${successRate}%`}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-8 w-8 ${partialRuns.length > 0 ? "text-yellow-500" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Partial Runs (24h)</p>
                  <p className="text-xl font-bold">{evidenceReady ? partialRuns.length : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Database className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Records Synced (24h)</p>
                  <p className="text-xl font-bold">{evidenceReady ? totalRecords.toLocaleString() : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Avg Sync Latency</p>
                  <p className="text-xl font-bold">{evidenceReady && avgLatency !== null ? `${avgLatency}s` : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-8 w-8 ${totalFailures > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm text-muted-foreground">Failures</p>
                  <p className="text-xl font-bold">{evidenceReady ? totalFailures : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {evidenceReady && totalAttempts === 0 && (
          <Card className="border-border bg-muted/20">
            <CardContent className="pt-6 flex items-start gap-3">
              <HelpCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">No 24-hour execution evidence</p>
                <p className="text-sm text-muted-foreground mt-1">No recent sync jobs or pipeline runs were observed, so Quantivis is withholding a health or success-rate claim rather than treating inactivity as 100% success.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {degradedAicisSurfaces.length > 0 && (
          <Card className="border-destructive/30 bg-destructive/[0.03]">
            <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                <p className="text-sm">
                  {degradedAicisSurfaces.length} AICIS Bridge surface{degradedAicisSurfaces.length > 1 ? "s" : ""} ({degradedAicisSurfaces.map(surface => surface.surface).join(", ")}) {degradedAicisSurfaces.length > 1 ? "are" : "is"} degraded.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/bridge-health">View Bridge Health</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="runs">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="runs">Pipeline Runs</TabsTrigger>
            <TabsTrigger value="jobs">Sync Jobs</TabsTrigger>
            <TabsTrigger value="throughput">Throughput</TabsTrigger>
            <TabsTrigger value="sources">Data Sources</TabsTrigger>
            <TabsTrigger value="quality">Quality Checks</TabsTrigger>
          </TabsList>

          <TabsContent value="runs">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline Runs</CardTitle>
                <CardDescription>Raw → clean → analytical/intelligence outcomes. Partial success is never rendered as complete.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Raw</TableHead>
                      <TableHead>Clean</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Started</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pipelineRuns.slice(0, 25).map(run => (
                      <TableRow key={run.id}>
                        <TableCell><Badge variant={STATUS_BADGE[run.status] || "outline"}>{String(run.status).replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{String(run.stage || "unknown").replace(/_/g, " ")}</TableCell>
                        <TableCell>{run.raw_count?.toLocaleString?.() ?? "—"}</TableCell>
                        <TableCell>{run.transformed_count?.toLocaleString?.() ?? "—"}</TableCell>
                        <TableCell className={Number(run.error_count || 0) > 0 ? "text-destructive" : "text-muted-foreground"}>{run.error_count ?? 0}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{run.started_at ? formatDistanceToNow(new Date(run.started_at), { addSuffix: true }) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {evidenceReady && pipelineRuns.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No pipeline runs recorded.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs">
            <Card>
              <CardHeader>
                <CardTitle>Recent Sync Jobs</CardTitle>
                <CardDescription>Last 100 data synchronization jobs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncJobs.slice(0, 25).map(job => {
                      const duration = job.started_at && job.completed_at
                        ? Math.max(0, Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000))
                        : null;
                      return (
                        <TableRow key={job.id}>
                          <TableCell><Badge variant={STATUS_BADGE[job.status] || "outline"}>{job.status}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{job.data_source_id ? `${job.data_source_id.slice(0, 8)}...` : "—"}</TableCell>
                          <TableCell>{job.records_synced?.toLocaleString?.() ?? "—"}</TableCell>
                          <TableCell>{duration !== null ? `${duration}s` : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{job.created_at ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true }) : "—"}</TableCell>
                          <TableCell className="text-xs text-destructive max-w-[200px] truncate">{job.error_message || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                    {evidenceReady && syncJobs.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No sync jobs recorded.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="throughput">
            <Card>
              <CardHeader><CardTitle>Execution Outcomes by Hour (24h)</CardTitle></CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="hour" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} labelStyle={{ color: "hsl(var(--foreground))" }} />
                    <Bar dataKey="completed" fill="hsl(var(--primary))" name="Completed" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="partial" fill="hsl(var(--warning))" name="Partial" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="mt-4">
              <CardHeader><CardTitle>Records Synced Per Hour</CardTitle></CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="hour" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Line type="monotone" dataKey="records" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Connected Sources</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Last Synced</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {dataSources.map(source => (
                        <TableRow key={source.id}>
                          <TableCell className="font-medium">{source.name}</TableCell>
                          <TableCell><Badge variant="outline">{source.source_type}</Badge></TableCell>
                          <TableCell><Badge variant={source.status === "active" ? "default" : "destructive"}>{source.status}</Badge></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{source.last_synced_at ? formatDistanceToNow(new Date(source.last_synced_at), { addSuffix: true }) : "Never"}</TableCell>
                        </TableRow>
                      ))}
                      {evidenceReady && dataSources.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No data sources configured.</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Source Distribution</CardTitle></CardHeader>
                <CardContent className="h-[300px]">
                  {sourceTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={sourceTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                          {sourceTypeData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">{evidenceReady ? "No sources" : "Source evidence unavailable"}</div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quality">
            <Card>
              <CardHeader>
                <CardTitle>Data Quality Checks</CardTitle>
                <CardDescription>Automated quality assessments from profiling, schema validation, and dbt syncs</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Score</TableHead><TableHead>Records</TableHead><TableHead>Failed</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {qualityChecks.map(check => (
                      <TableRow key={check.id}>
                        <TableCell><Badge variant="outline">{check.check_type}</Badge></TableCell>
                        <TableCell><Badge variant={check.status === "completed" ? "default" : check.status === "warning" ? "secondary" : "destructive"}>{check.status}</Badge></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={typeof check.score === "number" ? check.score : 0} className="w-16 h-2" />
                            <span className="text-sm font-medium">{typeof check.score === "number" ? `${check.score}%` : "—"}</span>
                          </div>
                        </TableCell>
                        <TableCell>{check.records_checked?.toLocaleString?.() ?? "—"}</TableCell>
                        <TableCell className={Number(check.records_failed || 0) > 0 ? "text-destructive" : ""}>{check.records_failed?.toLocaleString?.() ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{check.created_at ? formatDistanceToNow(new Date(check.created_at), { addSuffix: true }) : "—"}</TableCell>
                      </TableRow>
                    ))}
                    {evidenceReady && qualityChecks.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No quality checks recorded.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SectionErrorBoundary>
  );
}
