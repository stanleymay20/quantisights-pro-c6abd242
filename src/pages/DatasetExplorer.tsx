import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import {
  Database, Table2, Columns3, BarChart3, RefreshCw, ChevronRight,
  Hash, Calendar, Type, ArrowUpDown, Layers, Eye, Upload, AlertTriangle,
} from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { IQScoreBadge } from "@/components/quality/IQScoreBadge";
import { Button } from "@/components/ui/button";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { toast } from "@/hooks/use-toast";

interface DatasetRecord {
  id: string;
  name: string;
  status: string;
  row_count: number | null;
  created_at: string;
  file_path: string | null;
  column_mapping: any | null;
  is_stale: boolean | null;
  organization_id: string;
  data_source_id: string | null;
}

interface ColumnStat {
  name: string;
  type: "numeric" | "text" | "date" | "unknown";
  nonNull: number;
  unique: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  sample: (string | number | null)[];
}

const DatasetExplorer = () => {
  const { currentOrgId } = useOrganization();
  const navigate = useNavigate();
  const { activeDatasetId } = useProject();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [datasetsError, setDatasetsError] = useState<string | null>(null);
  const [datasetsReady, setDatasetsReady] = useState(false);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsReady, setMetricsReady] = useState(false);
  const [view, setView] = useState<"schema" | "sample" | "stats">("schema");

  const fetchDatasets = useCallback(async () => {
    if (!currentOrgId) {
      setDatasets([]);
      setSelectedId(null);
      setDatasetsReady(false);
      setDatasetsError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setDatasetsError(null);
    setDatasetsReady(false);
    const { data, error } = await supabase
      .from("datasets")
      .select("id, name, status, row_count, created_at, file_path, column_mapping, is_stale, organization_id, data_source_id")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false });

    if (error) {
      setDatasets([]);
      setSelectedId(null);
      setDatasetsError(`Unable to verify datasets: ${error.message}`);
    } else {
      setDatasets((data as DatasetRecord[]) || []);
      setDatasetsReady(true);
    }
    setLoading(false);
  }, [currentOrgId]);

  useEffect(() => {
    void fetchDatasets();
  }, [fetchDatasets]);

  useEffect(() => {
    if (!datasetsReady) return;
    if (selectedId && datasets.some(dataset => dataset.id === selectedId)) return;
    if (activeDatasetId && datasets.some(dataset => dataset.id === activeDatasetId)) {
      setSelectedId(activeDatasetId);
    } else {
      setSelectedId(datasets[0]?.id ?? null);
    }
  }, [datasets, activeDatasetId, selectedId, datasetsReady]);

  const fetchMetrics = useCallback(async () => {
    if (!selectedId || !currentOrgId || !datasetsReady) {
      setMetrics([]);
      setMetricsError(null);
      setMetricsReady(false);
      setMetricsLoading(false);
      return;
    }

    setMetrics([]);
    setMetricsError(null);
    setMetricsReady(false);
    setMetricsLoading(true);
    const { data, error } = await supabase
      .from("metrics")
      .select("id, metric_type, value, date, region, segment, created_at")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", selectedId)
      .order("date", { ascending: true })
      .limit(1000);

    if (error) {
      setMetrics([]);
      setMetricsError(`Unable to verify metric rows for this dataset: ${error.message}`);
    } else {
      setMetrics(data || []);
      setMetricsReady(true);
    }
    setMetricsLoading(false);
  }, [selectedId, currentOrgId, datasetsReady]);

  useEffect(() => {
    void fetchMetrics();
  }, [fetchMetrics]);

  const selected = datasetsReady ? datasets.find(dataset => dataset.id === selectedId) : undefined;

  const columnStats = useMemo((): ColumnStat[] => {
    if (!metricsReady || metrics.length === 0) return [];
    const columns: ColumnStat[] = [];

    const types = metrics.map(metric => metric.metric_type);
    const uniqueTypes = [...new Set(types)];
    columns.push({ name: "metric_type", type: "text", nonNull: types.filter(Boolean).length, unique: uniqueTypes.length, sample: uniqueTypes.slice(0, 5) });

    const values = metrics.map(metric => Number(metric.value)).filter(Number.isFinite);
    if (values.length > 0) {
      columns.push({
        name: "value",
        type: "numeric",
        nonNull: values.length,
        unique: new Set(values).size,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((sum, value) => sum + value, 0) / values.length,
        sample: values.slice(0, 5),
      });
    }

    const dates = metrics.map(metric => metric.date).filter(Boolean);
    if (dates.length > 0) {
      columns.push({ name: "date", type: "date", nonNull: dates.length, unique: new Set(dates).size, min: dates[0], max: dates[dates.length - 1], sample: dates.slice(0, 5) });
    }

    const regions = metrics.map(metric => metric.region).filter(Boolean);
    if (regions.length > 0) columns.push({ name: "region", type: "text", nonNull: regions.length, unique: new Set(regions).size, sample: [...new Set(regions)].slice(0, 5) });

    const segments = metrics.map(metric => metric.segment).filter(Boolean);
    if (segments.length > 0) columns.push({ name: "segment", type: "text", nonNull: segments.length, unique: new Set(segments).size, sample: [...new Set(segments)].slice(0, 5) });

    return columns;
  }, [metrics, metricsReady]);

  const sampleRows = useMemo(() => metricsReady ? metrics.slice(0, 50) : [], [metrics, metricsReady]);

  const colIcon = (type: string) => {
    switch (type) {
      case "numeric": return <Hash className="w-3.5 h-3.5 text-primary" />;
      case "date": return <Calendar className="w-3.5 h-3.5 text-accent-foreground" />;
      case "text": return <Type className="w-3.5 h-3.5 text-muted-foreground" />;
      default: return <Columns3 className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  const recomputeIq = async () => {
    if (!selected) return;
    const pendingToast = toast({ title: "Computing IQ score…", description: "Scoring 7 dimensions" });
    const { data, error } = await invokeWithRetry<any>("compute-iq-score", {
      body: { organization_id: selected.organization_id, dataset_id: selected.id },
    });
    pendingToast.dismiss();

    const composite = Number(data?.composite);
    if (error || data?.error || !Number.isFinite(composite)) {
      toast({
        title: "IQ score failed",
        description: error?.message ?? data?.error ?? "The scoring service returned no verified composite score.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: `IQ composite: ${composite}/100`, description: "Reload to see the updated grade." });
  };

  return (
    <SectionErrorBoundary sectionName="Dataset Explorer">
      <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Database className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Dataset Explorer</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">{datasetsReady ? `${datasets.length} dataset${datasets.length !== 1 ? "s" : ""}` : "Datasets unverified"}</Badge>
            <Button variant="outline" size="sm" onClick={() => void fetchDatasets()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </header>

        <main className="flex-1 flex overflow-hidden">
          <div className="w-64 border-r border-border/30 bg-card/30 overflow-y-auto shrink-0">
            <div className="p-3 border-b border-border/20"><p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Datasets</p></div>
            {loading ? (
              <div className="p-6 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : datasetsError ? (
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="text-xs">{datasetsError}</p>
                </div>
                <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => void fetchDatasets()}>Retry</Button>
              </div>
            ) : datasetsReady && datasets.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto"><Database className="w-5 h-5 text-primary" /></div>
                <div>
                  <p className="text-xs font-medium text-foreground">No datasets yet</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">The dataset query succeeded and returned no datasets.</p>
                </div>
                <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => navigate("/data-upload")}><Upload className="w-3 h-3 mr-1.5" /> Upload Data</Button>
              </div>
            ) : (
              <div className="space-y-0.5 p-1">
                {datasets.map(dataset => (
                  <button
                    key={dataset.id}
                    onClick={() => setSelectedId(dataset.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${selectedId === dataset.id ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-secondary/50 border border-transparent"}`}
                  >
                    <div className="flex items-center gap-2"><Layers className="w-3.5 h-3.5 shrink-0" /><span className="font-medium truncate">{dataset.name}</span></div>
                    <div className="flex items-center gap-2 mt-1 ml-5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${dataset.status === "ready" || dataset.status === "completed" ? "bg-success/10 text-success" : dataset.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                        {dataset.status === "completed" ? "ready" : dataset.status}
                      </span>
                      {dataset.row_count != null && <span className="text-[10px] text-muted-foreground">{dataset.row_count.toLocaleString()} rows</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-6">
            {!datasetsReady ? (
              datasetsError ? (
                <div className="max-w-xl mx-auto mt-16 glass-card p-6 rounded-xl border border-destructive/30">
                  <div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" /><div><p className="font-semibold text-sm">Dataset evidence unavailable</p><p className="text-sm text-muted-foreground mt-1">Quantivis will not display an empty explorer while the dataset read is unverified.</p></div></div>
                </div>
              ) : null
            ) : !selected ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3 max-w-xs">
                  <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto"><Layers className="w-6 h-6 text-muted-foreground" /></div>
                  <p className="text-sm font-medium">Select a dataset</p>
                  <p className="text-xs text-muted-foreground">Choose a verified dataset from the left panel to explore its schema, metrics, and quality score.</p>
                </div>
              </div>
            ) : (
              <div className="max-w-[1200px] space-y-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <h2 className="text-[16px] font-semibold tracking-tight">{selected.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      Created {new Date(selected.created_at).toLocaleDateString()} · {selected.row_count?.toLocaleString() ?? "—"} rows
                      {selected.is_stale && <span className="text-yellow-500 ml-2">⚠ Stale</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <IQScoreBadge organizationId={selected.organization_id} datasetId={selected.id} />
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => void recomputeIq()}>Recompute IQ</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
                    {(["schema", "sample", "stats"] as const).map(option => (
                      <button key={option} onClick={() => setView(option)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === option ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                        {option === "schema" ? "Schema" : option === "sample" ? "Sample Data" : "Statistics"}
                      </button>
                    ))}
                  </div>
                </div>

                {selected.column_mapping && (
                  <div className="glass-card p-4 rounded-xl">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2"><ArrowUpDown className="w-3.5 h-3.5" /> Column Mapping</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {Object.entries(selected.column_mapping as Record<string, string>).map(([source, destination]) => (
                        <div key={source} className="flex items-center gap-2 text-xs bg-secondary/30 px-3 py-2 rounded-lg">
                          <span className="text-muted-foreground truncate">{source}</span><ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" /><span className="font-medium text-primary truncate">{destination}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {metricsLoading ? (
                  <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : metricsError ? (
                  <div className="glass-card p-5 rounded-xl border border-destructive/30 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" /><div><p className="text-sm font-semibold">Metric evidence unavailable</p><p className="text-sm text-muted-foreground mt-1">{metricsError}</p></div></div>
                    <Button variant="outline" size="sm" onClick={() => void fetchMetrics()}>Retry</Button>
                  </div>
                ) : metricsReady && metrics.length === 0 ? (
                  <div className="glass-card p-8 rounded-xl text-center text-sm text-muted-foreground">The metric query succeeded and returned no metric rows for this dataset.</div>
                ) : metricsReady ? (
                  <>
                    {view === "schema" && (
                      <div className="glass-card rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2"><Table2 className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold">Columns ({columnStats.length})</h3></div>
                        <Table>
                          <TableHeader><TableRow><TableHead>Column</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Non-Null</TableHead><TableHead className="text-right">Unique</TableHead><TableHead>Sample Values</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {columnStats.map(column => (
                              <TableRow key={column.name}>
                                <TableCell className="font-medium flex items-center gap-2">{colIcon(column.type)}{column.name}</TableCell>
                                <TableCell><Badge variant="secondary" className="text-[10px]">{column.type}</Badge></TableCell>
                                <TableCell className="text-right text-muted-foreground">{column.nonNull.toLocaleString()}</TableCell>
                                <TableCell className="text-right text-muted-foreground">{column.unique.toLocaleString()}</TableCell>
                                <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">{column.sample.slice(0, 3).join(", ")}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {view === "sample" && (
                      <div className="glass-card rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2"><Eye className="w-4 h-4 text-primary" /><h3 className="text-sm font-semibold">Sample Rows (first 50)</h3></div>
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Metric Type</TableHead><TableHead className="text-right">Value</TableHead><TableHead>Date</TableHead><TableHead>Region</TableHead><TableHead>Segment</TableHead></TableRow></TableHeader>
                            <TableBody>
                              {sampleRows.map((row, index) => (
                                <TableRow key={row.id}>
                                  <TableCell className="text-muted-foreground text-xs">{index + 1}</TableCell>
                                  <TableCell className="font-medium">{row.metric_type}</TableCell>
                                  <TableCell className="text-right font-mono text-sm">{Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}</TableCell>
                                  <TableCell className="text-muted-foreground">{row.date}</TableCell>
                                  <TableCell className="text-muted-foreground">{row.region || "—"}</TableCell>
                                  <TableCell className="text-muted-foreground">{row.segment || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {view === "stats" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {columnStats.filter(column => column.type === "numeric").map(column => (
                          <div key={column.name} className="glass-card p-5 rounded-xl">
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary" />{column.name}</h4>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Min</p><p className="text-lg font-bold font-mono">{typeof column.min === "number" ? column.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p></div>
                              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mean</p><p className="text-lg font-bold font-mono">{column.mean?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</p></div>
                              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max</p><p className="text-lg font-bold font-mono">{typeof column.max === "number" ? column.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p></div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-border/30 flex justify-between text-xs text-muted-foreground"><span>{column.nonNull.toLocaleString()} values</span><span>{column.unique.toLocaleString()} unique</span></div>
                          </div>
                        ))}

                        {columnStats.filter(column => column.type === "text").map(column => (
                          <div key={column.name} className="glass-card p-5 rounded-xl">
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Type className="w-4 h-4 text-primary" />{column.name}</h4>
                            <div className="space-y-2">
                              {column.sample.map((value, index) => (
                                <div key={index} className="flex items-center justify-between text-sm">
                                  <span className="truncate">{String(value)}</span>
                                  <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">{column.name === "metric_type" ? `${metrics.filter(metric => metric.metric_type === value).length} rows` : ""}</Badge>
                                </div>
                              ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-border/30 text-xs text-muted-foreground">{column.unique} unique values</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </>
    </SectionErrorBoundary>
  );
};

export default DatasetExplorer;
