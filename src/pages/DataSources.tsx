import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  Database, Globe, Webhook, FileSpreadsheet, Plus, Copy, Check,
  RefreshCw, Trash2, Clock, AlertCircle, CheckCircle2, XCircle, Lock, Eye, EyeOff, Play
} from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

type SourceType = "csv" | "webhook" | "api" | "database";

interface DataSource {
  id: string;
  name: string;
  source_type: string;
  status: string;
  config: any;
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
      const { data, error } = await invokeWithRetry<{ records?: number; errors?: string[] }>("connector-pull", {
        body: {
          connector_type: (source.config as any)?.connector_type || "stripe",
          data_source_id: source.id,
          organization_id: organizationId,
        },
      });
      if (error) throw error;
      const syncResult = { records: data?.records || 0, errors: data?.errors || [] };
      setResult(syncResult);
      toast({
        title: syncResult.errors.length > 0 && syncResult.records === 0
          ? "Sync failed"
          : `Synced ${syncResult.records} records`,
        description: syncResult.errors.length > 0 ? syncResult.errors[0] : undefined,
        variant: syncResult.errors.length > 0 && syncResult.records === 0 ? "destructive" : "default",
      });
      onComplete();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setResult({ records: 0, errors: [msg] });
      toast({ title: "Sync failed", description: msg, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

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
        <div className={`mt-2 text-xs flex items-center gap-1.5 ${result.errors.length > 0 && result.records === 0 ? "text-destructive" : "text-success"}`}>
          {result.errors.length > 0 && result.records === 0
            ? <><XCircle className="w-3 h-3" /> {result.errors[0]}</>
            : <><CheckCircle2 className="w-3 h-3" /> {result.records} metrics synced{result.errors.length > 0 ? ` (${result.errors.length} warnings)` : ""}</>
          }
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
  const navigate = useNavigate();

  const [sources, setSources] = useState<DataSource[]>([]);
  const [syncJobs, setSyncJobs] = useState<Record<string, SyncJob[]>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SourceType>("webhook");
  const [selectedConnector, setSelectedConnector] = useState("stripe");
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  // Newly created key shown once
  const [revealedKey, setRevealedKey] = useState<{ sourceId: string; rawKey: string } | null>(null);

  const fetchSources = async () => {
    if (!currentOrgId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("data_sources")
      .select("*")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false });
    setSources((data as DataSource[]) || []);
    setLoading(false);
  };

  const fetchJobs = async (sourceId: string) => {
    const { data } = await supabase
      .from("data_sync_jobs")
      .select("*")
      .eq("data_source_id", sourceId)
      .order("created_at", { ascending: false })
      .limit(10);
    setSyncJobs((prev) => ({ ...prev, [sourceId]: (data as SyncJob[]) || [] }));
  };

  useEffect(() => { fetchSources(); }, [currentOrgId]);
  useEffect(() => { if (selectedSource) fetchJobs(selectedSource); }, [selectedSource]);

  const handleCreate = async () => {
    if (!currentOrgId || !user || !newName.trim()) return;

    const typeInfo = SOURCE_TYPES.find((t) => t.value === newType);
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

    // Generate raw key and hash it
    let rawKey: string | null = null;
    let keyHash: string | null = null;
    if (newType === "webhook") {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      rawKey = "qv_";
      for (let i = 0; i < 32; i++) rawKey += chars.charAt(Math.floor(Math.random() * chars.length));
      // SHA256 hash in browser
      const encoded = new TextEncoder().encode(rawKey);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
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

    if (error) {
      toast({ title: "Failed to create", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Data source created", description: rawKey ? "Copy your API key now — it won't be shown again." : undefined });
      if (rawKey && inserted) {
        setRevealedKey({ sourceId: inserted.id, rawKey });
      }
      setShowCreate(false);
      setNewName("");
      fetchSources();
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("data_sources").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Data source deleted" });
      setSources((s) => s.filter((src) => src.id !== id));
      if (selectedSource === id) setSelectedSource(null);
      if (revealedKey?.sourceId === id) setRevealedKey(null);
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "running": return <RefreshCw className="w-4 h-4 text-primary animate-spin" />;
      case "failed": return <XCircle className="w-4 h-4 text-destructive" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/webhook-ingest`;

  return (
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Data Sources</h1>
          </div>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
            <Plus className="w-4 h-4" /> Add Source
          </button>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          {/* Revealed key banner */}
          {revealedKey && (
            <div className="mb-6 p-4 rounded-xl border border-warning/30 bg-warning/10">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-warning" />
                <span className="text-sm font-semibold text-warning">Save your API key — it will never be shown again</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-secondary px-3 py-1.5 rounded flex-1 truncate font-mono">{revealedKey.rawKey}</code>
                <button onClick={() => copyKey(revealedKey.rawKey)} className="p-1.5 rounded hover:bg-secondary">
                  {copiedKey === revealedKey.rawKey ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>
              <button onClick={() => setRevealedKey(null)} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
                I've saved it — dismiss
              </button>
            </div>
          )}

          {/* Create modal */}
          {showCreate && (
            <div className="glass-card p-6 rounded-xl mb-6 border border-primary/20">
              <h2 className="text-lg font-semibold tracking-tight mb-4">New Data Source</h2>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {SOURCE_TYPES.map((st) => {
                  const Icon = st.icon;
                  const locked = st.tierRequired && (!tier || ["starter", "growth", "enterprise"].indexOf(tier) < ["starter", "growth", "enterprise"].indexOf(st.tierRequired));
                  return (
                    <button key={st.value} onClick={() => !locked && setNewType(st.value)}
                      className={`p-4 rounded-lg border text-left transition-all ${newType === st.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"} ${locked ? "opacity-50 cursor-not-allowed" : ""}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="w-4 h-4 text-primary" />
                        <span className="text-sm font-semibold">{st.label}</span>
                        {locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{st.description}</p>
                      {st.tierRequired && <p className="text-xs text-primary mt-1">Requires {st.tierRequired}+</p>}
                    </button>
                  );
                })}
              </div>

              {/* Connector type selector for API sources */}
              {newType === "api" && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Select Connector</p>
                  <div className="grid sm:grid-cols-3 gap-2">
                    {CONNECTOR_TYPES.map((ct) => (
                      <button
                        key={ct.value}
                        onClick={() => {
                          setSelectedConnector(ct.value);
                          if (!newName.trim()) setNewName(ct.label);
                        }}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          selectedConnector === ct.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/30"
                        }`}
                      >
                        <span className="text-sm font-semibold block">{ct.label}</span>
                        <span className="text-xs text-muted-foreground">{ct.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Required secrets:</span>{" "}
                      {CONNECTOR_TYPES.find(c => c.value === selectedConnector)?.secrets.join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure these in <span className="font-semibold text-foreground">Settings → Secrets</span> before pulling data.
                    </p>
                  </div>
                </div>
              )}

              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Source name (e.g., Stripe Revenue)"
                className="w-full max-w-md px-4 py-2 rounded-lg bg-secondary border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 mb-4" />
              <div className="flex gap-3">
                <button onClick={handleCreate} disabled={creating || !newName.trim()}
                  className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50">
                  {creating ? "Creating..." : "Create Source"}
                </button>
                <button onClick={() => setShowCreate(false)}
                  className="px-5 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-secondary transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Sources list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sources.length === 0 ? (
            <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center">
              <Database className="w-12 h-12 text-muted-foreground mb-4" />
              <h2 className="text-lg font-semibold tracking-tight mb-2">No data sources</h2>
              <p className="text-sm text-muted-foreground mb-4">Create a webhook endpoint or connector to start ingesting data.</p>
              <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all">
                Add Your First Source
              </button>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {sources.map((src) => {
                  const Icon = SOURCE_TYPES.find((t) => t.value === src.source_type)?.icon || Database;
                  return (
    <SectionErrorBoundary sectionName="Data Sources">
                    <div key={src.id} onClick={() => setSelectedSource(src.id)}
                      className={`glass-card p-5 rounded-xl cursor-pointer transition-all ${selectedSource === src.id ? "ring-2 ring-primary" : "hover:border-primary/30"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <h3 className="text-sm font-semibold">{src.name}</h3>
                            <p className="text-xs text-muted-foreground capitalize">{src.source_type}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${src.status === "active" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                            {src.status}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(src.id); }}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {src.source_type === "webhook" && src.credentials_key_hash && (
                        <div className="space-y-2 mt-3 pt-3 border-t border-border">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                            <div className="flex items-center gap-2">
                              <code className="text-xs bg-secondary px-2 py-1 rounded flex-1 truncate">{webhookUrl}</code>
                              <button onClick={(e) => { e.stopPropagation(); copyKey(webhookUrl); }} className="p-1 shrink-0">
                                {copiedKey === webhookUrl ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">API Key</p>
                            <p className="text-xs text-muted-foreground italic">Key was shown once at creation. If lost, delete and recreate the source.</p>
                          </div>
                        </div>
                      )}

                      {src.source_type === "api" && (
                        <SyncButton
                          source={src}
                          organizationId={currentOrgId!}
                          onComplete={() => {
                            fetchSources();
                            if (selectedSource === src.id) fetchJobs(src.id);
                          }}
                        />
                      )}

                      {src.last_synced_at && (
                        <p className="text-xs text-muted-foreground mt-2">Last sync: {new Date(src.last_synced_at).toLocaleString()}</p>
                      )}
                    </div>
    </SectionErrorBoundary>
                  );
                })}
              </div>

              {/* Sync jobs panel */}
              <div className="space-y-4">
                <div className="glass-card p-5 rounded-xl">
                  <h3 className="text-sm font-semibold tracking-tight mb-3">{selectedSource ? "Sync History" : "Select a source"}</h3>
                  {selectedSource && (syncJobs[selectedSource] || []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No sync jobs yet</p>
                  )}
                  <div className="space-y-2">
                    {(syncJobs[selectedSource || ""] || []).map((job) => (
                      <div key={job.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                        {statusIcon(job.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{job.records_synced} records</p>
                          <p className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</p>
                        </div>
                        {job.error_message && (
                          <span title={job.error_message}>
                            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                          </span>
                        )}
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
