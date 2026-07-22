import { useState, useEffect, useMemo } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { Database, ArrowRight, FileText, Target, BarChart3, Loader2, GitCommitVertical, Layers } from "lucide-react";
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
  const [sources, setSources] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [metricTypes, setMetricTypes] = useState<string[]>([]);
  const [rawCount, setRawCount] = useState(0);
  const [datasetInfo, setDatasetInfo] = useState<{ name: string; row_count: number | null; column_mapping: any | null } | null>(null);

  useEffect(() => {
    if (!currentOrgId) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);

      // Fetch dataset info for lineage
      const fetchDatasetInfo = async () => {
        if (!activeDatasetId) return null;
        const { data } = await supabase
          .from("datasets")
          .select("name, row_count, column_mapping")
          .eq("id", activeDatasetId)
          .single();
        return data;
      };

      let metricsQuery = supabase.from("metrics").select("metric_type").eq("organization_id", currentOrgId);
      if (activeDatasetId) {
        metricsQuery = metricsQuery.eq("dataset_id", activeDatasetId);
      }

      // Raw records count for the dataset
      const rawQuery = activeDatasetId
        ? supabase.from("raw_records").select("*", { count: "exact", head: true }).eq("dataset_id", activeDatasetId)
        : Promise.resolve({ count: 0, data: null, error: null });

      const [srcRes, kpiRes, decRes, metRes, rawRes, dsInfo] = await Promise.all([
        supabase.from("data_sources").select("id, name, source_type, status").eq("organization_id", currentOrgId),
        supabase.from("kpis").select("id, name, formula, metric_dependencies").eq("organization_id", currentOrgId).eq("status", "active"),
        supabase.from("decision_ledger").select("id, recommended_action, decision_status, kpi_id").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(20),
        metricsQuery,
        rawQuery,
        fetchDatasetInfo(),
      ]);
      setSources(srcRes.data || []);
      setKpis(kpiRes.data || []);
      setDecisions(decRes.data || []);
      const uniqueTypes: string[] = [...new Set((metRes.data || []).map((m: { metric_type: string }) => m.metric_type))];
      setMetricTypes(uniqueTypes);
      setRawCount((rawRes as { count?: number }).count ?? 0);
      setDatasetInfo(dsInfo);
      setLoading(false);
    };
    load();
  }, [currentOrgId, activeDatasetId]);

  const { nodes, edges } = useMemo(() => {
    const n: LineageNode[] = [];
    const e: LineageEdge[] = [];

    // Dataset source node
    if (datasetInfo) {
      n.push({
        id: "dataset-source",
        type: "source",
        label: datasetInfo.name,
        detail: `${datasetInfo.row_count?.toLocaleString() ?? "?"} rows uploaded`,
        count: datasetInfo.row_count ?? undefined,
      });
    }

    // Sources
    sources.forEach(s => {
      n.push({ id: `src-${s.id}`, type: "source", label: s.name, detail: s.source_type, status: s.status });
    });

    // Raw layer
    if (rawCount > 0) {
      n.push({ id: "raw-layer", type: "raw", label: "Raw Records", detail: `${rawCount.toLocaleString()} immutable records`, count: rawCount });
      if (datasetInfo) e.push({ from: "dataset-source", to: "raw-layer" });
      sources.forEach(s => e.push({ from: `src-${s.id}`, to: "raw-layer" }));
    }

    // Metrics (from column mapping if available)
    metricTypes.forEach(mt => {
      const id = `met-${mt}`;
      const displayName = mt.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      n.push({ id, type: "metric", label: displayName, detail: "Normalized metric" });
      if (rawCount > 0) {
        e.push({ from: "raw-layer", to: id });
      } else {
        sources.forEach(s => e.push({ from: `src-${s.id}`, to: id }));
        if (datasetInfo) e.push({ from: "dataset-source", to: id });
      }
    });

    // KPIs
    kpis.forEach(k => {
      const id = `kpi-${k.id}`;
      n.push({ id, type: "kpi", label: k.name, detail: k.formula });
      const deps = Array.isArray(k.metric_dependencies) ? k.metric_dependencies : [];
      deps.forEach((dep: string) => {
        if (metricTypes.includes(dep)) e.push({ from: `met-${dep}`, to: id });
      });
      if (deps.length === 0) metricTypes.forEach(mt => e.push({ from: `met-${mt}`, to: id }));
    });

    // Decisions
    decisions.forEach(d => {
      const id = `dec-${d.id}`;
      n.push({ id, type: "decision", label: d.recommended_action?.slice(0, 40) || "Decision", detail: d.decision_status, status: d.decision_status });
      if (d.kpi_id) e.push({ from: `kpi-${d.kpi_id}`, to: id });
      else kpis.forEach(k => e.push({ from: `kpi-${k.id}`, to: id }));
    });

    return { nodes: n, edges: e };
  }, [sources, metricTypes, kpis, decisions, rawCount, datasetInfo]);

  const layerKeys = ["source", "raw", "metric", "kpi", "decision"];
  const layerLabels = ["Data Sources", "Raw Layer", "Clean Metrics", "KPI Formulas", "Decisions"];
  const layers: Record<string, LineageNode[]> = Object.fromEntries(
    layerKeys.map(k => [k, nodes.filter(n => n.type === k)])
  );

  return (
    <DatasetRequired moduleName="Data Lineage">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <GitCommitVertical className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Data Lineage</h1>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto space-y-6">
          <DataPipelineStatus orgId={currentOrgId} datasetId={activeDatasetId} />

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : nodes.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No data lineage to display. Upload data and create KPIs first.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {/* Legend */}
              <div className="flex gap-4 mb-6 flex-wrap">
                {layerKeys.map((key, i) => {
                  const style = NODE_STYLES[key];
                  const Icon = style.icon;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className={`w-6 h-6 rounded flex items-center justify-center ${style.bg} border ${style.border}`}>
                        <Icon className="w-3 h-3" />
                      </div>
                      {layerLabels[i]}
                    </div>
                  );
                })}
              </div>

              {/* Column mapping lineage */}
              {datasetInfo?.column_mapping && (
                <Card className="mb-4">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Column Mapping Lineage</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {Object.entries(datasetInfo.column_mapping as Record<string, string>).map(([key, target]) => {
                        const parts = key.split(":");
                        const colName = parts.length > 1 ? parts.slice(1).join(":") : key;
                        return (
                          <div key={key} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-muted/30 border border-border/20">
                            <span className="font-mono truncate text-muted-foreground">{colName}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                            <Badge variant={target === "skip" ? "outline" : "secondary"} className="text-[10px] capitalize shrink-0">
                              {target}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Layered graph */}
              <div className="flex gap-6 overflow-x-auto pb-4">
                {layerKeys.map((key, layerIdx) => (
                  <div key={key} className="flex items-start gap-4">
                    <div className="space-y-3 min-w-[200px]">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{layerLabels[layerIdx]}</p>
                      {(layers[key]?.length ?? 0) === 0 ? (
                        <p className="text-xs text-muted-foreground/50 italic">None</p>
                      ) : (
                        layers[key].map(node => {
                          const style = NODE_STYLES[node.type];
                          const Icon = style.icon;
                          return (
    <SectionErrorBoundary sectionName="Data Lineage">
                            <Card key={node.id} className={`border ${style.border} ${style.bg}`}>
                              <CardContent className="p-3 flex items-start gap-2">
                                <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold truncate capitalize">{node.label}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{node.detail}</p>
                                  {node.status && (
                                    <Badge variant="outline" className="text-[9px] mt-1 capitalize">{node.status}</Badge>
                                  )}
                                  {node.count != null && (
                                    <p className="text-[9px] text-muted-foreground mt-0.5">{node.count.toLocaleString()} records</p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
    </SectionErrorBoundary>
                          );
                        })
                      )}
                    </div>
                    {layerIdx < layerKeys.length - 1 && (
                      <div className="flex items-center pt-10">
                        <ArrowRight className="w-5 h-5 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Stats */}
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
