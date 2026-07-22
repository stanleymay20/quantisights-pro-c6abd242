/**
 * AICIS Sync Dashboard (/aicis-sync)
 *
 * Operator surface for the AICIS Bridge v2 ingestion pipeline.
 * - Per-surface health (last status, freshness, totals, errors)
 * - Manual "Run Sync Now" (admins/owners only — server-enforced)
 * - Errors panel and latest-records preview
 * - Data quality findings (missing country/domain, dupes, drift)
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
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

const SURFACES = [
  "signals",
  "entities",
  "countries",
  "events",
  "predictions",
  "cross_border",
  "cross_domain",
  "recommendations",
  "outcomes",
  "entity_links",
] as const;

const STALE_HOURS = 24;

interface SurfaceStatus {
  surface: string;
  last_status: string | null;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
  total_records: number;
  records_available: number | null;
  consecutive_failures: number;
  schema_fingerprint: string | null;
  updated_at: string;
}

interface SyncRun {
  id: string;
  surface: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  records_pulled: number;
  records_inserted: number;
  records_updated: number;
  records_failed: number;
  pages_fetched: number;
  error_message: string | null;
}

interface SyncError {
  id: string;
  surface: string;
  error_code: string | null;
  error_message: string;
  http_status: number | null;
  occurred_at: string;
}

interface QualityCheck {
  id: string;
  surface: string;
  check_type: string;
  severity: string;
  passed: boolean;
  count_affected: number;
  details: any;
  checked_at: string;
}

interface IngestedRecord {
  id: string;
  surface: string;
  external_id: string;
  country_iso3: string | null;
  domain: string | null;
  payload: any;
  ingested_at: string;
}

// A surface stuck on repeated 401/403 responses will never recover on its
// own — retrying just burns the backoff schedule until someone rotates the
// credential. Showing "Failed" (implies the next retry might work) or
// "Idle" (implies nothing is scheduled) both misrepresent that. This
// requires several consecutive auth-shaped failures, not just one, so a
// single transient blip doesn't get mislabeled as a credential problem.
const CREDENTIAL_FAILURE_THRESHOLD = 3;
function isCredentialFailure(errorMessage: string | null | undefined, consecutiveFailures: number | undefined): boolean {
  if (!errorMessage || !consecutiveFailures || consecutiveFailures < CREDENTIAL_FAILURE_THRESHOLD) return false;
  return /HTTP 401|HTTP 403|Unauthorized|Forbidden|invalid.{0,20}(api.?key|credential|token)/i.test(errorMessage);
}

function statusBadge(
  status: string | null,
  freshness?: string | null,
  errorMessage?: string | null,
  consecutiveFailures?: number,
) {
  if (isCredentialFailure(errorMessage, consecutiveFailures)) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/50 text-amber-600 dark:text-amber-400">
        <ShieldOff className="h-3 w-3" />Paused — invalid credential
      </Badge>
    );
  }
  // Red: failed; Amber: stale; Green: success
  if (status === "failed")
    return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Failed</Badge>;
  if (status === "partial")
    return <Badge className="gap-1 bg-amber-500 hover:bg-amber-600"><AlertTriangle className="h-3 w-3" />Partial</Badge>;
  if (status === "running")
    return <Badge className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Running</Badge>;
  if (status === "success") {
    if (freshness && Date.now() - new Date(freshness).getTime() > STALE_HOURS * 3600 * 1000) {
      return <Badge className="gap-1 bg-amber-500 hover:bg-amber-600"><Clock className="h-3 w-3" />Stale</Badge>;
    }
    return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>;
  }
  return <Badge variant="secondary">Idle</Badge>;
}

export default function AicisSync() {
  const { currentOrg } = useOrganization();
  const organization = currentOrg;
  const role = currentOrg?.role;
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<SurfaceStatus[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [errors, setErrors] = useState<SyncError[]>([]);
  const [quality, setQuality] = useState<QualityCheck[]>([]);
  const [previewRecords, setPreviewRecords] = useState<IngestedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const isAdmin = role === "owner" || role === "admin";

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const orgId = organization.id;
    const [s, r, e, q, p] = await Promise.all([
      supabase
        .from("aicis_sync_surface_status")
        .select("*")
        .eq("organization_id", orgId),
      supabase
        .from("aicis_sync_runs")
        .select("*")
        .eq("organization_id", orgId)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("aicis_sync_errors")
        .select("*")
        .eq("organization_id", orgId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      supabase
        .from("aicis_data_quality_checks")
        .select("*")
        .eq("organization_id", orgId)
        .eq("passed", false)
        .order("checked_at", { ascending: false })
        .limit(50),
      supabase
        .from("aicis_ingested_records")
        .select("id, surface, external_id, country_iso3, domain, payload, ingested_at")
        .eq("organization_id", orgId)
        .order("ingested_at", { ascending: false })
        .limit(20),
    ]);
    setStatuses((s.data ?? []) as any);
    setRuns((r.data ?? []) as any);
    setErrors((e.data ?? []) as any);
    setQuality((q.data ?? []) as any);
    setPreviewRecords((p.data ?? []) as any);
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const triggerSync = async () => {
    if (!isAdmin) {
      toast({ title: "Permission denied", description: "Only owners and admins can trigger a sync.", variant: "destructive" });
      return;
    }
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-aicis-bridge", {
        body: { trigger_type: "manual" },
      });
      if (error) throw error;
      toast({
        title: "AICIS sync complete",
        description: `${data?.surfaces_succeeded ?? 0}/${data?.surfaces_attempted ?? 0} surfaces succeeded · ${data?.total_inserted ?? 0} new records.`,
      });
      await load();
    } catch (err: any) {
      toast({
        title: "Sync failed",
        description: err?.message ?? "Unable to reach AICIS bridge.",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const surfaceMap = useMemo(() => {
    const m = new Map<string, SurfaceStatus>();
    statuses.forEach((s) => m.set(s.surface, s));
    return m;
  }, [statuses]);

  const summary = useMemo(() => {
    let healthy = 0,
      stale = 0,
      failed = 0,
      idle = 0;
    SURFACES.forEach((surf) => {
      const s = surfaceMap.get(surf);
      if (!s || !s.last_status) idle++;
      else if (s.last_status === "failed") failed++;
      else if (
        s.last_success_at &&
        Date.now() - new Date(s.last_success_at).getTime() > STALE_HOURS * 3600 * 1000
      )
        stale++;
      else if (s.last_status === "success") healthy++;
    });
    const totalRecords = statuses.reduce((sum, s) => sum + (s.total_records ?? 0), 0);
    return { healthy, stale, failed, idle, totalRecords };
  }, [statuses, surfaceMap]);

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Database className="h-8 w-8 text-primary" />
            AICIS Sync
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Aggregated Country Intelligence Signals — live ingestion across all 10 AICIS Bridge v2 surfaces.
            All data is fetched server-side; the API key never reaches the browser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={triggerSync} disabled={syncing || !isAdmin} title={!isAdmin ? "Owners and admins only" : undefined}>
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run Sync Now
          </Button>
        </div>
      </div>

      {!isAdmin && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-3 text-sm">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Read-only view. Owners and admins can trigger sync runs.
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-emerald-600">{summary.healthy}</div><div className="text-xs text-muted-foreground">Healthy</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-600">{summary.stale}</div><div className="text-xs text-muted-foreground">Stale &gt; {STALE_HOURS}h</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-600">{summary.failed}</div><div className="text-xs text-muted-foreground">Failed</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-muted-foreground">{summary.idle}</div><div className="text-xs text-muted-foreground">Not yet synced</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{summary.totalRecords.toLocaleString()}</div><div className="text-xs text-muted-foreground">Total records</div></CardContent></Card>
      </div>

      {/* Surface table */}
      <Card>
        <CardHeader><CardTitle>Surface Health</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2">Surface</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 text-right">Synced</th>
                  <th className="px-4 py-2 text-right">Available</th>
                  <th className="px-4 py-2">Last success</th>
                  <th className="px-4 py-2">Failures</th>
                </tr>
              </thead>
              <tbody>
                {SURFACES.map((surf) => {
                  const s = surfaceMap.get(surf);
                  return (
                    <tr key={surf} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-2 font-mono text-xs">/{surf}</td>
                      <td className="px-4 py-2">{statusBadge(s?.last_status ?? null, s?.last_success_at, s?.last_error_message, s?.consecutive_failures)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{(s?.total_records ?? 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {s?.records_available != null ? s.records_available.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">
                        {s?.last_success_at ? formatDistanceToNow(new Date(s.last_success_at), { addSuffix: true }) : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {s?.consecutive_failures ? (
                          <Badge variant="destructive">{s.consecutive_failures}×</Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: Runs / Errors / Quality / Records */}
      <Tabs defaultValue="runs">
        <TabsList>
          <TabsTrigger value="runs">Recent Runs</TabsTrigger>
          <TabsTrigger value="errors">Errors ({errors.length})</TabsTrigger>
          <TabsTrigger value="quality">Data Quality ({quality.length})</TabsTrigger>
          <TabsTrigger value="records">Latest Records</TabsTrigger>
        </TabsList>

        <TabsContent value="runs">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/30 sticky top-0"><tr className="text-left">
                  <th className="px-4 py-2">Surface</th><th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Started</th><th className="px-4 py-2 text-right">Pulled</th>
                  <th className="px-4 py-2 text-right">Inserted</th><th className="px-4 py-2 text-right">Updated</th>
                  <th className="px-4 py-2 text-right">Pages</th><th className="px-4 py-2 text-right">Duration</th>
                </tr></thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-mono text-xs">/{r.surface}</td>
                      <td className="px-4 py-2">{statusBadge(r.status)}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.started_at), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.records_pulled}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-emerald-600">{r.records_inserted}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-600">{r.records_updated}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.pages_fetched}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {r.duration_ms ? `${r.duration_ms}ms` : "—"}
                      </td>
                    </tr>
                  ))}
                  {runs.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-muted-foreground py-8">No sync runs yet — click "Run Sync Now" above.</td></tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="errors">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {errors.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No errors recorded.</div>
              ) : (
                <ul className="divide-y">
                  {errors.map((e) => (
                    <li key={e.id} className="p-4 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="destructive">/{e.surface}</Badge>
                        {e.error_code && <Badge variant="outline">{e.error_code}</Badge>}
                        {e.http_status && <Badge variant="outline">HTTP {e.http_status}</Badge>}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(e.occurred_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground break-all">{e.error_message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="quality">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {quality.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No data quality issues detected.</div>
              ) : (
                <ul className="divide-y">
                  {quality.map((q) => (
                    <li key={q.id} className="p-4 space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">/{q.surface}</Badge>
                        <Badge className={q.severity === "error" ? "bg-red-600" : "bg-amber-500"}>
                          {q.check_type.replace(/_/g, " ")}
                        </Badge>
                        {q.count_affected > 0 && <span className="text-xs">{q.count_affected} affected</span>}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(q.checked_at), { addSuffix: true })}
                        </span>
                      </div>
                      {q.details && Object.keys(q.details).length > 0 && (
                        <pre className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-1 overflow-x-auto">
                          {JSON.stringify(q.details, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="records">
          <Card><CardContent className="p-0">
            <ScrollArea className="h-[400px]">
              {previewRecords.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No records ingested yet.</div>
              ) : (
                <ul className="divide-y">
                  {previewRecords.map((r) => (
                    <li key={r.id} className="p-4 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">/{r.surface}</Badge>
                        <span className="font-mono text-muted-foreground">{r.external_id}</span>
                        {r.country_iso3 && <Badge variant="secondary">{r.country_iso3}</Badge>}
                        {r.domain && <Badge variant="secondary">{r.domain}</Badge>}
                        <span className="text-muted-foreground ml-auto">
                          {formatDistanceToNow(new Date(r.ingested_at), { addSuffix: true })}
                        </span>
                      </div>
                      <pre className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-1 overflow-x-auto max-h-40">
                        {JSON.stringify(r.payload, null, 2).slice(0, 800)}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
