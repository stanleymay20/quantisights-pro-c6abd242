import { useEffect, useMemo, useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock, Database,
  Globe, Pause, Play, Plus, RefreshCw, Settings2, Trash2, XCircle, Zap,
} from "lucide-react";

type ConnectorType = "rest_api" | "csv_upload" | "postgres" | "mysql" | "snowflake" | "bigquery";
type ScheduleKind = "manual" | "every_5_min" | "hourly" | "daily";

interface Connector {
  id: string;
  name: string;
  description: string | null;
  connector_type: ConnectorType;
  status: "draft" | "active" | "paused" | "error" | "disabled";
  health: "unknown" | "healthy" | "degraded" | "unhealthy";
  sync_mode: "full_refresh" | "incremental" | "append";
  cursor_field: string | null;
  dataset_id: string | null;
  vault_secret_name: string | null;
  config: Record<string, unknown>;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  consecutive_failures: number;
  created_at: string;
}

interface SyncRun {
  id: string;
  status: string;
  current_stage: string | null;
  triggered_by: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  rows_extracted: number;
  rows_valid: number;
  rows_invalid: number;
  rows_inserted: number;
  error_summary: string | null;
}

interface RunError {
  id: string;
  error_kind: string;
  error_message: string;
  row_index: number | null;
  created_at: string;
}

interface FieldMapping {
  canonical: string;
  data_type: "text" | "number" | "date";
  required?: boolean;
}

interface Dataset {
  id: string;
  name: string;
}

interface Schedule {
  schedule_kind: ScheduleKind;
  is_active: boolean;
  next_run_at: string | null;
  last_dispatch_at: string | null;
}

const CONNECTOR_LABELS: Record<ConnectorType, { label: string; icon: typeof Database; available: boolean }> = {
  rest_api: { label: "REST API", icon: Globe, available: true },
  csv_upload: { label: "CSV Upload", icon: Database, available: true },
  postgres: { label: "PostgreSQL", icon: Database, available: true },
  mysql: { label: "MySQL", icon: Database, available: true },
  snowflake: { label: "Snowflake", icon: Database, available: true },
  bigquery: { label: "BigQuery", icon: Database, available: true },
};

const CANONICAL_FIELDS: FieldMapping[] = [
  { canonical: "metric_type", data_type: "text", required: true },
  { canonical: "value", data_type: "number", required: true },
  { canonical: "date", data_type: "date", required: true },
  { canonical: "region", data_type: "text" },
  { canonical: "segment", data_type: "text" },
  { canonical: "source_id", data_type: "text" },
];

