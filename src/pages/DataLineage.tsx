import { useState, useEffect, useMemo } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { Database, ArrowRight, FileText, Target, BarChart3, Loader2, GitCommitVertical, Layers, AlertTriangle, RefreshCw } from "lucide-react";
import DataPipelineStatus from "@/components/dashboard/DataPipelineStatus";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface LineageNode {
  id: string;
  type: "source" | "raw" | "metric" | "kpi" | "decision";
  label: string;
  detail: string;
  status?: string;
  count?: number;
}

interface LineageEdge {
  from: string;
  to: string;
}

const NODE_STYLES: Record<string, { icon: React.ElementType; bg: string; border: string }> = {
  source: { icon: Database, bg: "bg-primary/10", border: "border-primary/30" },
  raw: { icon: Layers, bg: "bg-secondary/50", border: "border-border/40" },
  metric: { icon: BarChart3, bg: "bg-success/10", border: "border-success/30" },
  kpi: { icon: Target, bg: "bg-primary/10", border: "border-primary/30" },
  decision: { icon: FileText, bg: "bg-warning/10", border: "border-warning/30" },
};

const DataLineage = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [evidenceReady, setEvidenceReady] = useState(false);
  const [sources, setSources] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [metricTypes, setMetricTypes] = useState<string[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [datasetInfo, setDatasetInfo] = useState<{ name: string; row_count: number | null; column_mapping: any | null } | null>(null);

  const clearEvidence = () => {
    setSources([]);
    setKpis([]);
    setDecisions([]);
    setMetricTypes([]);
    setRawCount(0);
    setDatasetInfo(null);
    setEvidenceReady(false);
  };

  const load = async () => {
    if (!currentOrgId || !activeDatasetId) {
      clearEvidence();
      setLoadError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError(null);
    setEvidenceReady(false);

    const metricsQuery = supabase
      .from("metrics")
      .select("metric_type")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", activeDatasetId);

    const [srcRes, kpiRes, decRes, metRes, rawRes, datasetRes] = await Promise.all([
      supabase.from("data_sources").select("id, name, source_type, status").eq("organization_id", currentOrgId),
      supabase.from("kpis").select("id, name, formula, metric_dependencies").eq("organization_id", currentOrgId).eq("status", "active"),
      supabase.from("decision_ledger").select("id, recommended_action, decision_status, kpi_id").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(20),
      metricsQuery,
      supabase.from("raw_records").select("id", { count: "exact", head: true }).eq("organization_id", currentOrgId).eq("dataset_id", activeDatasetId),
      supabase.from("datasets").select("name, row_count, column_mapping").eq("organization_id", currentOrgId).eq("id", activeDatasetId).maybeSingle(),
    ]);

    const failures = [
      ["data sources", srcRes.error],
      ["KPIs", kpiRes.error],
      ["decisions", decRes.error],
      ["metrics", metRes.error],
      ["raw records", rawRes.error],
      ["dataset", datasetRes.error],
    ].filter(([, error]) => Boolean(error)) as Array<[string, { message?: string }]>;

    if (failures.length > 0) {
      clearEvidence();
      setLoadError(`Unable to verify lineage evidence for ${failures.map(([name]) => name).join(", ")}. Quantivis is withholding lineage counts and graph claims until all provenance reads succeed.`);
      setLoading(false);
      return;
    }

    if (!datasetRes.data) {
      clearEvidence();
      setLoadError("The active dataset could not be verified in the current organization. Lineage is unavailable rather than assumed empty.");
      setLoading(false);
      return;
    }

    setSources(srcRes.data || []);
    setKpis(kpiRes.data || []);
    setDecisions(decRes.data || []);
    setMetricTypes([...new Set((metRes.data || []).map((metric: { metric_type: string }) => metric.metric_type))]);
    setRawCount(rawRes.count ?? 0);
    setDatasetInfo(datasetRes.data);
    setEvidenceReady(true);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, activeDatasetId]);

  const { nodes, edges } = useMemo(() => {
    if (!evidenceReady) return { nodes: [] as LineageNode[], edges: [] as LineageEdge[] };

    const nodes: LineageNode[] = [];
    const edges: LineageEdge[] = [];

    if (datasetInfo) {
      nodes.push({
        id: "dataset-source",
        type: "source",
        label: datasetInfo.name,
        detail: `${datasetInfo.row_count?.toLocaleString() ?? "?"} rows uploaded`,
        count: datasetInfo.row_count ?? undefined,
      });
    }

    sources.forEach(source => {
      nodes.push({ id: `src-${source.id}`, type: "source", label: source.name, detail: source.source_type, status: source.status });
    });

    if (rawCount > 0) {
      nodes.push({ id: "raw-layer", type: "raw", label: "Raw Records", detail: `${rawCount.toLocaleString()} immutable records`, count: rawCount });
      if (datasetInfo) edges.push({ from: "dataset-source", to: "raw-layer" });
      sources.forEach(source => edges.push({ from: `src-${source.id}`, to: "raw-layer" }));
    }

    metricTypes.forEach(metricType => {
      const id = `met-${metricType}`;
      const displayName = metricType.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
      nodes.push({ id, type: "metric", label: displayName, detail: "Normalized metric" });
      if (rawCount > 0) {
        edges.push({ from: "raw-layer", to: id });
      } else {
        sources.forEach(source => edges.push({ from: `src-${source.id}`, to: id }));
        if (datasetInfo) edges.push({ from: "dataset-source", to: id });
      }
    });

    kpis.forEach(kpi => {
      const id = `kpi-${kpi.id}`;
      nodes.push({ id, type: "kpi", label: kpi.name, detail: kpi.formula });
      const dependencies = Array.isArray(kpi.metric_dependencies) ? kpi.metric_dependencies : [];
      dependencies.forEach((dependency: string) => {
        if (metricTypes.includes(dependency)) edges.push({ from: `met-${dependency}`, to: id });
      });
      if (dependencies.length === 0) metricTypes.forEach(metricType => edges.push({ from: `met-${metricType}`, to: id }));
    });

    decisions.forEach(decision => {
      const id = `dec-${decision.id}`;
      nodes.push({ id, type: "decision", label: decision.recommended_action?.slice(0, 40) || "Decision", detail: decision.decision_status, status: decision.decision_status });
      if (decision.kpi_id) edges.push({ from: `kpi-${decision.kpi_id}`, to: id });
      else kpis.forEach(kpi => edges.push({ from: `kpi-${kpi.id}`, to: id }));
    });

    return { nodes, edges };
  }, [evidenceReady, sources, metricTypes, kpis, decisions, rawCount, datasetInfo]);

  const layerKeys = ["source", "raw", "metric", "kpi", "decision"];
  const layerLabels = ["Data Sources", "Raw Layer", "Clean Metrics", "KPI Formulas", "Decisions"];
  const layers: Record<string, LineageNode[]> = Object.fromEntries(layerKeys.map(key => [key, nodes.filter(node => node.type === key)]));

  return (
    <DatasetRequired moduleName="Data Lineage">
      <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <GitCommitVertical className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Data Lineage</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </header>

        <main className="flex-1 p-8 overflow-auto space-y-6">
          <DataPipelineStatus orgId={currentOrgId} datasetId={activeDatasetId} />

          {loadError && (
            <Card className="border-destructive/30 bg-destructive/[0.03]">
              <CardContent className="p-5 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">Lineage evidence unavailable</p>
                  <p className="text-sm text-muted-foreground mt-1">{loadError}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : !evidenceReady ? null : nodes.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">Lineage verification succeeded, but this dataset currently has no lineage nodes to display.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-4 mb-6 flex-wrap">
                {layerKeys.map((key, index) => {
                  const style = NODE_STYLES[key];
                  const Icon = style.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className={`w-6 h-6 rounded flex items-center justify-center ${style.bg} border ${style.border}`}><Icon className="w-3 h-3" /></div>
                      {layerLabels[index]}
                    </div>
                  );
                })}
              </div>

              {datasetInfo?.column_mapping && (
                <Card className="mb-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Column Mapping Lineage</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {Object.entries(datasetInfo.column_mapping as Record<string, string>).map(([key, target]) => {
                        const parts = key.split(":");
                        const columnName = parts.length > 1 ? parts.slice(1).join(":") : key;
                        return (
                          <div key={key} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30 border border-border/20">
                            <span className="font-mono truncate text-muted-foreground">{columnName}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            <Badge variant={target === "skip" ? "outline" : "secondary"} className="text-[10px] capitalize shrink-0">{target}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-6 overflow-x-auto pb-4">
                {layerKeys.map((key, layerIndex) => (
                  <div key={key} className="flex items-start gap-4">
                    <div className="space-y-3 min-w-[200px]">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{layerLabels[layerIndex]}</p>
                      {(layers[key]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground/50 italic">None verified</p>
                      ) : (
                        layers[key].map(node => {
                          const style = NODE_STYLES[node.type];
                          const Icon = style.icon;
                          return (
                            <SectionErrorBoundary key={node.id} sectionName="Data Lineage">
                              <Card className={`border ${style.border} ${style.bg}`}>
                                <CardContent className="p-3 flex items-start gap-2">
                                  <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate capitalize">{node.label}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">{node.detail}</p>
                                    {node.status && <Badge variant="outline" className="text-[9px] mt-1 capitalize">{node.status}</Badge>}
                                    {node.count != null && <p className="text-[9px] text-muted-foreground mt-0.5">{node.count.toLocaleString()} records</p>}
                                  </div>
                                </CardContent>
                              </Card>
                            </SectionErrorBoundary>
                          );
                        })
                      )}
                    </div>
                    {layerIndex < layerKeys.length - 1 && <div className="flex items-center pt-10"><ArrowRight className="w-5 h-5 text-muted-foreground/30" /></div>}
                  </div>
                ))}
              </div>

              <Card className="mt-6">
                <CardContent className="p-4 flex gap-8 flex-wrap">
                  <div><span className="text-2xl font-bold">{sources.length + (datasetInfo ? 1 : 0)}</span><span className="text-xs text-muted-foreground ml-1">Sources</span></div>
                  <div><span className="text-2xl font-bold">{rawCount.toLocaleString()}</span><span className="text-xs text-muted-foreground ml-1">Raw Records</span></div>
                  <div><span className="text-2xl font-bold">{metricTypes.length}</span><span className="text-xs text-muted-foreground ml-1">Metric Types</span></div>
                  <div><span className="text-2xl font-bold">{kpis.length}</span><span className="text-xs text-muted-foreground ml-1">Active KPIs</span></div>
                  <div><span className="text-2xl font-bold">{decisions.length}</span><span className="text-xs text-muted-foreground ml-1">Decisions</span></div>
                  <div><span className="text-2xl font-bold">{edges.length}</span><span className="text-xs text-muted-foreground ml-1">Lineage Links</span></div>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </>
    </DatasetRequired>
  );
};

export default DataLineage;