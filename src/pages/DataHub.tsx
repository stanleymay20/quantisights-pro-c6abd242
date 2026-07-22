/**
 * Data Hub — Reference Intelligence Command Center
 *
 * Enterprise hardening note:
 * This page must never trap onboarding users in an infinite spinner. It now
 * handles missing organization context, slow Supabase responses, table/RLS
 * errors, and empty first-run accounts with clear recovery actions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Globe2,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ReferenceRow {
  id: string;
  category: string | null;
  metric_name: string;
  value: number | null;
  unit: string | null;
  region: string | null;
  industry: string | null;
  period_start: string | null;
  source: string | null;
  confidence_grade: string | null;
  metadata: Record<string, unknown> | null;
  updated_at: string | null;
}

interface VendorSource {
  id: string;
  vendor_key: string;
  vendor_name: string;
  category: string | null;
  is_active: boolean;
  last_refreshed_at: string | null;
  next_refresh_at: string | null;
  refresh_interval_hours: number | null;
  trust_level: number | null;
  last_error: string | null;
  license_type: string | null;
}

interface SyncRun {
  id: string;
  vendor_key: string;
  trigger: string | null;
  status: string | null;
  rows_fetched: number | null;
  rows_upserted: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
}

const LOAD_TIMEOUT_MS = 9000;

const num = (value: unknown, digits = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : "—";
};

const fmtAge = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
};

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "PPp");
};

const getProvider = (row: ReferenceRow) => {
  const metaProvider = row.metadata?.source_provider;
  return typeof metaProvider === "string" && metaProvider ? metaProvider : row.source || "unknown";
};

const getDomain = (row: ReferenceRow) => {
  const metaDomain = row.metadata?.domain;
  if (typeof metaDomain === "string" && metaDomain) return metaDomain;
  const parts = row.metric_name?.split(".") ?? [];
  return parts.length >= 3 ? parts[1] : row.category || "general";
};

export default function DataHub() {
  const { toast } = useToast();
  const { currentOrgId, loading: orgLoading } = useOrganization();

  const [loading, setLoading] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReferenceRow[]>([]);
  const [sources, setSources] = useState<VendorSource[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTimedOut(false);
    setError(null);

    if (!currentOrgId) {
      setLoading(false);
      setRows([]);
      setSources([]);
      setRuns([]);
      return;
    }

    setLoading(true);
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    try {
      timeoutId = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);

      const [refRes, srcRes, runRes] = await Promise.all([
        supabase
          .from("internal_reference_data")
          .select("id, category, metric_name, value, unit, region, industry, period_start, source, confidence_grade, metadata, updated_at")
          .eq("organization_id", currentOrgId)
          .order("updated_at", { ascending: false })
          .limit(500),
        supabase
          .from("external_data_sources")
          .select("id, vendor_key, vendor_name, category, is_active, last_refreshed_at, next_refresh_at, refresh_interval_hours, trust_level, last_error, license_type")
          .eq("organization_id", currentOrgId)
          .order("vendor_key"),
        supabase
          .from("external_sync_runs")
          .select("id, vendor_key, trigger, status, rows_fetched, rows_upserted, error_message, started_at, completed_at, duration_ms")
          .eq("organization_id", currentOrgId)
          .order("started_at", { ascending: false })
          .limit(50),
      ]);

      if (refRes.error) throw refRes.error;
      if (srcRes.error) throw srcRes.error;
      if (runRes.error) console.warn("Data Hub sync run history unavailable", runRes.error);

      setRows((refRes.data ?? []) as ReferenceRow[]);
      setSources((srcRes.data ?? []) as VendorSource[]);
      setRuns((runRes.data ?? []) as SyncRun[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast({ title: "Failed to load Data Hub", description: message, variant: "destructive" });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [currentOrgId, toast]);

  useEffect(() => {
    if (!orgLoading) void load();
  }, [orgLoading, load]);

  const triggerSync = async (sourceId: string, vendorName: string) => {
    setSyncing(sourceId);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("ingest-external-signals", {
        body: { mode: "manual", source_id: sourceId },
      });
      if (fnError) throw fnError;
      toast({ title: "Sync started", description: `${vendorName}: ${data?.rows_ingested ?? data?.message ?? "Refresh dispatched"}` });
      setTimeout(() => void load(), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  };

  const overview = useMemo(() => {
    const countries = new Set(rows.map((r) => r.region).filter(Boolean)).size;
    const domains = new Set(rows.map(getDomain).filter(Boolean)).size;
    const providers = new Set(rows.map(getProvider).filter(Boolean)).size;
    const activeSources = sources.filter((s) => s.is_active).length;
    const lastSync = sources.map((s) => s.last_refreshed_at).filter(Boolean).sort().reverse()[0] as string | undefined;
    return { countries, domains, providers, activeSources, lastSync };
  }, [rows, sources]);

  const providerBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(getProvider(row), (map.get(getProvider(row)) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const showInitialLoading = orgLoading || (loading && rows.length === 0 && !timedOut);

  if (showInitialLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Card role="status" aria-live="polite">
          <CardContent className="p-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading Data Hub…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentOrgId) {
    return (
      <DataHubShell onReload={load} loading={loading}>
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="No organization selected"
          description="Select or create an organization before viewing reference intelligence sources."
        />
      </DataHubShell>
    );
  }

  if (timedOut && rows.length === 0 && sources.length === 0) {
    return (
      <DataHubShell onReload={load} loading={loading}>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold">Data Hub is taking longer than expected</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  The reference intelligence query did not finish quickly. This can happen on first-run accounts, missing reference tables, or temporary network delay.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${loading ? "animate-spin" : ""}`} />
              Retry Data Hub load
            </Button>
          </CardContent>
        </Card>
      </DataHubShell>
    );
  }

  return (
    <DataHubShell onReload={load} loading={loading}>
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
            <div>
              <div className="font-medium">Data Hub loaded with an issue</div>
              <div className="text-muted-foreground">{error}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<Database className="h-4 w-4" />} label="Reference signals" value={num(rows.length)} hint="Loaded from internal_reference_data" />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Active sources" value={`${overview.activeSources} / ${sources.length}`} hint="Vendor connections" />
        <KpiCard icon={<Globe2 className="h-4 w-4" />} label="Countries covered" value={num(overview.countries)} hint="ISO3 regions" />
        <KpiCard icon={<Layers className="h-4 w-4" />} label="Domains covered" value={num(overview.domains)} hint="Reference categories" />
      </div>

      {rows.length === 0 && sources.length === 0 ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="No reference intelligence configured yet"
          description="Data Hub is ready, but this organization has no external reference sources or ingested signals yet. Configure vendors in Admin → Data Vendors or continue with uploaded client data."
        />
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="signals">Signals</TabsTrigger>
            <TabsTrigger value="sources">Sources</TabsTrigger>
            <TabsTrigger value="sync">Sync History</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What lives here</CardTitle>
                <CardDescription>
                  Data Hub holds external reference intelligence used to enrich and benchmark decisions. Client truth remains under Data Sources and Dataset Explorer.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MiniStat label="Providers" value={num(overview.providers)} />
                <MiniStat label="Last sync" value={fmtAge(overview.lastSync)} />
                <MiniStat label="Latest row" value={fmtAge(rows[0]?.updated_at)} />
                <MiniStat label="Mode" value="Read-only reference" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Provider breakdown</CardTitle>
                <CardDescription>Loaded signal distribution by provider.</CardDescription>
              </CardHeader>
              <CardContent>
                {providerBreakdown.length === 0 ? <EmptyState icon={<Database className="h-8 w-8" />} title="No providers yet" description="Provider distribution appears after reference signals are ingested." /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Signals</TableHead></TableRow></TableHeader>
                    <TableBody>{providerBreakdown.map(([provider, count]) => <TableRow key={provider}><TableCell>{provider}</TableCell><TableCell className="text-right">{num(count)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signals">
            <Card>
              <CardHeader>
                <CardTitle>Reference signals</CardTitle>
                <CardDescription>Latest 500 reference records loaded for this organization.</CardDescription>
              </CardHeader>
              <CardContent>
                {rows.length === 0 ? <EmptyState icon={<Globe2 className="h-8 w-8" />} title="No signals yet" description="Reference signals will appear after a vendor sync completes." /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Region</TableHead><TableHead>Domain</TableHead><TableHead>Metric</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Provider</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
                    <TableBody>{rows.slice(0, 100).map((row) => <TableRow key={row.id}><TableCell>{row.region ?? "—"}</TableCell><TableCell>{getDomain(row)}</TableCell><TableCell className="font-mono text-xs max-w-[280px] truncate" title={row.metric_name}>{row.metric_name}</TableCell><TableCell className="text-right">{num(row.value, 4)} {row.unit ?? ""}</TableCell><TableCell>{getProvider(row)}</TableCell><TableCell className="text-xs text-muted-foreground">{fmtAge(row.updated_at)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sources">
            <Card>
              <CardHeader>
                <CardTitle>Vendor sources</CardTitle>
                <CardDescription>Configured external sources and manual sync controls.</CardDescription>
              </CardHeader>
              <CardContent>
                {sources.length === 0 ? <EmptyState icon={<Database className="h-8 w-8" />} title="No vendor sources configured" description="Configure vendor connections under Admin → Data Vendors to begin ingesting reference intelligence." /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Vendor</TableHead><TableHead>Status</TableHead><TableHead>Last refreshed</TableHead><TableHead>Trust</TableHead><TableHead>Issue</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                    <TableBody>{sources.map((source) => <TableRow key={source.id}><TableCell><div className="font-medium">{source.vendor_name}</div><div className="text-xs text-muted-foreground font-mono">{source.vendor_key}</div></TableCell><TableCell>{source.is_active ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3 mr-1" /> Active</Badge> : <Badge variant="secondary">Paused</Badge>}</TableCell><TableCell>{fmtAge(source.last_refreshed_at)}</TableCell><TableCell><Badge variant="outline">{source.trust_level ?? "—"}/100</Badge></TableCell><TableCell className="max-w-[240px] truncate text-xs text-muted-foreground" title={source.last_error ?? undefined}>{source.last_error ?? "None"}</TableCell><TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => triggerSync(source.id, source.vendor_name)} disabled={!source.is_active || syncing === source.id}>{syncing === source.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</Button></TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync">
            <Card>
              <CardHeader>
                <CardTitle>Recent sync runs</CardTitle>
                <CardDescription>Last 50 vendor refresh attempts.</CardDescription>
              </CardHeader>
              <CardContent>
                {runs.length === 0 ? <EmptyState icon={<Clock className="h-8 w-8" />} title="No sync runs yet" description="Manual or scheduled sync runs will appear here with row counts and errors." /> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Vendor</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Fetched</TableHead><TableHead className="text-right">Saved</TableHead><TableHead>Issue</TableHead></TableRow></TableHeader>
                    <TableBody>{runs.map((run) => <TableRow key={run.id}><TableCell><div>{fmtAge(run.started_at)}</div><div className="text-xs text-muted-foreground">{fmtDate(run.started_at)}</div></TableCell><TableCell className="font-mono text-xs">{run.vendor_key}</TableCell><TableCell><Badge variant={run.status === "success" ? "default" : run.status === "running" ? "secondary" : "destructive"}>{run.status ?? "unknown"}</Badge></TableCell><TableCell className="text-right">{num(run.rows_fetched)}</TableCell><TableCell className="text-right">{num(run.rows_upserted)}</TableCell><TableCell className="text-xs text-muted-foreground max-w-[240px] truncate" title={run.error_message ?? undefined}>{run.error_message ?? "—"}</TableCell></TableRow>)}</TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </DataHubShell>
  );
}

function DataHubShell({ children, onReload, loading }: { children: React.ReactNode; onReload: () => void; loading: boolean }) {
  return (
    <div className="container mx-auto px-4 py-8 space-y-6 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-xs">Reference Intelligence</Badge>
            <Badge variant="secondary" className="text-xs">Read-only · Org-scoped</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Data Hub</h1>
          <p className="text-muted-foreground mt-1">Curated external intelligence signals kept separate from uploaded client datasets.</p>
        </div>
        <Button onClick={onReload} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Reload
        </Button>
      </div>
      {children}
    </div>
  );
}

function KpiCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between text-muted-foreground mb-2"><span className="text-xs uppercase tracking-wide">{label}</span>{icon}</div>
        <div className="text-2xl font-bold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border/60 pl-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-muted-foreground mb-3">{icon}</div>
        <h3 className="font-medium mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md">{description}</p>
      </CardContent>
    </Card>
  );
}
