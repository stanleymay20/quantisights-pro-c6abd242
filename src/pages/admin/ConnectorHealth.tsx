/**
 * Connector Health & Canonical Coverage (Phase 4 observability surface)
 *
 * Read-only operator view that consolidates the new warehouse-native + CRM-aware
 * connector telemetry into a single page:
 *  - Circuit breaker state per connector
 *  - Throttle/quota observation (HubSpot, Salesforce, future vendors)
 *  - OAuth token lifecycle (Salesforce: expiry, rotations, quarantine)
 *  - Latest DQ scores (completeness, freshness, distinctness, schema drift)
 *  - Canonical coverage: entity/event/metric row counts per connector
 *  - Salesforce schema discovery cache (object → field count, last refreshed)
 *
 * No writes — all mutations happen via the Connectors admin page or schedulers.
 */
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, AlertTriangle, CheckCircle2, Clock, Database, Gauge,
  KeyRound, RefreshCw, ShieldAlert, Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ConnectorRow {
  id: string;
  name: string;
  connector_type: string;
  status: string;
  health: string;
  organization_id: string;
}
interface CircuitRow {
  connector_id: string; state: string; consecutive_failures: number;
  opened_at: string | null; next_probe_at: string | null; last_error: string | null;
  updated_at: string;
}
interface ThrottleRow {
  connector_id: string; vendor: string; remaining_quota: number | null;
  reset_at: string | null; adaptive_backoff_ms: number; consecutive_throttle_events: number;
  last_observed_at: string;
}
interface TokenRow {
  connector_id: string; vendor: string; expires_at: string | null;
  refresh_failure_count: number; quarantined: boolean; revoked: boolean;
  rotation_count: number; last_rotated_at: string | null;
}
interface DqRow {
  connector_id: string; computed_at: string;
  completeness_score: number; freshness_score: number; schema_stability_score: number;
  anomaly_score: number; confidence_score: number; sample_size: number;
}
interface CoverageRow {
  connector_id: string; entities: number; events: number; metrics: number; relationships: number;
}
interface SfSchemaRow {
  connector_id: string; object_name: string; api_version: string;
  is_custom: boolean; last_discovered_at: string;
  fields: unknown; relationships: unknown;
}
interface SyncRunRow {
  connector_id: string; status: string; started_at: string; completed_at: string | null;
  duration_ms: number | null; rows_inserted: number; rows_extracted: number;
}
interface CheckpointRow {
  connector_id: string; cursor_field: string; cursor_value: string | null;
  high_watermark: string | null; change_event_ready: boolean; updated_at: string;
}

function fmtAgo(ts: string | null): string {
  if (!ts) return "—";
  try { return formatDistanceToNow(new Date(ts), { addSuffix: true }); } catch { return "—"; }
}
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}
function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

