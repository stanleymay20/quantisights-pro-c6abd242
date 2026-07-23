import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, Database, GitBranch, Activity } from "lucide-react";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

type Connector = { id: string; name: string; connector_type: string; config: any; status: string; health: string };
type Schema = {
  id: string; service_name: string; entity_set: string; entity_type: string;
  odata_version: string; is_custom: boolean; key_fields: any; fields: any[];
  navigation_properties: any[]; last_discovered_at: string;
};
type DriftAlert = {
  id: string; service_name: string; entity_set: string; drift_type: string;
  severity: "info" | "warning" | "critical"; field_name: string | null;
  before_value: any; after_value: any; operational_impact: string | null;
  acknowledged: boolean; detected_at: string;
};
type Checkpoint = {
  id: string; cursor_field: string; cursor_value: string | null;
  last_change_token: string | null; high_watermark: string | null;
  change_event_ready: boolean; updated_at: string;
};
type DqScore = { stream_key: string | null; freshness_score: number; completeness_score: number; confidence_score: number; computed_at: string };

const severityVariant = (s: string) =>
  s === "critical" ? "destructive" : s === "warning" ? "default" : "secondary";

function SapConnectorInner() {
  const { orgId: organizationId } = useActiveDataContext();
  const [loading, setLoading] = useState(true);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [drift, setDrift] = useState<DriftAlert[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [dq, setDq] = useState<DqScore[]>([]);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      const { data } = await supabase
        .from("data_connectors")
        .select("id,name,connector_type,config,status,health")
        .eq("organization_id", organizationId)
        .eq("connector_type", "sap_odata");
      const rows = (data ?? []) as unknown as Connector[];
      setConnectors(rows);
      if (rows.length && !selectedId) setSelectedId(rows[0].id);
      setLoading(false);
    })();
  }, [organizationId]);

  useEffect(() => {
    if (!selectedId || !organizationId) return;
    (async () => {
      const [s, d, c, q] = await Promise.all([
        supabase.from("sap_object_schemas").select("*").eq("connector_id", selectedId).order("service_name"),
        supabase.from("sap_schema_drift_alerts").select("*").eq("connector_id", selectedId).order("detected_at", { ascending: false }).limit(100),
        supabase.from("connector_sync_checkpoints").select("id,cursor_field,cursor_value,last_change_token,high_watermark,change_event_ready,updated_at").eq("connector_id", selectedId),
        supabase.from("connector_dq_scores").select("stream_key,freshness_score,completeness_score,confidence_score,computed_at").eq("connector_id", selectedId).order("computed_at", { ascending: false }).limit(50),
      ]);
      setSchemas(((s.data ?? []) as unknown as Schema[]));
      setDrift(((d.data ?? []) as unknown as DriftAlert[]));
      setCheckpoints(((c.data ?? []) as unknown as Checkpoint[]));
      setDq(((q.data ?? []) as unknown as DqScore[]));
    })();
  }, [selectedId, organizationId]);

  async function runDiscover() {
    if (!selectedId) return;
    setDiscovering(true);
    try {
      const res = await invokeWithRetry("connector-sap-discover", { body: { connector_id: selectedId } });
      if (res.error) throw res.error;
      const d: any = res.data;
      toast.success(`Discovery complete: ${d?.discovered ?? 0} entities, ${d?.drift_alerts ?? 0} drift alerts`);
      // refresh
      setSelectedId((id) => id);
      const ev = new Event("focus");
      window.dispatchEvent(ev);
    } catch (e: any) {
      toast.error(`Discovery failed: ${e?.message ?? "unknown"}`);
    } finally {
      setDiscovering(false);
    }
  }

  async function acknowledgeAlert(id: string) {
    const { error } = await supabase
      .from("sap_schema_drift_alerts")
      .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setDrift((d) => d.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!connectors.length) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>SAP OData Connector</CardTitle>
            <CardDescription>
              No SAP connectors configured. Add one from the Connectors admin page with{" "}
              <code className="font-mono text-xs">connector_type = sap_odata</code> and configure{" "}
              <code className="font-mono text-xs">base_url</code>, <code className="font-mono text-xs">auth</code>, and{" "}
              <code className="font-mono text-xs">services[]</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Quantivis acts as a governed read-only intelligence layer on top of SAP. No write-back, no ABAP, no transaction orchestration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const unackCritical = drift.filter((d) => !d.acknowledged && d.severity === "critical").length;
  const unackWarn = drift.filter((d) => !d.acknowledged && d.severity === "warning").length;
  const latestDiscovery = schemas.length ? schemas.reduce((m, s) => (s.last_discovered_at > m ? s.last_discovered_at : m), "") : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">SAP OData Control Plane</h1>
          <p className="text-sm text-muted-foreground">Metadata, drift, sync state, and data quality for SAP services.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select connector" /></SelectTrigger>
            <SelectContent>
              {connectors.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={runDiscover} disabled={discovering}>
            {discovering ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh metadata
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Database className="h-4 w-4" />} label="Entities cached" value={String(schemas.length)} />
        <StatCard icon={<GitBranch className="h-4 w-4" />} label="Critical drift" value={String(unackCritical)} tone={unackCritical ? "destructive" : "muted"} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Warning drift" value={String(unackWarn)} tone={unackWarn ? "warning" : "muted"} />
        <StatCard icon={<Activity className="h-4 w-4" />} label="Last discovery" value={latestDiscovery ? new Date(latestDiscovery).toLocaleString() : "—"} />
      </div>

      <Tabs defaultValue="explorer">
        <TabsList>
          <TabsTrigger value="explorer">Metadata explorer</TabsTrigger>
          <TabsTrigger value="drift">Drift alerts {unackCritical + unackWarn > 0 && <Badge variant="destructive" className="ml-2">{unackCritical + unackWarn}</Badge>}</TabsTrigger>
          <TabsTrigger value="sync">Delta & sync state</TabsTrigger>
          <TabsTrigger value="dq">Data quality</TabsTrigger>
        </TabsList>

        <TabsContent value="explorer">
          <Card>
            <CardHeader><CardTitle>Discovered entities</CardTitle><CardDescription>Cached from SAP <code className="font-mono text-xs">$metadata</code>.</CardDescription></CardHeader>
            <CardContent>
              {schemas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No metadata discovered yet. Click "Refresh metadata".</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead><TableHead>Entity set</TableHead><TableHead>Type</TableHead>
                      <TableHead>OData</TableHead><TableHead>Fields</TableHead><TableHead>Nav props</TableHead>
                      <TableHead>Custom</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {schemas.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.service_name}</TableCell>
                        <TableCell className="font-mono text-xs">{s.entity_set}</TableCell>
                        <TableCell className="font-mono text-xs">{s.entity_type}</TableCell>
                        <TableCell><Badge variant="outline">{s.odata_version}</Badge></TableCell>
                        <TableCell>{(s.fields ?? []).length}</TableCell>
                        <TableCell>{(s.navigation_properties ?? []).length}</TableCell>
                        <TableCell>{s.is_custom ? <Badge variant="secondary">Z*</Badge> : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="drift">
          <Card>
            <CardHeader><CardTitle>Schema drift</CardTitle><CardDescription>Detected by diffing latest <code className="font-mono text-xs">$metadata</code> against the cached snapshot.</CardDescription></CardHeader>
            <CardContent>
              {drift.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-emerald-600" /> No drift detected.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Severity</TableHead><TableHead>Service / Entity</TableHead><TableHead>Drift</TableHead>
                      <TableHead>Field</TableHead><TableHead>Operational impact</TableHead><TableHead>Detected</TableHead><TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drift.map((a) => (
                      <TableRow key={a.id} className={a.acknowledged ? "opacity-50" : ""}>
                        <TableCell><Badge variant={severityVariant(a.severity) as any}>{a.severity}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{a.service_name} / {a.entity_set}</TableCell>
                        <TableCell className="font-mono text-xs">{a.drift_type}</TableCell>
                        <TableCell className="font-mono text-xs">{a.field_name ?? "—"}</TableCell>
                        <TableCell className="text-xs max-w-md">{a.operational_impact ?? "—"}</TableCell>
                        <TableCell className="text-xs">{new Date(a.detected_at).toLocaleString()}</TableCell>
                        <TableCell>
                          {!a.acknowledged && (
                            <Button size="sm" variant="ghost" onClick={() => acknowledgeAlert(a.id)}>Ack</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sync">
          <Card>
            <CardHeader><CardTitle>Incremental sync state</CardTitle><CardDescription>Delta tokens, watermarks, and CDC readiness per entity.</CardDescription></CardHeader>
            <CardContent>
              {checkpoints.length === 0 ? (
                <p className="text-sm text-muted-foreground">No checkpoints recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cursor field</TableHead><TableHead>Cursor value</TableHead>
                      <TableHead>Delta token</TableHead><TableHead>High watermark</TableHead>
                      <TableHead>CDC ready</TableHead><TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {checkpoints.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.cursor_field}</TableCell>
                        <TableCell className="font-mono text-xs">{c.cursor_value ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs max-w-xs truncate" title={c.last_change_token ?? ""}>{c.last_change_token ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{c.high_watermark ? new Date(c.high_watermark).toLocaleString() : "—"}</TableCell>
                        <TableCell>{c.change_event_ready ? <Badge variant="default">yes</Badge> : <Badge variant="outline">no</Badge>}</TableCell>
                        <TableCell className="text-xs">{new Date(c.updated_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dq">
          <Card>
            <CardHeader><CardTitle>Data quality scores</CardTitle><CardDescription>Per-entity freshness, completeness, and overall confidence.</CardDescription></CardHeader>
            <CardContent>
              {dq.length === 0 ? (
                <p className="text-sm text-muted-foreground">No DQ scores computed yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead><TableHead>Freshness</TableHead>
                      <TableHead>Completeness</TableHead><TableHead>Overall</TableHead><TableHead>Computed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dq.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{d.stream_key ?? "—"}</TableCell>
                        <TableCell>{Number(d.freshness_score ?? 0).toFixed(0)}</TableCell>
                        <TableCell>{Number(d.completeness_score ?? 0).toFixed(0)}</TableCell>
                        <TableCell><Badge variant={Number(d.confidence_score) >= 80 ? "default" : Number(d.confidence_score) >= 60 ? "secondary" : "destructive"}>{Number(d.confidence_score ?? 0).toFixed(0)}</Badge></TableCell>
                        <TableCell className="text-xs">{new Date(d.computed_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ icon, label, value, tone = "muted" }: { icon: React.ReactNode; label: string; value: string; tone?: "muted" | "destructive" | "warning" }) {
  const toneClass = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`flex items-center gap-2 text-xs ${toneClass}`}>{icon}{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

export default function SapConnector() {
  return (
    <SectionErrorBoundary sectionName="SAP Connector Control Plane">
      <SapConnectorInner />
    </SectionErrorBoundary>
  );
}
