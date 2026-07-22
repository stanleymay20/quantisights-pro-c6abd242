import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Plus, Database, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface DataSource {
  id: string;
  vendor_key: string;
  vendor_name: string;
  category: string;
  refresh_interval_hours: number;
  last_refreshed_at: string | null;
  next_refresh_at: string | null;
  trust_level: number;
  is_active: boolean;
  last_error: string | null;
  license_type: string;
}

const VENDOR_PRESETS = [
  {
    key: "aicis",
    name: "AICIS — Aggregated Country Intelligence Signals (live)",
    category: "country_intelligence",
    interval: 24,
    license: "quantivis_platform_license",
    trust: 90,
  },
  { key: "worldbank", name: "World Bank Open Data", category: "macro", interval: 168, license: "CC-BY-4.0", trust: 90 },
  { key: "imf", name: "IMF DataMapper", category: "macro", interval: 168, license: "public", trust: 90 },
];

const DataVendors = () => {
  const { toast } = useToast();
  const { currentOrgId } = useOrganization();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  // AICIS has two independent, unreconciled integration paths: this page's
  // "aicis" row is refreshed by ingest-external-signals, while
  // sync-aicis-bridge (surfaced on Bridge Health / AICIS Sync) is the
  // resilience-layer pipeline with circuit breakers and per-surface retry
  // state. A stale external_data_sources.last_error from before the
  // resilience layer started failing can show "Healthy" here while Bridge
  // Health correctly reports a broken circuit — so for the aicis row
  // specifically, also check that authoritative source and let it override
  // an otherwise-stale "Healthy" reading.
  const [aicisDegraded, setAicisDegraded] = useState(false);

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    const [sourcesRes, aicisHealthRes] = await Promise.all([
      supabase
        .from("external_data_sources")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("aicis_sync_surface_status")
        .select("consecutive_failures,circuit_breaker_until")
        .eq("organization_id", currentOrgId),
    ]);
    if (sourcesRes.error) {
      toast({ title: "Failed to load", description: sourcesRes.error.message, variant: "destructive" });
    } else {
      setSources((sourcesRes.data ?? []) as DataSource[]);
    }
    const now = Date.now();
    setAicisDegraded(
      (aicisHealthRes.data ?? []).some(
        (r) => (r.consecutive_failures ?? 0) > 0 || (r.circuit_breaker_until && new Date(r.circuit_breaker_until).getTime() > now),
      ),
    );
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentOrgId]);

  const addPreset = async (preset: typeof VENDOR_PRESETS[number]) => {
    if (!currentOrgId) return;
    const { error } = await supabase.from("external_data_sources").insert({
      organization_id: currentOrgId,
      vendor_key: preset.key,
      vendor_name: preset.name,
      category: preset.category,
      refresh_interval_hours: preset.interval,
      license_type: preset.license,
      trust_level: preset.trust ?? 75,
      is_active: true,
      next_refresh_at: new Date().toISOString(),
    });
    if (error) {
      toast({ title: "Failed to add", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Vendor added", description: preset.name });
      load();
    }
  };

  const refreshSource = async (source: DataSource) => {
    setRefreshing(source.id);
    try {
      const { error } = await invokeWithRetry("ingest-external-signals", {
        body: { mode: "manual", source_id: source.id },
      });
      if (error) throw error;
      toast({ title: "Refresh triggered", description: `${source.vendor_name} updated` });
      await load();
    } catch (err) {
      toast({ title: "Refresh failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setRefreshing(null);
    }
  };

  const toggleActive = async (source: DataSource) => {
    await supabase.from("external_data_sources").update({ is_active: !source.is_active }).eq("id", source.id);
    load();
  };

  const presetsAvailable = VENDOR_PRESETS.filter((p) => !sources.some((s) => s.vendor_key === p.key));

  return (
    <div className="container mx-auto px-6 py-8 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">External Data Vendors</h1>
        <p className="text-muted-foreground">
          Macro and industry signals automatically blended into Layer B context for advisory generation.
        </p>
      </motion.div>

      {/* Add presets */}
      {presetsAvailable.length > 0 && (
        <div className="mb-8 glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick add</h2>
          <div className="flex flex-wrap gap-2">
            {presetsAvailable.map((p) => (
              <Button key={p.key} size="sm" variant="outline" onClick={() => addPreset(p)} className="gap-2">
                <Plus className="w-3.5 h-3.5" /> {p.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : sources.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <Database className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No external data vendors configured yet. Add one above to enrich advisory context with macro signals.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sources.map((s) => (
            <div key={s.id} className="glass-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{s.vendor_name}</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary uppercase tracking-wider">{s.category}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary uppercase">Trust {s.trust_level}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>License: {s.license_type} · Refresh every {s.refresh_interval_hours}h</div>
                    {s.last_refreshed_at && <div>Last refreshed: {format(new Date(s.last_refreshed_at), "PPp")}</div>}
                    {s.last_error && (
                      <div className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle className="w-3 h-3" /> {s.last_error}
                      </div>
                    )}
                    {s.vendor_key === "aicis" && aicisDegraded && (
                      <div className="flex items-center gap-1.5 text-warning">
                        <AlertTriangle className="w-3 h-3" /> Resilience-layer sync is failing — see{" "}
                        <a href="/admin/bridge-health" className="underline font-medium">Bridge Health</a> for details
                      </div>
                    )}
                    {!s.last_error && s.last_refreshed_at && !(s.vendor_key === "aicis" && aicisDegraded) && (
                      <div className="flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="w-3 h-3" /> Healthy
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleActive(s)}>
                    {s.is_active ? "Pause" : "Resume"}
                  </Button>
                  <Button size="sm" onClick={() => refreshSource(s)} disabled={refreshing === s.id} className="gap-2">
                    {refreshing === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Refresh now
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataVendors;
