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
  Activity, AlertTriangle, CheckCircle2, Clock, Database,
  RefreshCw, XCircle, Zap, TrendingUp, Shield,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const STATUS_COLORS: Record<string, string> = {
  completed: "text-success",
  running: "text-primary",
  failed: "text-destructive",
  pending: "text-muted-foreground",
};

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  completed: "default",
  running: "secondary",
  failed: "destructive",
  pending: "outline",
};

export default function PipelineObservability() {
  const { currentOrgId: organizationId } = useOrganization();
  const { activeDatasetId } = useProject();
  const [syncJobs, setSyncJobs] = useState<any[]>([]);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [qualityChecks, setQualityChecks] = useState<any[]>([]);
  const [aicisSurfaces, setAicisSurfaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    loadData();
  }, [organizationId, activeDatasetId]);

  const loadData = async () => {
    if (!organizationId) return;
    setLoading(true);

    // Build queries with optional dataset filter
    let jobsQuery = supabase.from("data_sync_jobs")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(100);

    let qualityQuery = supabase.from("data_quality_checks")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (activeDatasetId) {
      qualityQuery = qualityQuery.eq("dataset_id", activeDatasetId);
    }

    const [jobsRes, sourcesRes, qualityRes, aicisRes] = await Promise.all([
      jobsQuery,
      supabase.from("data_sources")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      qualityQuery,
      // AICIS Bridge syncs are tracked in aicis_sync_surface_status, not
      // data_sync_jobs -- without this, a surface-level outage (e.g. one
      // surface's circuit breaker open after repeated failures) was
      // completely invisible here, and the empty data_sync_jobs result for
      // that integration made successRate default to a false 100%.
      supabase.from("aicis_sync_surface_status")
        .select("surface, consecutive_failures, circuit_breaker_until, last_status")
        .eq("organization_id", organizationId),
    ]);

    setSyncJobs(jobsRes.data || []);
    setDataSources(sourcesRes.data || []);
    setQualityChecks(qualityRes.data || []);
    setAicisSurfaces(aicisRes.data || []);
    setLoading(false);
  };

  // Compute metrics
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentJobs = syncJobs.filter(j => new Date(j.created_at) > last24h);
  const completedJobs = recentJobs.filter(j => j.status === "completed");
  const failedJobs = recentJobs.filter(j => j.status === "failed");
  const totalRecords = completedJobs.reduce((s, j) => s + (j.records_synced || 0), 0);
  const avgLatency = completedJobs.length > 0
    ? Math.round(completedJobs.reduce((s, j) => {
        const start = new Date(j.started_at || j.created_at).getTime();
        const end = new Date(j.completed_at || j.created_at).getTime();
        return s + (end - start);
      }, 0) / completedJobs.length / 1000)
    : 0;

  // A surface counts as degraded once its circuit breaker is open (same
  // threshold Bridge Health uses) -- a stale cooldown timer with a high
  // consecutive-failure count still means the breaker is effectively
  // tripped, so check both.
  const now = Date.now();
  const degradedAicisSurfaces = aicisSurfaces.filter(s =>
    (s.circuit_breaker_until && new Date(s.circuit_breaker_until).getTime() > now) ||
    (s.consecutive_failures ?? 0) >= 3
  );
  const healthyAicisSurfaces = aicisSurfaces.length - degradedAicisSurfaces.length;

  const totalFailures = failedJobs.length + degradedAicisSurfaces.length;
  const totalAttempts = recentJobs.length + aicisSurfaces.length;
  const successRate = totalAttempts > 0
    ? Math.round(((completedJobs.length + healthyAicisSurfaces) / totalAttempts) * 100)
    : 100;

  const healthStatus = totalFailures === 0 ? "healthy" : totalFailures < 3 ? "degraded" : "critical";
  const healthColor = healthStatus === "healthy" ? "text-green-500" : healthStatus === "degraded" ? "text-yellow-500" : "text-destructive";

  // Charts data
  const hourlyData = Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(Date.now() - (23 - i) * 60 * 60 * 1000);
    const hourJobs = syncJobs.filter(j => {
      const jDate = new Date(j.created_at);
      return jDate.getHours() === hour.getHours() && jDate.toDateString() === hour.toDateString();
    });
    return {
      hour: format(hour, "HH:mm"),
      completed: hourJobs.filter(j => j.status === "completed").length,
      failed: hourJobs.filter(j => j.status === "failed").length,
      records: hourJobs.reduce((s, j) => s + (j.records_synced || 0), 0),
    };
  });

  const sourceTypeData = dataSources.reduce((acc: Array<{ name: string; count: number }>, ds) => {
    const existing = acc.find(a => a.name === ds.source_type);
    if (existing) existing.count++;
    else acc.push({ name: ds.source_type, count: 1 });
    return acc;
  }, []);

  const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#22c55e", "#f59e0b"];

  return (
    <SectionErrorBoundary sectionName="Pipeline Observability">
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Pipeline Observability</h1>
          <p className="text-muted-foreground">Real-time monitoring of data ingestion, sync health, and quality.</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className={`h-8 w-8 ${healthColor}`} />
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
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-sm text-muted-foreground">Success Rate (24h)</p>
                <p className="text-xl font-bold">{successRate}%</p>
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
                <p className="text-xl font-bold">{totalRecords.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Latency</p>
                <p className="text-xl font-bold">{avgLatency}s</p>
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
                <p className="text-xl font-bold">{totalFailures}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {degradedAicisSurfaces.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/[0.03]">
          <CardContent className="pt-6 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm">
                {degradedAicisSurfaces.length} AICIS Bridge surface{degradedAicisSurfaces.length > 1 ? "s" : ""}
                {" "}({degradedAicisSurfaces.map(s => s.surface).join(", ")}) {degradedAicisSurfaces.length > 1 ? "have" : "has"} an open circuit breaker.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/bridge-health">View Bridge Health</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Sync Jobs</TabsTrigger>
          <TabsTrigger value="throughput">Throughput</TabsTrigger>
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="quality">Quality Checks</TabsTrigger>
        </TabsList>

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
                      ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
                      : null;
                    return (
                      <TableRow key={job.id}>
                        <TableCell>
                          <Badge variant={STATUS_BADGE[job.status] || "outline"}>
                            {job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{job.data_source_id?.slice(0, 8)}...</TableCell>
                        <TableCell>{job.records_synced?.toLocaleString() || "—"}</TableCell>
                        <TableCell>{duration !== null ? `${duration}s` : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {job.created_at ? formatDistanceToNow(new Date(job.created_at), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                          {job.error_message || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {syncJobs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No sync jobs found. Connect a data source to get started.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="throughput">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Throughput (24h)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="completed" fill="hsl(var(--primary))" name="Completed" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="failed" fill="hsl(var(--destructive))" name="Failed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Records Ingested Per Hour</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="hour" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  />
                  <Line type="monotone" dataKey="records" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sources">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Connected Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Synced</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSources.map(ds => (
                      <TableRow key={ds.id}>
                        <TableCell className="font-medium">{ds.name}</TableCell>
                        <TableCell><Badge variant="outline">{ds.source_type}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={ds.status === "active" ? "default" : "destructive"}>{ds.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {ds.last_synced_at ? formatDistanceToNow(new Date(ds.last_synced_at), { addSuffix: true }) : "Never"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {dataSources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No data sources configured
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Source Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {sourceTypeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sourceTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                        {sourceTypeData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">No sources</div>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Failed</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qualityChecks.map(qc => (
                    <TableRow key={qc.id}>
                      <TableCell>
                        <Badge variant="outline">{qc.check_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={qc.status === "completed" ? "default" : qc.status === "warning" ? "secondary" : "destructive"}>
                          {qc.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={qc.score || 0} className="w-16 h-2" />
                          <span className="text-sm font-medium">{qc.score || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{qc.records_checked?.toLocaleString() || "—"}</TableCell>
                      <TableCell className={qc.records_failed > 0 ? "text-destructive" : ""}>
                        {qc.records_failed?.toLocaleString() || "0"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(qc.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {qualityChecks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No quality checks yet. Upload data or connect a source.
                      </TableCell>
                    </TableRow>
                  )}
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
