import { useEffect, useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  FileSpreadsheet,
  Globe,
  Lock,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Webhook,
  XCircle,
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

type SourceType = "csv" | "webhook" | "api" | "database";

interface DataSource {
  id: string;
  name: string;
  source_type: string;
  status: string;
  config: Record<string, unknown> | null;
  credentials_key_hash: string | null;
  last_synced_at: string | null;
  created_at: string;
}

interface SyncJob {
  id: string;
  status: string;
  records_synced: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  request_id: string | null;
}

const CONNECTOR_TYPES = [
  { value: "stripe", label: "Stripe", desc: "Revenue, MRR, churn, subscriptions", secrets: ["STRIPE_SECRET_KEY"] },
  { value: "ga4", label: "Google Analytics 4", desc: "Sessions, users, conversions, channels", secrets: ["GA4_SERVICE_ACCOUNT_JSON", "GA4_PROPERTY_ID"] },
  { value: "hubspot", label: "HubSpot", desc: "Pipeline, deals, contacts", secrets: ["HUBSPOT_API_KEY"] },
  { value: "quickbooks", label: "QuickBooks", desc: "P&L, cash flow, net income", secrets: ["QUICKBOOKS_ACCESS_TOKEN", "QUICKBOOKS_REALM_ID"] },
  { value: "xero", label: "Xero", desc: "Revenue, expenses, bank balances", secrets: ["XERO_ACCESS_TOKEN", "XERO_TENANT_ID"] },
  { value: "salesforce", label: "Salesforce", desc: "Closed-won revenue, pipeline, leads", secrets: ["SALESFORCE_ACCESS_TOKEN", "SALESFORCE_INSTANCE_URL"] },
] as const;

const SOURCE_TYPES: { value: SourceType; label: string; icon: typeof Database; description: string; tierRequired?: string }[] = [
  { value: "csv", label: "CSV Upload", icon: FileSpreadsheet, description: "Upload CSV files manually" },
  { value: "webhook", label: "Webhook", icon: Webhook, description: "Receive data via HTTP endpoint" },
  { value: "api", label: "Native Connector", icon: Globe, description: "Stripe, GA4, HubSpot, QuickBooks, Xero, Salesforce", tierRequired: "growth" },
  { value: "database", label: "Database", icon: Database, description: "Postgres, MySQL, BigQuery", tierRequired: "enterprise" },
];

const SyncButton = ({ source, organizationId, onComplete }: { source: DataSource; organizationId: string; onComplete: () => void }) => {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ records: number; errors: string[] } | null>(null);
  const { toast } = useToast();

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    setResult(null);

    try {
      const connectorType = typeof source.config?.connector_type === "string"
        ? source.config.connector_type
        : null;
      if (!connectorType) {
        throw new Error("Connector type is not configured for this data source.");
      }

      const { data, error } = await invokeWithRetry<{ records?: number; errors?: string[] }>("connector-pull", {
        body: {
          connector_type: connectorType,
          data_source_id: source.id,
          organization_id: organizationId,
        },
      });
      if (error) throw error;
      if (!data || typeof data.records !== "number" || !Number.isFinite(data.records) || !Array.isArray(data.errors)) {
        throw new Error("Connector returned an incomplete sync result.");
      }

      const syncResult = { records: data.records, errors: data.errors };
      setResult(syncResult);
      const failed = syncResult.errors.length > 0 && syncResult.records === 0;
      const partial = syncResult.errors.length > 0 && syncResult.records > 0;
      toast({
        title: failed
          ? "Sync failed"
          : partial
            ? `Sync partially completed · ${syncResult.records} records`
            : `Synced ${syncResult.records} records`,
        description: syncResult.errors[0],
        variant: failed ? "destructive" : "default",
      });
      onComplete();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown sync error";
      setResult({ records: 0, errors: [message] });
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const failed = Boolean(result && result.errors.length > 0 && result.records === 0);
  const partial = Boolean(result && result.errors.length > 0 && result.records > 0);

  return (
    <div className="mt-3 pt-3 border-t border-border">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline disabled:opacity-50"
      >
        {syncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
        {syncing ? "Syncing..." : "Pull Data Now"}
      </button>
      {result && !syncing && (
        <div className={`mt-2 text-xs flex items-center gap-1.5 ${failed ? "text-destructive" : partial ? "text-warning" : "text-success"}`}>
          {failed ? (
            <><XCircle className="w-3 h-3" /> {result.errors[0]}</>
          ) : partial ? (
            <><AlertCircle className="w-3 h-3" /> {result.records} metrics synced with {result.errors.length} warning{result.errors.length === 1 ? "" : "s"}</>
          ) : (
            <><CheckCircle2 className="w-3 h-3" /> {result.records} metrics synced</>
          )}
        </div>
      )}
    </div>
  );
};

const DataSources = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { tier } = useSubscription();
  const { toast } = useToast();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [syncJobs, setSyncJobs] = useState<Record<string, SyncJob[]>>({});
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<Record<string, string>>({});
  const [jobsLoadingSource, setJobsLoadingSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SourceType>("webhook");
  const [selectedConnector, setSelectedConnector] = useState("stripe");
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ sourceId: string; rawKey: string } | null>(null);

  const fetchSources = async () => {
    if (!currentOrgId) {
      setSources([]);
      setSyncJobs({});
      setSelectedSource(null);
      setSourcesError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSources([]);
    setSyncJobs({});
    setJobsError({});
    setSelectedSource(null);
    setSourcesError(null);

    const { data, error } = await supabase
      .from("data_sources")
      .select("*")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[DataSources] source inventory failed:", error.message);
      setSourcesError(error.message);
      setLoading(false);
      return;
    }

    setSources((data as DataSource[]) ?? []);
    setSourcesError(null);
    setLoading(false);
  };

  const fetchJobs = async (sourceId: string) => {
    if (!currentOrgId) return;
    setJobsLoadingSource(sourceId);
    setJobsError((prev) => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });

    const { data, error } = await supabase
      .from("data_sync_jobs")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("data_source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("[DataSources] sync history failed:", error.message);
      setSyncJobs((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setJobsError((prev) => ({ ...prev, [sourceId]: error.message }));
    } else {
      setSyncJobs((prev) => ({ ...prev, [sourceId]: (data as SyncJob[]) ?? [] }));
    }
    setJobsLoadingSource((current) => current === sourceId ? null : current);
  };

  useEffect(() => {
    void fetchSources();
    // fetchSources intentionally follows the selected organization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  useEffect(() => {
    if (selectedSource) void fetchJobs(selectedSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource, currentOrgId]);

  const handleCreate = async () => {
    if (!currentOrgId || !user || !newName.trim()) return;

    const typeInfo = SOURCE_TYPES.find((sourceType) => sourceType.value === newType);
    if (typeInfo?.tierRequired) {
      const tierOrder = ["starter", "growth", "enterprise"];
      const requiredIdx = tierOrder.indexOf(typeInfo.tierRequired);
      const currentIdx = tier ? tierOrder.indexOf(tier) : -1;
      if (currentIdx < requiredIdx) {
        toast({ title: "Plan upgrade required", description: `${typeInfo.label} connectors require ${typeInfo.tierRequired} plan or higher.`, variant: "destructive" });
        return;
      }
    }

    setCreating(true);
    try {
      let rawKey: string | null = null;
      let keyHash: string | null = null;
      if (newType === "webhook") {
        const randomBytes = new Uint8Array(24);
        crypto.getRandomValues(randomBytes);
        rawKey = `qv_${Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
        const encoded = new TextEncoder().encode(rawKey);
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
        keyHash = Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
      }

      const connectorConfig = newType === "api" ? { connector_type: selectedConnector } : {};
      const { data: inserted, error } = await supabase.from("data_sources").insert({
        organization_id: currentOrgId,
        name: newName.trim(),
        source_type: newType,
        credentials_key_hash: keyHash,
        created_by: user.id,
        config: {
          ...connectorConfig,
          field_mapping: { date: "date", value: "value", region: "region", segment: "segment", metric_type: "metric_type" },
          default_metric_type: "revenue",
        },
      }).select().single();

      if (error || !inserted) {
        throw new Error(error?.message ?? "Data source creation returned no confirmation row.");
      }

      toast({ title: "Data source created", description: rawKey ? "Copy your API key now — it won't be shown again." : undefined });
      if (rawKey) setRevealedKey({ sourceId: inserted.id, rawKey });
      setShowCreate(false);
      setNewName("");
      await fetchSources();
    } catch (error) {
      toast({ title: "Failed to create", description: error instanceof Error ? error.message : "Data source creation failed.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentOrgId) return;
    const { error } = await supabase
      .from("data_sources")
      .delete()
      .eq("id", id)
      .eq("organization_id", currentOrgId);

    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Data source deleted" });
    setSources((current) => current.filter((source) => source.id !== id));
    setSyncJobs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (selectedSource === id) setSelectedSource(null);
    if (revealedKey?.sourceId === id) setRevealedKey(null);
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({ title: "Copy failed", description: "Clipboard access is unavailable in this browser context.", variant: "destructive" });
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "running": return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
      case "failed": return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const webhookBaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const webhookUrl = webhookBaseUrl ? `${webhookBaseUrl}/functions/v1/webhook-ingest` : null;
  const selectedJobs = selectedSource ? syncJobs[selectedSource] : undefined;
  const selectedJobsError = selectedSource ? jobsError[selectedSource] : undefined;
  const selectedJobsLoading = Boolean(selectedSource && jobsLoadingSource === selectedSource);

  return (
    <>
      <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <SidebarMobileToggle />
          <h1 className="text-[18px] font-semibold tracking-tight">Data Sources</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          disabled={loading || !!sourcesError || !currentOrgId}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> Add Source
        </button>
      </header>

      <main className="flex-1 p-8 overflow-auto">
        {revealedKey && (
          <div className="mb-6 p-4 rounded-xl border border-warning/30 bg-warning/10">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-warning" />
              <span className="text-sm font-semibold text-warning">Save your API key — it will never be shown again</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-secondary px-3 py-1.5 rounded flex-1 truncate font-mono">{revealedKey.rawKey}</code>
              <button onClick={() => void copyKey(revealedKey.rawKey)} className="p-1.5 rounded hover:bg-secondary">
                {copiedKey === revealedKey.rawKey ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
              </button>
            </div>
            <button onClick={() => setRevealedKey(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
              I've saved it — dismiss
            </button>
          </div>
        )}

        {showCreate && !sourcesError && (
          <div className="glass-card p-6 rounded-xl mb-6 border border-primary/20">
            <h2 className="text-lg font-semibold tracking-tight mb-4">New Data Source</h2>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              {SOURCE_TYPES.map((sourceType) => {
                const Icon = sourceType.icon;
                const tierOrder = ["starter", "growth", "enterprise"];
                const locked = Boolean(sourceType.tierRequired && (!tier || tierOrder.indexOf(tier) < tierOrder.indexOf(sourceType.tierRequired)));
                return (
                  <button
                    key={sourceType.value}
                    onClick={() => !locked && setNewType(sourceType.value)}
                    className={`p-4 rounded-lg border text-left transition-all ${newType === sourceType.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"} ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">{sourceType.label}</span>
                      {locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                    </div>
                    <p className="text-xs text-muted-foreground">{sourceType.description}</p>
                    {sourceType.tierRequired && <p className="text-xs text-primary mt-1">Requires {sourceType.tierRequired}+</p>}
                  </button>
                );
              })}
            </div>

            {newType === "api" && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Select Connector</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  {CONNECTOR_TYPES.map((connector) => (
                    <button
                      key={connector.value}
                      onClick={() => {
                        setSelectedConnector(connector.value);
                        if (!newName.trim()) setNewName(connector.label);
                      }}
                      className={`p-3 rounded-lg border text-left transition-all ${selectedConnector === connector.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"}`}
                    >
                      <span className="text-sm font-semibold block">{connector.label}</span>
                      <span className="text-xs text-muted-foreground">{connector.desc}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Required secrets:</span>{" "}
                    {CONNECTOR_TYPES.find((connector) => connector.value === selectedConnector)?.secrets.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Configure these in <span className="font-semibold text-foreground">Settings → Secrets</span> before pulling data.
                  </p>
                </div>
              </div>
            )}

            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value.slice(0, 120))}
              placeholder="Source name (e.g., Stripe Revenue)"
              maxLength={120}
              className="w-full max-w-md px-4 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => void handleCreate()}
                disabled={creating || !newName.trim()}
                className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Source"}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sourcesError ? (
          <div className="glass-card p-8 rounded-xl border border-destructive/30 bg-destructive/[0.03]" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Data-source inventory is unavailable</h2>
                <p className="mt-1 text-xs text-muted-foreground">Quantivis could not verify connected sources. It is not presenting this failure as “No data sources.”</p>
                <button onClick={() => void fetchSources()} className="mt-3 text-xs font-semibold text-primary hover:underline">Retry inventory</button>
              </div>
            </div>
          </div>
        ) : sources.length === 0 ? (
          <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center">
            <Database className="w-12 h-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold tracking-tight mb-2">No data sources</h2>
            <p className="text-sm text-muted-foreground mb-4">The source inventory loaded successfully and no sources are configured yet.</p>
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
              Add Your First Source
            </button>
          </div>
        ) : (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {sources.map((source) => (
                <SectionErrorBoundary key={source.id} sectionName="Data Sources">
                  <div
                    onClick={() => setSelectedSource(source.id)}
                    className={`glass-card p-5 rounded-xl cursor-pointer transition-all ${selectedSource === source.id ? "ring-2 ring-primary" : "hover:border-primary/30"}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold">{source.name}</h3>
                        <p className="text-xs text-muted-foreground capitalize">{source.source_type}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${source.status === "active" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                          {source.status}
                        </span>
                        <button
                          onClick={(event) => { event.stopPropagation(); void handleDelete(source.id); }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Delete ${source.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {source.source_type === "webhook" && source.credentials_key_hash && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                          {webhookUrl ? (
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 truncate">{webhookUrl}</code>
                              <button onClick={(event) => { event.stopPropagation(); void copyKey(webhookUrl); }} className="p-1 shrink-0">
                                {copiedKey === webhookUrl ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-warning">Webhook base URL is unavailable in this client configuration.</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">API Key</p>
                          <p className="text-xs text-muted-foreground italic">Key was shown once at creation. If lost, delete and recreate the source.</p>
                        </div>
                      </div>
                    )}

                    {source.source_type === "api" && currentOrgId && (
                      <SyncButton
                        source={source}
                        organizationId={currentOrgId}
                        onComplete={() => {
                          void fetchSources();
                        }}
                      />
                    )}

                    {source.last_synced_at && (
                      <p className="text-xs text-muted-foreground mt-2">Last sync: {new Date(source.last_synced_at).toLocaleString()}</p>
                    )}
                  </div>
                </SectionErrorBoundary>
              ))}
            </div>

            <div className="space-y-4">
              <div className="glass-card p-5 rounded-xl">
                <h3 className="text-sm font-semibold tracking-tight mb-3">{selectedSource ? "Sync History" : "Select a source"}</h3>
                {selectedSource && selectedJobsLoading && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> Verifying sync history…</div>
                )}
                {selectedSource && !selectedJobsLoading && selectedJobsError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3 text-xs" role="alert">
                    <p className="font-semibold">Sync history unavailable</p>
                    <p className="mt-1 text-muted-foreground">This query failure is not being shown as “No sync jobs.”</p>
                    <button onClick={() => void fetchJobs(selectedSource)} className="mt-2 font-semibold text-primary hover:underline">Retry history</button>
                  </div>
                )}
                {selectedSource && !selectedJobsLoading && !selectedJobsError && selectedJobs && selectedJobs.length === 0 && (
                  <p className="text-xs text-muted-foreground">No sync jobs yet</p>
                )}
                <div className="space-y-2">
                  {!selectedJobsLoading && !selectedJobsError && (selectedJobs ?? []).map((job) => (
                    <div key={job.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                      {statusIcon(job.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{job.records_synced} records</p>
                        <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</p>
                      </div>
                      {job.error_message && <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" aria-label={job.error_message} />}
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-5 rounded-xl">
                <h3 className="text-sm font-semibold tracking-tight mb-2">Webhook Quick Start</h3>
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>1. Create a webhook source above</p>
                  <p>2. Copy the URL and API key (shown once)</p>
                  <p>3. POST JSON data with required headers:</p>
                  <pre className="bg-secondary p-2 rounded text-xs overflow-x-auto">
{`POST /webhook-ingest
x-api-key: qv_...
x-request-id: unique-uuid
Content-Type: application/json

[
  { "date": "2025-01-15",
    "value": 42000,
    "metric_type": "revenue",
    "region": "US" }
]`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
};

export default DataSources;