export default function ConnectorHealth() {
  const { currentOrg } = useOrganization();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [connectors, setConnectors] = useState<ConnectorRow[]>([]);
  const [circuits, setCircuits] = useState<CircuitRow[]>([]);
  const [throttles, setThrottles] = useState<ThrottleRow[]>([]);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [dq, setDq] = useState<DqRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);
  const [sfSchemas, setSfSchemas] = useState<SfSchemaRow[]>([]);
  const [runs, setRuns] = useState<SyncRunRow[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointRow[]>([]);

  async function loadAll() {
    if (!currentOrg?.id) return;
    setLoading(true);
    try {
      const orgId = currentOrg.id;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [c, cs, ts, tk, dqq, ce, cev, cmt, crel, sfs, rr, ck] = await Promise.all([
        supabase.from("data_connectors")
          .select("id,name,connector_type,status,health,organization_id")
          .eq("organization_id", orgId).order("name"),
        supabase.from("connector_circuit_state")
          .select("connector_id,state,consecutive_failures,opened_at,next_probe_at,last_error,updated_at")
          .eq("organization_id", orgId),
        supabase.from("connector_throttle_state")
          .select("connector_id,vendor,remaining_quota,reset_at,adaptive_backoff_ms,consecutive_throttle_events,last_observed_at")
          .eq("organization_id", orgId),
        supabase.from("connector_token_state")
          .select("connector_id,vendor,expires_at,refresh_failure_count,quarantined,revoked,rotation_count,last_rotated_at")
          .eq("organization_id", orgId),
        supabase.from("connector_dq_scores")
          .select("connector_id,computed_at,completeness_score,freshness_score,schema_stability_score,anomaly_score,confidence_score,sample_size")
          .eq("organization_id", orgId).order("computed_at", { ascending: false }).limit(200),
        supabase.from("canonical_entities").select("connector_id").eq("organization_id", orgId).limit(10000),
        supabase.from("canonical_events").select("connector_id").eq("organization_id", orgId).limit(10000),
        supabase.from("canonical_metrics").select("connector_id").eq("organization_id", orgId).limit(10000),
        supabase.from("canonical_relationships").select("connector_id").eq("organization_id", orgId).limit(10000),
        supabase.from("salesforce_object_schemas")
          .select("connector_id,object_name,api_version,is_custom,last_discovered_at,fields,relationships")
          .eq("organization_id", orgId).order("object_name"),
        supabase.from("connector_sync_runs")
          .select("connector_id,status,started_at,completed_at,duration_ms,rows_inserted,rows_extracted")
          .eq("organization_id", orgId).gte("started_at", sevenDaysAgo)
          .order("started_at", { ascending: false }).limit(2000),
        supabase.from("connector_sync_checkpoints")
          .select("connector_id,cursor_field,cursor_value,high_watermark,change_event_ready,updated_at")
          .eq("organization_id", orgId),
      ]);
      setConnectors(((c.data as unknown) as ConnectorRow[]) ?? []);
      setCircuits(((cs.data as unknown) as CircuitRow[]) ?? []);
      setThrottles(((ts.data as unknown) as ThrottleRow[]) ?? []);
      setTokens(((tk.data as unknown) as TokenRow[]) ?? []);
      setDq(((dqq.data as unknown) as DqRow[]) ?? []);
      setSfSchemas(((sfs.data as unknown) as SfSchemaRow[]) ?? []);
      setRuns(((rr.data as unknown) as SyncRunRow[]) ?? []);
      setCheckpoints(((ck.data as unknown) as CheckpointRow[]) ?? []);

      const tally = new Map<string, CoverageRow>();
      const add = (rows: any[] | null, key: keyof CoverageRow) => {
        for (const r of rows ?? []) {
          const cid = r.connector_id ?? "unassigned";
          const cur = tally.get(cid) ?? { connector_id: cid, entities: 0, events: 0, metrics: 0, relationships: 0 };
          (cur[key] as number) = (cur[key] as number) + 1;
          tally.set(cid, cur);
        }
      };
      add(ce.data as any[], "entities");
      add(cev.data as any[], "events");
      add(cmt.data as any[], "metrics");
      add(crel.data as any[], "relationships");
      setCoverage(Array.from(tally.values()));
    } catch (err: any) {
      toast({ title: "Failed to load connector health", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentOrg?.id]);

  const connectorById = useMemo(() => new Map(connectors.map(c => [c.id, c])), [connectors]);
  const dqLatestByConnector = useMemo(() => {
    const m = new Map<string, DqRow>();
    for (const r of dq) if (!m.has(r.connector_id)) m.set(r.connector_id, r);
    return m;
  }, [dq]);
  const coverageById = useMemo(() => new Map(coverage.map(r => [r.connector_id, r])), [coverage]);

  // Per-connector 7-day operational rollup
  const opsByConnector = useMemo(() => {
    const m = new Map<string, {
      runs7d: number; succeeded: number; failed: number;
      rowsInserted7d: number; lastSuccess: string | null; lastFailure: string | null;
      p50Ms: number | null; p95Ms: number | null;
    }>();
    const buckets = new Map<string, number[]>();
    for (const r of runs) {
      const cid = r.connector_id;
      const cur = m.get(cid) ?? { runs7d: 0, succeeded: 0, failed: 0, rowsInserted7d: 0, lastSuccess: null, lastFailure: null, p50Ms: null, p95Ms: null };
      cur.runs7d += 1;
      cur.rowsInserted7d += r.rows_inserted ?? 0;
      if (r.status === "succeeded") {
        cur.succeeded += 1;
        if (!cur.lastSuccess || r.started_at > cur.lastSuccess) cur.lastSuccess = r.started_at;
      } else if (r.status === "failed") {
        cur.failed += 1;
        if (!cur.lastFailure || r.started_at > cur.lastFailure) cur.lastFailure = r.started_at;
      }
      if (typeof r.duration_ms === "number") {
        const arr = buckets.get(cid) ?? []; arr.push(r.duration_ms); buckets.set(cid, arr);
      }
      m.set(cid, cur);
    }
    for (const [cid, arr] of buckets) {
      arr.sort((a, b) => a - b);
      const pick = (p: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
      const cur = m.get(cid)!;
      cur.p50Ms = pick(0.5); cur.p95Ms = pick(0.95);
    }
    return m;
  }, [runs]);

  const checkpointsByConnector = useMemo(() => {
    const m = new Map<string, CheckpointRow[]>();
    for (const r of checkpoints) {
      const list = m.get(r.connector_id) ?? []; list.push(r); m.set(r.connector_id, list);
    }
    return m;
  }, [checkpoints]);

  const overall = useMemo(() => {
    const open = circuits.filter(c => c.state === "open").length;
    const quarantined = tokens.filter(t => t.quarantined || t.revoked).length;
    const throttled = throttles.filter(t => t.consecutive_throttle_events > 0).length;
    const lowStability = dq.filter(r => Number(r.schema_stability_score) < 0.8).length;
    return { open, quarantined, throttled, lowStability };
  }, [circuits, tokens, throttles, dq]);

  return (
    <SectionErrorBoundary sectionName="Connector Health">
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" /> Connector Health & Canonical Coverage
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Operator view of circuit breakers, throttle/quota, OAuth lifecycle, data-quality scores,
              and canonical model coverage across all linked connectors.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile icon={<ShieldAlert className="h-4 w-4" />} label="Circuits open" value={overall.open}
            tone={overall.open > 0 ? "danger" : "ok"} />
          <StatTile icon={<KeyRound className="h-4 w-4" />} label="Tokens quarantined" value={overall.quarantined}
            tone={overall.quarantined > 0 ? "danger" : "ok"} />
          <StatTile icon={<Gauge className="h-4 w-4" />} label="Vendors throttled" value={overall.throttled}
            tone={overall.throttled > 0 ? "warn" : "ok"} />
          <StatTile icon={<Workflow className="h-4 w-4" />} label="Low schema stability" value={overall.lowStability}
            tone={overall.lowStability > 0 ? "warn" : "ok"} />
        </div>

        <Tabs defaultValue="operations" className="w-full">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="operations">Operations (7d)</TabsTrigger>
            <TabsTrigger value="coverage">Canonical coverage</TabsTrigger>
            <TabsTrigger value="dq">Data quality</TabsTrigger>
            <TabsTrigger value="circuits">Circuit breakers</TabsTrigger>
            <TabsTrigger value="throttle">Throttle & quota</TabsTrigger>
            <TabsTrigger value="tokens">OAuth tokens</TabsTrigger>
            <TabsTrigger value="checkpoints">Checkpoints</TabsTrigger>
            <TabsTrigger value="salesforce">Salesforce schema</TabsTrigger>
          </TabsList>

          <TabsContent value="operations">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Per-connector sync rollup (last 7 days)</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th>
                        <th className="text-right">Runs</th><th className="text-right">Success %</th>
                        <th className="text-right">Rows inserted</th>
                        <th className="text-right">P50 (ms)</th><th className="text-right">P95 (ms)</th>
                        <th className="text-right">Last success</th><th className="text-right">Last failure</th></tr>
                    </thead>
                    <tbody>
                      {connectors.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No connectors linked yet.</td></tr>}
                      {connectors.map(c => {
                        const o = opsByConnector.get(c.id);
                        const successPct = o && o.runs7d > 0 ? (o.succeeded / o.runs7d) * 100 : null;
                        const tone = successPct == null ? "text-muted-foreground"
                          : successPct >= 95 ? "text-emerald-600"
                          : successPct >= 80 ? "text-yellow-600" : "text-destructive";
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{c.name}<div className="text-xs text-muted-foreground">{c.connector_type}</div></td>
                            <td className="text-right tabular-nums">{o?.runs7d ?? 0}</td>
                            <td className={`text-right tabular-nums ${tone}`}>{successPct == null ? "—" : `${successPct.toFixed(1)}%`}</td>
                            <td className="text-right tabular-nums">{fmtNum(o?.rowsInserted7d ?? 0)}</td>
                            <td className="text-right tabular-nums">{o?.p50Ms != null ? fmtNum(Math.round(o.p50Ms)) : "—"}</td>
                            <td className="text-right tabular-nums">{o?.p95Ms != null ? fmtNum(Math.round(o.p95Ms)) : "—"}</td>
                            <td className="text-right text-muted-foreground">{fmtAgo(o?.lastSuccess ?? null)}</td>
                            <td className="text-right text-muted-foreground">{fmtAgo(o?.lastFailure ?? null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="checkpoints">
            <Card>
              <CardHeader><CardTitle className="text-base">Incremental sync checkpoints</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">Cursor field</th>
                        <th className="text-left">Cursor value</th><th className="text-right">High watermark</th>
                        <th className="text-right">CDC ready</th><th className="text-right">Updated</th></tr>
                    </thead>
                    <tbody>
                      {checkpoints.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No checkpoints recorded — connectors will sync from scratch on next run.</td></tr>}
                      {Array.from(checkpointsByConnector.entries()).flatMap(([cid, list]) =>
                        list.map(r => (
                          <tr key={`${cid}-${r.cursor_field}`} className="border-b last:border-0">
                            <td className="py-2 font-medium">{connectorById.get(cid)?.name ?? cid.slice(0, 8)}</td>
                            <td className="text-muted-foreground">{r.cursor_field}</td>
                            <td className="text-muted-foreground truncate max-w-[240px]">{r.cursor_value ?? "—"}</td>
                            <td className="text-right text-muted-foreground">{fmtAgo(r.high_watermark)}</td>
                            <td className="text-right">{r.change_event_ready ? <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">yes</Badge> : <span className="text-muted-foreground text-xs">no</span>}</td>
                            <td className="text-right text-muted-foreground">{fmtAgo(r.updated_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="coverage">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> Rows ingested into the canonical model</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">Type</th>
                        <th className="text-right">Entities</th><th className="text-right">Events</th>
                        <th className="text-right">Metrics</th><th className="text-right">Relationships</th></tr>
                    </thead>
                    <tbody>
                      {connectors.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No connectors linked yet.</td></tr>}
                      {connectors.map(c => {
                        const cov = coverageById.get(c.id);
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{c.name}</td>
                            <td className="text-muted-foreground">{c.connector_type}</td>
                            <td className="text-right tabular-nums">{fmtNum(cov?.entities ?? 0)}</td>
                            <td className="text-right tabular-nums">{fmtNum(cov?.events ?? 0)}</td>
                            <td className="text-right tabular-nums">{fmtNum(cov?.metrics ?? 0)}</td>
                            <td className="text-right tabular-nums">{fmtNum(cov?.relationships ?? 0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dq">
            <Card>
              <CardHeader><CardTitle className="text-base">Latest data-quality score per connector</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th>
                        <th className="text-right">Completeness</th><th className="text-right">Freshness</th>
                        <th className="text-right">Schema stability</th><th className="text-right">Anomaly</th>
                        <th className="text-right">Confidence</th><th className="text-right">Sample</th>
                        <th className="text-right">Computed</th></tr>
                    </thead>
                    <tbody>
                      {connectors.map(c => {
                        const r = dqLatestByConnector.get(c.id);
                        const pct = (v: number | null | undefined) => v == null ? "—" : `${(Number(v) * 100).toFixed(1)}%`;
                        return (
                          <tr key={c.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{c.name}</td>
                            <td className="text-right tabular-nums">{pct(r?.completeness_score)}</td>
                            <td className="text-right tabular-nums">{pct(r?.freshness_score)}</td>
                            <td className="text-right tabular-nums">{pct(r?.schema_stability_score)}</td>
                            <td className="text-right tabular-nums">{pct(r?.anomaly_score)}</td>
                            <td className="text-right tabular-nums">{pct(r?.confidence_score)}</td>
                            <td className="text-right tabular-nums">{fmtNum(r?.sample_size ?? null)}</td>
                            <td className="text-right text-muted-foreground">{fmtAgo(r?.computed_at ?? null)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="circuits">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">State</th>
                        <th className="text-right">Failures</th><th className="text-right">Opened</th>
                        <th className="text-right">Next probe</th></tr>
                    </thead>
                    <tbody>
                      {circuits.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No circuit state recorded.</td></tr>}
                      {circuits.map(r => (
                        <tr key={r.connector_id} className="border-b last:border-0">
                          <td className="py-2 font-medium">{connectorById.get(r.connector_id)?.name ?? r.connector_id.slice(0, 8)}</td>
                          <td><CircuitBadge state={r.state} /></td>
                          <td className="text-right tabular-nums">{r.consecutive_failures}</td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.opened_at)}</td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.next_probe_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="throttle">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">Vendor</th>
                        <th className="text-right">Remaining quota</th><th className="text-right">Reset</th>
                        <th className="text-right">Backoff (ms)</th><th className="text-right">Consec. throttled</th></tr>
                    </thead>
                    <tbody>
                      {throttles.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No throttle observations yet.</td></tr>}
                      {throttles.map(r => (
                        <tr key={`${r.connector_id}-${r.vendor}`} className="border-b last:border-0">
                          <td className="py-2 font-medium">{connectorById.get(r.connector_id)?.name ?? r.connector_id.slice(0, 8)}</td>
                          <td className="text-muted-foreground">{r.vendor}</td>
                          <td className="text-right tabular-nums">{fmtNum(r.remaining_quota)}</td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.reset_at)}</td>
                          <td className="text-right tabular-nums">{r.adaptive_backoff_ms}</td>
                          <td className="text-right tabular-nums">{r.consecutive_throttle_events}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tokens">
            <Card>
              <CardContent className="pt-6">
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">Vendor</th>
                        <th className="text-left">Status</th><th className="text-right">Expires</th>
                        <th className="text-right">Rotations</th><th className="text-right">Last rotated</th>
                        <th className="text-right">Refresh failures</th></tr>
                    </thead>
                    <tbody>
                      {tokens.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No OAuth tokens linked.</td></tr>}
                      {tokens.map(r => (
                        <tr key={`${r.connector_id}-${r.vendor}`} className="border-b last:border-0">
                          <td className="py-2 font-medium">{connectorById.get(r.connector_id)?.name ?? r.connector_id.slice(0, 8)}</td>
                          <td className="text-muted-foreground">{r.vendor}</td>
                          <td><TokenBadge t={r} /></td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.expires_at)}</td>
                          <td className="text-right tabular-nums">{r.rotation_count}</td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.last_rotated_at)}</td>
                          <td className="text-right tabular-nums">{r.refresh_failure_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="salesforce">
            <Card>
              <CardHeader><CardTitle className="text-base">Salesforce object schema cache (24h TTL)</CardTitle></CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr><th className="text-left py-2">Connector</th><th className="text-left">Object</th>
                        <th className="text-left">API</th><th className="text-right">Fields</th>
                        <th className="text-right">Relationships</th><th className="text-right">Discovered</th></tr>
                    </thead>
                    <tbody>
                      {sfSchemas.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Run schema discovery to populate this cache.</td></tr>}
                      {sfSchemas.map(r => (
                        <tr key={`${r.connector_id}-${r.object_name}`} className="border-b last:border-0">
                          <td className="py-2 font-medium">{connectorById.get(r.connector_id)?.name ?? r.connector_id.slice(0, 8)}</td>
                          <td className="flex items-center gap-2 py-2">
                            {r.object_name}
                            {r.is_custom && <Badge variant="outline" className="text-[10px]">custom</Badge>}
                          </td>
                          <td className="text-muted-foreground">{r.api_version}</td>
                          <td className="text-right tabular-nums">{arrLen(r.fields)}</td>
                          <td className="text-right tabular-nums">{arrLen(r.relationships)}</td>
                          <td className="text-right text-muted-foreground">{fmtAgo(r.last_discovered_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SectionErrorBoundary>
  );
}

function StatTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "ok" | "warn" | "danger" }) {
  const cls = tone === "danger" ? "border-destructive/40 bg-destructive/5"
    : tone === "warn" ? "border-yellow-500/40 bg-yellow-500/5"
    : "border-border";
  return (
    <Card className={cls}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">{icon}{label}</div>
        <div className="text-2xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function CircuitBadge({ state }: { state: string }) {
  if (state === "open") return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />open</Badge>;
  if (state === "half_open") return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />half-open</Badge>;
  return <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-600/40"><CheckCircle2 className="h-3 w-3" />closed</Badge>;
}

function TokenBadge({ t }: { t: TokenRow }) {
  if (t.revoked) return <Badge variant="destructive">revoked</Badge>;
  if (t.quarantined) return <Badge variant="destructive">quarantined</Badge>;
  if (t.refresh_failure_count > 0) return <Badge variant="outline" className="border-yellow-500/40 text-yellow-700">degraded</Badge>;
  return <Badge variant="outline" className="text-emerald-600 border-emerald-600/40">healthy</Badge>;
}