function StatusBadge({ status, health }: { status: string; health: string }) {
  const cfg =
    status === "paused"
      ? { cls: "bg-muted text-muted-foreground", label: "Paused" }
      : status === "error" || health === "unhealthy"
        ? { cls: "bg-destructive/15 text-destructive", label: "Unhealthy" }
        : health === "degraded"
          ? { cls: "bg-warning/15 text-warning", label: "Degraded" }
          : status === "active" && health === "healthy"
            ? { cls: "bg-success/15 text-success", label: "Healthy" }
            : status === "active"
              ? { cls: "bg-primary/15 text-primary", label: "Active" }
              : { cls: "bg-secondary text-muted-foreground", label: status };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider ${cfg.cls}`}>{cfg.label}</span>;
}

function StageIcon({ status }: { status: string }) {
  if (status === "complete") return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (status === "partial_success") return <AlertTriangle className="w-4 h-4 text-warning" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-destructive" />;
  if (["queued", "extracting", "validating", "extracted", "transforming", "aggregating"].includes(status))
    return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
  return <Clock className="w-4 h-4 text-muted-foreground" />;
}

const Connectors = () => {
  const { currentOrgId } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();

  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Detail data
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [errors, setErrors] = useState<RunError[]>([]);
  const [mapping, setMapping] = useState<Record<string, FieldMapping>>({});
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [detailTab, setDetailTab] = useState<"runs" | "mapping" | "schedule" | "errors">("runs");

  const selected = useMemo(() => connectors.find((c) => c.id === selectedId) ?? null, [connectors, selectedId]);

  useEffect(() => {
    if (!currentOrgId) return;
    void load();
  }, [currentOrgId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  async function load() {
    setLoading(true);
    const [cRes, dRes] = await Promise.all([
      supabase.from("data_connectors").select("*").eq("organization_id", currentOrgId!).order("created_at", { ascending: false }),
      // "completed" is the status the standard CSV upload flow (DataUpload.tsx)
      // actually writes on success; "active" is only ever written by the demo
      // seed and API-ingest paths. Both mean "usable dataset."
      supabase.from("datasets").select("id,name").eq("organization_id", currentOrgId!).in("status", ["active", "completed"]).order("name"),
    ]);
    setConnectors((cRes.data as Connector[] | null) ?? []);
    setDatasets((dRes.data as Dataset[] | null) ?? []);
    setLoading(false);
  }

  async function loadDetail(id: string) {
    const [runsRes, errRes, mapRes, schedRes] = await Promise.all([
      supabase.from("connector_sync_runs").select("*").eq("connector_id", id).order("started_at", { ascending: false }).limit(20),
      supabase.from("connector_sync_run_errors").select("*").eq("connector_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("connector_field_mappings").select("mappings").eq("connector_id", id).eq("is_active", true).maybeSingle(),
      supabase.from("connector_sync_schedules").select("schedule_kind,is_active,next_run_at,last_dispatch_at").eq("connector_id", id).maybeSingle(),
    ]);
    setRuns((runsRes.data as SyncRun[] | null) ?? []);
    setErrors((errRes.data as RunError[] | null) ?? []);
    setMapping(((mapRes.data as unknown as { mappings?: Record<string, FieldMapping> } | null)?.mappings) ?? {});
    setSchedule((schedRes.data as Schedule | null) ?? null);
  }

  async function runSyncNow(connector: Connector) {
    if (connector.connector_type !== "rest_api") {
      toast({ title: "Not supported yet", description: "Manual run is only wired for REST connectors right now.", variant: "destructive" });
      return;
    }
    toast({ title: "Sync started", description: connector.name });
    try {
      const { data, error } = await invokeWithRetry<{ status: string; rows_inserted?: number }>("connector-rest-sync", {
        body: { connector_id: connector.id, request_id: crypto.randomUUID(), triggered_by: "manual" },
      });
      if (error) throw error;
      toast({
        title: data?.status === "complete" ? "Sync complete" : `Sync ${data?.status ?? "finished"}`,
        description: typeof data?.rows_inserted === "number" ? `${data.rows_inserted} rows inserted` : undefined,
      });
      void load();
      if (selectedId === connector.id) void loadDetail(connector.id);
    } catch (e) {
      toast({ title: "Sync failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    }
  }

  async function togglePause(connector: Connector) {
    const newStatus = connector.status === "paused" ? "active" : "paused";
    const { error } = await supabase.from("data_connectors").update({ status: newStatus, updated_by: user?.id }).eq("id", connector.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: newStatus === "paused" ? "Connector paused" : "Connector resumed" });
    void load();
  }

  async function deleteConnector(connector: Connector) {
    if (!confirm(`Delete connector "${connector.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("data_connectors").delete().eq("id", connector.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Connector deleted" });
    setSelectedId(null);
    void load();
  }

  async function saveMapping(newMapping: Record<string, FieldMapping>) {
    if (!selected) return;
    // Deactivate prior, insert new active version
    await supabase.from("connector_field_mappings").update({ is_active: false }).eq("connector_id", selected.id).eq("is_active", true);
    const { error } = await supabase.from("connector_field_mappings").insert([{
      organization_id: currentOrgId!,
      connector_id: selected.id,
      mappings: newMapping as any,
      is_active: true,
      version: 1,
    }]);
    if (error) {
      toast({ title: "Mapping save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Mapping saved" });
    setMapping(newMapping);
  }

  async function saveSchedule(kind: ScheduleKind) {
    if (!selected) return;
    const next = kind === "manual" ? null : new Date(Date.now() + 60_000).toISOString();
    const { error } = await supabase
      .from("connector_sync_schedules")
      .upsert(
        { organization_id: currentOrgId!, connector_id: selected.id, schedule_kind: kind, is_active: kind !== "manual", next_run_at: next },
        { onConflict: "connector_id" },
      );
    if (error) {
      toast({ title: "Schedule save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Schedule updated" });
    void loadDetail(selected.id);
  }

  return (
    <>
      <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <SidebarMobileToggle />
          <h1 className="text-[18px] font-semibold tracking-tight">Connectors</h1>
          <span className="text-xs text-muted-foreground">Enterprise Ingestion</span>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all"
        >
          <Plus className="w-4 h-4" /> New Connector
        </button>
      </header>

      <main className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[400px_1fr]">
        {/* List */}
        <SectionErrorBoundary sectionName="Connector List">
          <aside className="border-r border-border/30 overflow-auto p-4 space-y-2 bg-background/40">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : connectors.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No connectors yet. Create one to begin enterprise ingestion.
              </div>
            ) : (
              connectors.map((c) => {
                const Icon = CONNECTOR_LABELS[c.connector_type].icon;
                const isSel = selectedId === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSel ? "border-primary bg-primary/10" : "border-border/50 hover:border-primary/30 bg-card"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm font-semibold truncate">{c.name}</span>
                      </div>
                      <StatusBadge status={c.status} health={c.health} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{CONNECTOR_LABELS[c.connector_type].label}</span>
                      <span>
                        {c.last_success_at
                          ? `Last: ${new Date(c.last_success_at).toLocaleString()}`
                          : "Never synced"}
                      </span>
                    </div>
                    {c.consecutive_failures > 0 && (
                      <div className="mt-1 text-[11px] text-destructive flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {c.consecutive_failures} consecutive failures
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </aside>
        </SectionErrorBoundary>

        {/* Detail */}
        <SectionErrorBoundary sectionName="Connector Detail">
          <section className="overflow-auto p-6">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a connector to view sync history, mapping, and schedule.
              </div>
            ) : (
              <div className="space-y-5 max-w-5xl">
                {/* Header */}
                <div className="glass-card p-5 rounded-xl">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
                        <StatusBadge status={selected.status} health={selected.health} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {CONNECTOR_LABELS[selected.connector_type].label} • {selected.sync_mode}
                        {selected.dataset_id ? " • dataset linked" : " • ⚠ no dataset linked"}
                      </p>
                      {selected.last_error_message && (
                        <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {selected.last_error_message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => runSyncNow(selected)}
                        disabled={selected.connector_type !== "rest_api"}
                        title={selected.connector_type !== "rest_api" ? "Only REST is wired for manual run currently" : "Run sync now"}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:brightness-110 disabled:opacity-50"
                      >
                        <Zap className="w-3.5 h-3.5" /> Run Now
                      </button>
                      <button
                        onClick={() => togglePause(selected)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary"
                      >
                        {selected.status === "paused" ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        {selected.status === "paused" ? "Resume" : "Pause"}
                      </button>
                      <button
                        onClick={() => deleteConnector(selected)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        aria-label="Delete connector"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* KPI strip */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded bg-secondary/50">
                      <div className="text-muted-foreground">Last success</div>
                      <div className="font-semibold">
                        {selected.last_success_at ? new Date(selected.last_success_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-secondary/50">
                      <div className="text-muted-foreground">Last error</div>
                      <div className="font-semibold">
                        {selected.last_error_at ? new Date(selected.last_error_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="p-2 rounded bg-secondary/50">
                      <div className="text-muted-foreground">Failures (consec.)</div>
                      <div className="font-semibold">{selected.consecutive_failures}</div>
                    </div>
                    <div className="p-2 rounded bg-secondary/50">
                      <div className="text-muted-foreground">Schedule</div>
                      <div className="font-semibold capitalize">{schedule?.schedule_kind ?? "manual"}</div>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-border/30">
                  {(["runs", "mapping", "schedule", "errors"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setDetailTab(t)}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                        detailTab === t
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "runs" && "Sync History"}
                      {t === "mapping" && "Field Mapping"}
                      {t === "schedule" && "Schedule"}
                      {t === "errors" && `Errors${errors.length > 0 ? ` (${errors.length})` : ""}`}
                    </button>
                  ))}
                </div>

                {/* Tab body */}
                {detailTab === "runs" && (
                  <div className="space-y-2">
                    {runs.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-6 text-center glass-card rounded-xl">No sync runs yet.</div>
                    ) : (
                      runs.map((r) => (
                        <div key={r.id} className="glass-card p-3 rounded-lg flex items-center gap-3 text-xs">
                          <StageIcon status={r.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold capitalize">{r.status.replace("_", " ")}</span>
                              <span className="text-muted-foreground">• {r.triggered_by}</span>
                              <span className="text-muted-foreground">• {new Date(r.started_at).toLocaleString()}</span>
                              {r.duration_ms !== null && (
                                <span className="text-muted-foreground">• {(r.duration_ms / 1000).toFixed(2)}s</span>
                              )}
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              extracted {r.rows_extracted} • valid {r.rows_valid} • invalid {r.rows_invalid} • inserted {r.rows_inserted}
                            </div>
                            {r.error_summary && <div className="text-destructive mt-0.5 truncate">{r.error_summary}</div>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {detailTab === "mapping" && (
                  <MappingEditor connector={selected} mapping={mapping} onSave={saveMapping} />
                )}

                {detailTab === "schedule" && (
                  <div className="glass-card p-5 rounded-xl space-y-4">
                    <h3 className="text-sm font-semibold tracking-tight">Sync Schedule</h3>
                    <p className="text-xs text-muted-foreground">
                      Scheduled runs are dispatched by the cron orchestrator every 5 minutes. Concurrent
                      runs for the same connector are blocked by an advisory lock.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(["manual", "every_5_min", "hourly", "daily"] as ScheduleKind[]).map((k) => (
                        <button
                          key={k}
                          onClick={() => saveSchedule(k)}
                          className={`p-3 rounded-lg border text-xs font-medium capitalize transition-all ${
                            schedule?.schedule_kind === k
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/30"
                          }`}
                        >
                          {k.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                    {schedule && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Next run: {schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString() : "—"}</div>
                        <div>Last dispatch: {schedule.last_dispatch_at ? new Date(schedule.last_dispatch_at).toLocaleString() : "—"}</div>
                      </div>
                    )}
                  </div>
                )}

                {detailTab === "errors" && (
                  <div className="space-y-2">
                    {errors.length === 0 ? (
                      <div className="text-sm text-muted-foreground p-6 text-center glass-card rounded-xl">No errors recorded.</div>
                    ) : (
                      errors.map((e) => (
                        <div key={e.id} className="glass-card p-3 rounded-lg text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <XCircle className="w-3.5 h-3.5 text-destructive" />
                            <span className="font-semibold uppercase tracking-wider">{e.error_kind}</span>
                            {e.row_index !== null && <span className="text-muted-foreground">row #{e.row_index}</span>}
                            <span className="text-muted-foreground ml-auto">{new Date(e.created_at).toLocaleString()}</span>
                          </div>
                          <div className="text-muted-foreground break-words">{e.error_message}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </SectionErrorBoundary>
      </main>

      {showWizard && (
        <CreateWizard
          datasets={datasets}
          orgId={currentOrgId!}
          userId={user?.id ?? ""}
          onClose={() => setShowWizard(false)}
          onCreated={(id) => {
            setShowWizard(false);
            void load();
            setSelectedId(id);
          }}
        />
      )}
    </>
  );
};

// ============================================================
// Mapping editor
// ============================================================
function MappingEditor({
  connector,
  mapping,
  onSave,
}: {
  connector: Connector;
  mapping: Record<string, FieldMapping>;
  onSave: (m: Record<string, FieldMapping>) => void;
}) {
  // Source fields ↔ canonical field
  const [sourceField, setSourceField] = useState("");
  const [canonical, setCanonical] = useState<string>("metric_type");
  const [draft, setDraft] = useState<Record<string, FieldMapping>>(mapping);

  useEffect(() => setDraft(mapping), [mapping]);

  function add() {
    const f = sourceField.trim();
    if (!f) return;
    const def = CANONICAL_FIELDS.find((c) => c.canonical === canonical)!;
    setDraft((d) => ({ ...d, [f]: { canonical: def.canonical, data_type: def.data_type, required: def.required } }));
    setSourceField("");
  }

  function remove(src: string) {
    setDraft((d) => {
      const next = { ...d };
      delete next[src];
      return next;
    });
  }

  const requiredMissing = ["metric_type", "value", "date"].filter(
    (req) => !Object.values(draft).some((m) => m.canonical === req),
  );

  return (
    <div className="glass-card p-5 rounded-xl space-y-4">
      <div>
        <h3 className="text-sm font-semibold tracking-tight mb-1">Field Mapping</h3>
        <p className="text-xs text-muted-foreground">
          Map source fields to canonical analytical fields. The pipeline rejects rows where required
          mappings (metric_type, value, date) cannot be resolved.
        </p>
      </div>

      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          value={sourceField}
          onChange={(e) => setSourceField(e.target.value)}
          placeholder="source field (e.g. revenue_amount)"
          className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <select
          value={canonical}
          onChange={(e) => setCanonical(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
        >
          {CANONICAL_FIELDS.map((f) => (
            <option key={f.canonical} value={f.canonical}>
              {f.canonical} ({f.data_type}){f.required ? " *" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={!sourceField.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {requiredMissing.length > 0 && (
        <div className="text-xs text-warning flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Missing required canonical: {requiredMissing.join(", ")}
        </div>
      )}

      {Object.keys(draft).length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No mappings defined yet.</div>
      ) : (
        <div className="space-y-1">
          {Object.entries(draft).map(([src, m]) => (
            <div key={src} className="flex items-center gap-2 p-2 rounded bg-secondary/50 text-xs">
              <code className="font-mono">{src}</code>
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="font-semibold">{m.canonical}</span>
              <span className="text-muted-foreground">({m.data_type})</span>
              {m.required && <span className="text-warning text-[10px] uppercase">required</span>}
              <button onClick={() => remove(src)} className="ml-auto text-muted-foreground hover:text-destructive">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
        <button onClick={() => setDraft(mapping)} className="px-4 py-2 rounded-lg border border-border text-xs font-medium hover:bg-secondary">
          Reset
        </button>
        <button
          onClick={() => onSave(draft)}
          disabled={requiredMissing.length > 0}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
        >
          Save Active Mapping
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Create wizard
// ============================================================
function CreateWizard({
  datasets,
  orgId,
  userId,
  onClose,
  onCreated,
}: {
  datasets: Dataset[];
  orgId: string;
  userId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ConnectorType>("rest_api");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [syncMode, setSyncMode] = useState<"full_refresh" | "incremental">("full_refresh");
  const [cursorField, setCursorField] = useState("");
  // REST config
  const [url, setUrl] = useState("");
  const [authKind, setAuthKind] = useState<"none" | "bearer" | "header" | "query">("none");
  const [headerName, setHeaderName] = useState("");
  const [queryParam, setQueryParam] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [paginationKind, setPaginationKind] = useState<"none" | "page" | "cursor">("none");
  const [pageParam, setPageParam] = useState("page");
  const [pageSize, setPageSize] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    if (!datasetId) {
      toast({ title: "Dataset required", description: "Create or pick a dataset first.", variant: "destructive" });
      return;
    }
    if (type === "rest_api" && !url.trim()) {
      toast({ title: "URL required for REST connector", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      let vaultSecretName: string | null = null;
      // Store credential via edge function (handled later); for now persist in vault via RPC if available.
      // This MVP stores the secret reference name; the actual upsert happens via existing secret machinery.
      if (type === "rest_api" && authKind !== "none" && secretValue) {
        vaultSecretName = `connector_${crypto.randomUUID().slice(0, 8)}`;
        const { error: vaultErr } = await supabase.rpc("upsert_vault_secret", {
          _name: vaultSecretName,
          _value: secretValue,
        });
        if (vaultErr) {
          // Vault RPC may not exist — surface clearly but allow connector creation without secret persistence.
          toast({
            title: "Credential not stored",
            description: "Vault RPC unavailable; connector saved without secret. Configure later via Settings → Secrets.",
            variant: "destructive",
          });
          vaultSecretName = null;
        }
      }

      const config: Record<string, unknown> =
        type === "rest_api"
          ? {
              url: url.trim(),
              method: "GET",
              auth: { kind: authKind, header_name: headerName || undefined, query_param: queryParam || undefined },
              data_path: dataPath || undefined,
              pagination:
                paginationKind === "none"
                  ? { kind: "none" }
                  : paginationKind === "page"
                    ? { kind: "page", page_param: pageParam, page_size: pageSize, max_pages: 50 }
                    : { kind: "cursor", cursor_param: "cursor", cursor_path: "next_cursor" },
              incremental: syncMode === "incremental" && cursorField ? { kind: "since_param", since_param: cursorField } : { kind: "none" },
            }
          : {};

      const { data, error } = await supabase
        .from("data_connectors")
        .insert([{
          organization_id: orgId,
          dataset_id: datasetId,
          name: name.trim(),
          description: description.trim() || null,
          connector_type: type,
          status: "active",
          health: "unknown",
          sync_mode: syncMode,
          cursor_field: syncMode === "incremental" ? cursorField || null : null,
          vault_secret_name: vaultSecretName,
          config: config as any,
          created_by: userId,
        }])
        .select("id")
        .single();
      if (error) throw error;
      toast({ title: "Connector created", description: name });
      onCreated((data as { id: string }).id);
    } catch (e) {
      toast({ title: "Create failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">New Connector</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(CONNECTOR_LABELS) as ConnectorType[]).map((t) => {
                const cfg = CONNECTOR_LABELS[t];
                const Icon = cfg.icon;
                const sel = type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`p-3 rounded-lg border text-left text-xs transition-all ${
                      sel ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                    }`}
                  >
                    <Icon className="w-4 h-4 text-primary mb-1" />
                    <div className="font-semibold">{cfg.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Dataset</label>
              <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                <option value="">— select —</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Sync Mode</label>
              <select value={syncMode} onChange={(e) => setSyncMode(e.target.value as "full_refresh" | "incremental")} className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                <option value="full_refresh">Full refresh</option>
                <option value="incremental">Incremental</option>
              </select>
            </div>
            {syncMode === "incremental" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cursor field</label>
                <input value={cursorField} onChange={(e) => setCursorField(e.target.value)} placeholder="updated_at" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
              </div>
            )}
          </div>

          {type === "rest_api" && (
            <div className="space-y-3 p-3 rounded-lg bg-secondary/30 border border-border/40">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">REST Configuration</div>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/data" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />

              <div className="grid sm:grid-cols-2 gap-3">
                <select value={authKind} onChange={(e) => setAuthKind(e.target.value as "none" | "bearer" | "header" | "query")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                  <option value="none">No auth</option>
                  <option value="bearer">Bearer token</option>
                  <option value="header">Custom header</option>
                  <option value="query">Query parameter</option>
                </select>
                {authKind === "header" && (
                  <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="Header name (X-API-Key)" className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                )}
                {authKind === "query" && (
                  <input value={queryParam} onChange={(e) => setQueryParam(e.target.value)} placeholder="Query param (api_key)" className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                )}
              </div>
              {authKind !== "none" && (
                <input
                  type="password"
                  value={secretValue}
                  onChange={(e) => setSecretValue(e.target.value)}
                  placeholder="Secret value (encrypted at rest)"
                  className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm"
                />
              )}

              <input value={dataPath} onChange={(e) => setDataPath(e.target.value)} placeholder="Data path (e.g. data.items) — leave blank if root array" className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />

              <div className="grid sm:grid-cols-3 gap-3">
                <select value={paginationKind} onChange={(e) => setPaginationKind(e.target.value as "none" | "page" | "cursor")} className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm">
                  <option value="none">No pagination</option>
                  <option value="page">Page-based</option>
                  <option value="cursor">Cursor-based</option>
                </select>
                {paginationKind === "page" && (
                  <>
                    <input value={pageParam} onChange={(e) => setPageParam(e.target.value)} placeholder="page param" className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                    <input type="number" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value) || 100)} placeholder="page size" className="px-3 py-2 rounded-lg bg-secondary border border-border text-sm" />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border/30">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-secondary">Cancel</button>
            <button onClick={submit} disabled={submitting} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
              {submitting ? "Creating…" : "Create Connector"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Connectors;
