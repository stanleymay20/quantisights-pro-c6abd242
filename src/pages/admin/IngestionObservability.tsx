/**
 * Ingestion Observability Dashboard
 *
 * Operator-grade view of the unified ingestion pipeline:
 *  - Per-connector health (success rate, last run, P50/P95 duration)
 *  - Dataset freshness (when was each dataset last touched by a sync)
 *  - Recent lineage events (extract → validate → transform → aggregate)
 *  - Failed sync runs with drill-down to row-level errors
 *
 * Read-only — all writes happen via the admin Connectors page or scheduler.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  TrendingUp,
  Workflow,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ConnectorRow {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  health: string;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  dataset_id: string | null;
}

interface SyncRun {
  id: string;
  connector_id: string;
  dataset_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  rows_extracted: number;
  rows_valid: number;
  rows_invalid: number;
  rows_inserted: number;
  error_summary: string | null;
  triggered_by: string;
  current_stage: string | null;
}

interface DatasetFreshness {
  dataset_id: string;
  dataset_name: string;
  last_sync_at: string | null;
  last_status: string | null;
  connector_name: string | null;
  total_runs_30d: number;
  success_rate_30d: number;
}

interface LineageEvent {
  id: string;
  connector_id: string;
  event_type: string;
  records_count: number;
  created_at: string;
  details: Record<string, unknown>;
}

interface ConnectorStats {
  connector_id: string;
  connector_name: string;
  total_runs: number;
  successes: number;
  failures: number;
  partials: number;
  success_rate: number;
  p50_ms: number;
  p95_ms: number;
  last_success_at: string | null;
  last_failure_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  complete: "text-success",
  partial_success: "text-warning",
  failed: "text-destructive",
  running: "text-primary",
  queued: "text-muted-foreground",
};

const HEALTH_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  degraded: "secondary",
  failing: "destructive",
  unknown: "outline",
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

const IngestionObservability = () => {
  const { currentOrgId } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [lineage, setLineage] = useState<LineageEvent[]>([]);

  const load = async () => {
    if (!currentOrgId) return;
    setRefreshing(true);
    try {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [c, r, d, l] = await Promise.all([
        supabase
          .from("data_connectors")
          .select(
            "id,name,connector_type,status,health,last_success_at,last_error_at,last_error_message,consecutive_failures,dataset_id",
          )
          .eq("organization_id", currentOrgId)
          .order("created_at", { ascending: false }),
        supabase
          .from("connector_sync_runs")
          .select(
            "id,connector_id,dataset_id,status,started_at,completed_at,duration_ms,rows_extracted,rows_valid,rows_invalid,rows_inserted,error_summary,triggered_by,current_stage",
          )
          .eq("organization_id", currentOrgId)
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(500),
        supabase
          .from("datasets")
          .select("id,name")
          .eq("organization_id", currentOrgId),
        supabase
          .from("connector_lineage_events")
          .select("id,connector_id,event_type,records_count,created_at,details")
          .eq("organization_id", currentOrgId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (c.error) throw c.error;
      if (r.error) throw r.error;
      if (d.error) throw d.error;
      if (l.error) throw l.error;

      setConnectors((c.data ?? []) as ConnectorRow[]);
      setRuns((r.data ?? []) as SyncRun[]);
      setDatasets((d.data ?? []) as { id: string; name: string }[]);
      setLineage((l.data ?? []) as LineageEvent[]);
    } catch (err) {
      toast({
        title: "Failed to load observability data",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  // Compute per-connector stats from runs
  const connectorStats: ConnectorStats[] = useMemo(() => {
    return connectors.map((c) => {
      const cRuns = runs.filter((r) => r.connector_id === c.id);
      const successes = cRuns.filter((r) => r.status === "complete").length;
      const failures = cRuns.filter((r) => r.status === "failed").length;
      const partials = cRuns.filter((r) => r.status === "partial_success").length;
      const total = cRuns.length;
      const durations = cRuns
        .filter((r) => r.duration_ms != null)
        .map((r) => r.duration_ms as number);
      return {
        connector_id: c.id,
        connector_name: c.name,
        total_runs: total,
        successes,
        failures,
        partials,
        success_rate: total > 0 ? Math.round(((successes + partials) / total) * 100) : 0,
        p50_ms: percentile(durations, 50),
        p95_ms: percentile(durations, 95),
        last_success_at: c.last_success_at,
        last_failure_at: c.last_error_at,
      };
    });
  }, [connectors, runs]);

  // Dataset freshness rollup
  const datasetFreshness: DatasetFreshness[] = useMemo(() => {
    const datasetMap = new Map(datasets.map((d) => [d.id, d.name]));
    const connectorMap = new Map(connectors.map((c) => [c.id, c.name]));
    const byDataset = new Map<string, SyncRun[]>();
    for (const r of runs) {
      if (!r.dataset_id) continue;
      if (!byDataset.has(r.dataset_id)) byDataset.set(r.dataset_id, []);
      byDataset.get(r.dataset_id)!.push(r);
    }
    return Array.from(byDataset.entries()).map(([dsId, dsRuns]) => {
      dsRuns.sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at));
      const latest = dsRuns[0];
      const successes = dsRuns.filter(
        (r) => r.status === "complete" || r.status === "partial_success",
      ).length;
      return {
        dataset_id: dsId,
        dataset_name: datasetMap.get(dsId) ?? "Unknown dataset",
        last_sync_at: latest?.started_at ?? null,
        last_status: latest?.status ?? null,
        connector_name: connectorMap.get(latest?.connector_id ?? "") ?? null,
        total_runs_30d: dsRuns.length,
        success_rate_30d: dsRuns.length > 0 ? Math.round((successes / dsRuns.length) * 100) : 0,
      };
    });
  }, [datasets, runs, connectors]);

  // Aggregate KPIs
  const kpis = useMemo(() => {
    const total = runs.length;
    const successes = runs.filter(
      (r) => r.status === "complete" || r.status === "partial_success",
    ).length;
    const failures = runs.filter((r) => r.status === "failed").length;
    const allDurations = runs
      .filter((r) => r.duration_ms != null)
      .map((r) => r.duration_ms as number);
    const totalRowsInserted = runs.reduce((s, r) => s + (r.rows_inserted ?? 0), 0);
    return {
      total_runs: total,
      success_rate: total > 0 ? Math.round((successes / total) * 100) : 0,
      failures,
      p50_ms: percentile(allDurations, 50),
      p95_ms: percentile(allDurations, 95),
      total_rows_inserted: totalRowsInserted,
      active_connectors: connectors.filter((c) => c.status === "active").length,
    };
  }, [runs, connectors]);

  const failedRuns = useMemo(
    () => runs.filter((r) => r.status === "failed").slice(0, 20),
    [runs],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <Activity className="w-7 h-7 text-primary" />
            Ingestion Observability
          </h1>
          <p className="text-muted-foreground">
            Real-time view of connector health, dataset freshness, and pipeline performance over the
            last 30 days.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard
          icon={<Workflow className="w-4 h-4" />}
          label="Active connectors"
          value={kpis.active_connectors.toString()}
          sub={`${connectors.length} total`}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Success rate (30d)"
          value={`${kpis.success_rate}%`}
          sub={`${kpis.total_runs} runs`}
          accent={
            kpis.success_rate >= 95
              ? "text-success"
              : kpis.success_rate >= 80
                ? "text-warning"
                : "text-destructive"
          }
        />
        <KpiCard
          icon={<Clock className="w-4 h-4" />}
          label="P50 / P95 duration"
          value={`${formatDuration(kpis.p50_ms)} / ${formatDuration(kpis.p95_ms)}`}
          sub="across all runs"
        />
        <KpiCard
          icon={<Database className="w-4 h-4" />}
          label="Rows ingested (30d)"
          value={kpis.total_rows_inserted.toLocaleString()}
          sub={`${kpis.failures} failed runs`}
        />
      </div>

      <Tabs defaultValue="connectors" className="space-y-4">
        <TabsList>
          <TabsTrigger value="connectors">Connector health</TabsTrigger>
          <TabsTrigger value="freshness">Dataset freshness</TabsTrigger>
          <TabsTrigger value="failures">Recent failures</TabsTrigger>
          <TabsTrigger value="lineage">Lineage stream</TabsTrigger>
        </TabsList>

        {/* CONNECTOR HEALTH */}
        <TabsContent value="connectors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Connector performance</CardTitle>
            </CardHeader>
            <CardContent>
              {connectorStats.length === 0 ? (
                <EmptyState message="No connectors configured yet." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-xs uppercase text-muted-foreground">
                        <th className="py-2 pr-4">Connector</th>
                        <th className="py-2 pr-4">Health</th>
                        <th className="py-2 pr-4 text-right">Runs (30d)</th>
                        <th className="py-2 pr-4 text-right">Success rate</th>
                        <th className="py-2 pr-4 text-right">P50</th>
                        <th className="py-2 pr-4 text-right">P95</th>
                        <th className="py-2 pr-4">Last success</th>
                        <th className="py-2">Last failure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connectorStats.map((s) => {
                        const c = connectors.find((x) => x.id === s.connector_id);
                        return (
                          <tr key={s.connector_id} className="border-b border-border/20">
                            <td className="py-2 pr-4">
                              <div className="font-medium">{s.connector_name}</div>
                              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">
                                {c?.connector_type}
                              </div>
                            </td>
                            <td className="py-2 pr-4">
                              <Badge variant={HEALTH_BADGE[c?.health ?? "unknown"]} className="text-[10px]">
                                {c?.health ?? "unknown"}
                              </Badge>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums">{s.total_runs}</td>
                            <td className="py-2 pr-4 text-right tabular-nums">
                              <span
                                className={
                                  s.success_rate >= 95
                                    ? "text-success"
                                    : s.success_rate >= 80
                                      ? "text-warning"
                                      : "text-destructive"
                                }
                              >
                                {s.total_runs > 0 ? `${s.success_rate}%` : "—"}
                              </span>
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                              {formatDuration(s.p50_ms)}
                            </td>
                            <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                              {formatDuration(s.p95_ms)}
                            </td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground">
                              {s.last_success_at
                                ? formatDistanceToNow(new Date(s.last_success_at), {
                                    addSuffix: true,
                                  })
                                : "—"}
                            </td>
                            <td className="py-2 text-xs text-muted-foreground">
                              {s.last_failure_at
                                ? formatDistanceToNow(new Date(s.last_failure_at), {
                                    addSuffix: true,
                                  })
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* DATASET FRESHNESS */}
        <TabsContent value="freshness">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dataset freshness</CardTitle>
            </CardHeader>
            <CardContent>
              {datasetFreshness.length === 0 ? (
                <EmptyState message="No datasets have been touched by the unified pipeline yet." />
              ) : (
                <div className="grid gap-3">
                  {datasetFreshness.map((d) => {
                    const ageHrs = d.last_sync_at
                      ? (Date.now() - +new Date(d.last_sync_at)) / 3_600_000
                      : Infinity;
                    const fresh = ageHrs < 24;
                    const stale = ageHrs >= 24 && ageHrs < 72;
                    return (
                      <div
                        key={d.dataset_id}
                        className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border/30 bg-muted/20"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{d.dataset_name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            via {d.connector_name ?? "unknown connector"} · {d.total_runs_30d} runs
                            (30d) · {d.success_rate_30d}% success
                          </div>
                        </div>
                        <div className="text-right">
                          <Badge
                            variant={fresh ? "default" : stale ? "secondary" : "destructive"}
                            className="text-[10px] mb-1"
                          >
                            {fresh ? "fresh" : stale ? "stale" : "very stale"}
                          </Badge>
                          <div className="text-xs text-muted-foreground">
                            {d.last_sync_at
                              ? formatDistanceToNow(new Date(d.last_sync_at), { addSuffix: true })
                              : "never"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* RECENT FAILURES */}
        <TabsContent value="failures">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Recent failed runs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {failedRuns.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <CheckCircle2 className="w-10 h-10 text-success mb-3" />
                  <p className="text-sm font-medium">No failed runs in the last 30 days</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All ingestion jobs completed successfully or partially.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="space-y-2">
                    {failedRuns.map((r) => {
                      const c = connectors.find((x) => x.id === r.connector_id);
                      return (
                        <div
                          key={r.id}
                          className="p-3 rounded-lg border border-destructive/30 bg-destructive/5"
                        >
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <div>
                              <div className="text-sm font-medium flex items-center gap-2">
                                <XCircle className="w-3.5 h-3.5 text-destructive" />
                                {c?.name ?? "Unknown connector"}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                {format(new Date(r.started_at), "PPp")} · stage:{" "}
                                {r.current_stage ?? "unknown"} · trigger: {r.triggered_by}
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {formatDuration(r.duration_ms)}
                            </span>
                          </div>
                          {r.error_summary && (
                            <p className="text-xs text-destructive/90 mt-2 font-mono break-all">
                              {r.error_summary.slice(0, 240)}
                              {r.error_summary.length > 240 ? "…" : ""}
                            </p>
                          )}
                          <div className="text-[10px] text-muted-foreground mt-2 flex gap-3">
                            <span>extracted: {r.rows_extracted}</span>
                            <span>valid: {r.rows_valid}</span>
                            <span>invalid: {r.rows_invalid}</span>
                            <span>inserted: {r.rows_inserted}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* LINEAGE STREAM */}
        <TabsContent value="lineage">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent lineage events</CardTitle>
            </CardHeader>
            <CardContent>
              {lineage.length === 0 ? (
                <EmptyState message="No lineage events captured yet." />
              ) : (
                <ScrollArea className="h-[420px]">
                  <div className="space-y-1.5">
                    {lineage.map((e) => {
                      const c = connectors.find((x) => x.id === e.connector_id);
                      return (
                        <div
                          key={e.id}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-border/20 text-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Badge variant="outline" className="text-[10px] uppercase">
                              {e.event_type}
                            </Badge>
                            <span className="truncate">{c?.name ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                            <span>{e.records_count} rec</span>
                            <span>
                              {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const KpiCard = ({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider mb-2">
        {icon}
        {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${accent ?? ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>}
    </CardContent>
  </Card>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center py-10 text-center">
    <Database className="w-10 h-10 text-muted-foreground/40 mb-3" />
    <p className="text-sm text-muted-foreground">{message}</p>
  </div>
);

export default IngestionObservability;
