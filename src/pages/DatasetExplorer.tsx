import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import {
  Database, Table2, Columns3, BarChart3, RefreshCw, ChevronRight,
  Hash, Calendar, Type, ArrowUpDown, Layers, Eye, Upload,
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
  const [metrics, setMetrics] = useState<any[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [view, setView] = useState<"schema" | "sample" | "stats">("schema");

  useEffect(() => {
    if (!currentOrgId) { setLoading(false); return; }
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("datasets")
        .select("id, name, status, row_count, created_at, file_path, column_mapping, is_stale, organization_id, data_source_id")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false });
      setDatasets((data as DatasetRecord[]) || []);
      setLoading(false);
    };
    fetch();
  }, [currentOrgId]);

  // Auto-select active dataset or first
  useEffect(() => {
    if (selectedId) return;
    if (activeDatasetId && datasets.some(d => d.id === activeDatasetId)) {
      setSelectedId(activeDatasetId);
    } else if (datasets.length > 0) {
      setSelectedId(datasets[0].id);
    }
  }, [datasets, activeDatasetId, selectedId]);

  // Fetch metrics for selected dataset
  useEffect(() => {
    if (!selectedId || !currentOrgId) { setMetrics([]); return; }
    const fetch = async () => {
      setMetricsLoading(true);
      const { data } = await supabase
        .from("metrics")
        .select("id, metric_type, value, date, region, segment, created_at")
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", selectedId)
        .order("date", { ascending: true })
        .limit(1000);
      setMetrics(data || []);
      setMetricsLoading(false);
    };
    fetch();
  }, [selectedId, currentOrgId]);

  const selected = datasets.find(d => d.id === selectedId);

  // Derive column stats from metrics
  const columnStats = useMemo((): ColumnStat[] => {
    if (metrics.length === 0) return [];
    const cols: ColumnStat[] = [];

    // metric_type
    const types = metrics.map(m => m.metric_type);
    const uniqueTypes = [...new Set(types)];
    cols.push({ name: "metric_type", type: "text", nonNull: types.filter(Boolean).length, unique: uniqueTypes.length, sample: uniqueTypes.slice(0, 5) });

    // value
    const vals = metrics.map(m => Number(m.value));
    cols.push({ name: "value", type: "numeric", nonNull: vals.length, unique: new Set(vals).size, min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((s, v) => s + v, 0) / vals.length, sample: vals.slice(0, 5) });

    // date
    const dates = metrics.map(m => m.date);
    cols.push({ name: "date", type: "date", nonNull: dates.filter(Boolean).length, unique: new Set(dates).size, min: dates[0], max: dates[dates.length - 1], sample: dates.slice(0, 5) });

    // region
    const regions = metrics.map(m => m.region).filter(Boolean);
    if (regions.length > 0) {
      cols.push({ name: "region", type: "text", nonNull: regions.length, unique: new Set(regions).size, sample: [...new Set(regions)].slice(0, 5) });
    }

    // segment
    const segments = metrics.map(m => m.segment).filter(Boolean);
    if (segments.length > 0) {
      cols.push({ name: "segment", type: "text", nonNull: segments.length, unique: new Set(segments).size, sample: [...new Set(segments)].slice(0, 5) });
    }

    return cols;
  }, [metrics]);

  // Sample rows (first 50)
  const sampleRows = useMemo(() => metrics.slice(0, 50), [metrics]);

  const colIcon = (type: string) => {
    switch (type) {
      case "numeric": return <Hash className="w-3.5 h-3.5 text-primary" />;
      case "date": return <Calendar className="w-3.5 h-3.5 text-accent-foreground" />;
      case "text": return <Type className="w-3.5 h-3.5 text-muted-foreground" />;
      default: return <Columns3 className="w-3.5 h-3.5 text-muted-foreground" />;
    }
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
        <Badge variant="outline" className="text-xs">
          {datasets.length} dataset{datasets.length !== 1 ? "s" : ""}
        </Badge>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Dataset list sidebar */}
        <div className="w-64 border-r border-border/30 bg-card/30 overflow-y-auto shrink-0">
          <div className="p-3 border-b border-border/20">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Datasets</p>
          </div>
          {loading ? (
            <div className="p-6 flex justify-center"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : datasets.length === 0 ? (
            <div className="p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">No datasets yet</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Upload a CSV or connect a data source to start exploring.</p>
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => navigate("/data-upload")}>
                <Upload className="w-3 h-3 mr-1.5" /> Upload Data
              </Button>
            </div>
          ) : (
            <div className="space-y-0.5 p-1">
              {datasets.map(ds => (
                <button
                  key={ds.id}
                  onClick={() => setSelectedId(ds.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-all text-sm ${
                    selectedId === ds.id
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "hover:bg-secondary/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="font-medium truncate">{ds.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 ml-5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      ds.status === "ready" || ds.status === "completed" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                    }`}>
                      {ds.status === "completed" ? "ready" : ds.status}
                    </span>
                    {ds.row_count != null && (
                      <span className="text-[10px] text-muted-foreground">{ds.row_count.toLocaleString()} rows</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-auto p-6">
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-xs">
                <div className="w-12 h-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                  <Layers className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Select a dataset</p>
                <p className="text-xs text-muted-foreground">
                  Choose a dataset from the left panel to explore its schema, metrics, and quality score.
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-[1200px] space-y-6">
              {/* Dataset header */}
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <h2 className="text-[16px] font-semibold tracking-tight tracking-tight">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(selected.created_at).toLocaleDateString()} · {selected.row_count?.toLocaleString() ?? "—"} rows
                    {selected.is_stale && <span className="text-yellow-500 ml-2">⚠ Stale</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <IQScoreBadge organizationId={selected.organization_id} datasetId={selected.id} />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={async () => {
                        const t = toast({ title: "Computing IQ score…", description: "Scoring 7 dimensions" });
                        const { data, error } = await invokeWithRetry<any>("compute-iq-score", {
                          body: { organization_id: selected.organization_id, dataset_id: selected.id },
                        });
                        t.dismiss();
                        if (error || data?.error) {
                          toast({ title: "IQ score failed", description: error?.message ?? data?.error, variant: "destructive" });
                        } else {
                          toast({ title: `IQ composite: ${data?.composite ?? "—"}/100`, description: "Reload to see updated grade" });
                        }
                      }}
                    >
                      Recompute IQ
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
                  {(["schema", "sample", "stats"] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        view === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {v === "schema" ? "Schema" : v === "sample" ? "Sample Data" : "Statistics"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Column mapping / schema */}
              {selected.column_mapping && (
                <div className="glass-card p-4 rounded-xl">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                    <ArrowUpDown className="w-3.5 h-3.5" /> Column Mapping
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(selected.column_mapping as Record<string, string>).map(([src, dest]) => (
                      <div key={src} className="flex items-center gap-2 text-xs bg-secondary/30 px-3 py-2 rounded-lg">
                        <span className="text-muted-foreground truncate">{src}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground/50 shrink-0" />
                        <span className="font-medium text-primary truncate">{dest}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {metricsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Schema View */}
                  {view === "schema" && (
                    <div className="glass-card rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
                        <Table2 className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold">Columns ({columnStats.length})</h3>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Column</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Non-Null</TableHead>
                            <TableHead className="text-right">Unique</TableHead>
                            <TableHead>Sample Values</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {columnStats.map(col => (
                            <TableRow key={col.name}>
                              <TableCell className="font-medium flex items-center gap-2">
                                {colIcon(col.type)}
                                {col.name}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">{col.type}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">{col.nonNull.toLocaleString()}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{col.unique.toLocaleString()}</TableCell>
                              <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                                {col.sample.slice(0, 3).join(", ")}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {/* Sample Data View */}
                  {view === "sample" && (
                    <div className="glass-card rounded-xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
                        <Eye className="w-4 h-4 text-primary" />
                        <h3 className="text-sm font-semibold">Sample Rows (first 50)</h3>
                      </div>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>#</TableHead>
                              <TableHead>Metric Type</TableHead>
                              <TableHead className="text-right">Value</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Region</TableHead>
                              <TableHead>Segment</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sampleRows.map((row, i) => (
                              <TableRow key={row.id}>
                                <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                                <TableCell className="font-medium">{row.metric_type}</TableCell>
                                <TableCell className="text-right font-mono text-sm">
                                  {Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                </TableCell>
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

                  {/* Statistics View */}
                  {view === "stats" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {columnStats.filter(c => c.type === "numeric").map(col => (
                        <div key={col.name} className="glass-card p-5 rounded-xl">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            {col.name}
                          </h4>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Min</p>
                              <p className="text-lg font-bold font-mono">{typeof col.min === "number" ? col.min.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mean</p>
                              <p className="text-lg font-bold font-mono">{col.mean?.toLocaleString(undefined, { maximumFractionDigits: 2 }) ?? "—"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max</p>
                              <p className="text-lg font-bold font-mono">{typeof col.max === "number" ? col.max.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</p>
                            </div>
                          </div>
                          <div className="mt-3 pt-3 border-t border-border/30 flex justify-between text-xs text-muted-foreground">
                            <span>{col.nonNull.toLocaleString()} values</span>
                            <span>{col.unique.toLocaleString()} unique</span>
                          </div>
                        </div>
                      ))}

                      {/* Metric type distribution */}
                      {columnStats.filter(c => c.type === "text").map(col => (
                        <div key={col.name} className="glass-card p-5 rounded-xl">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Type className="w-4 h-4 text-primary" />
                            {col.name}
                          </h4>
                          <div className="space-y-2">
                            {col.sample.map((val, i) => (
                              <div key={i} className="flex items-center justify-between text-sm">
                                <span className="truncate">{String(val)}</span>
                                <Badge variant="secondary" className="text-[10px] ml-2 shrink-0">
                                  {col.name === "metric_type"
                                    ? `${metrics.filter(m => m.metric_type === val).length} rows`
                                    : ""}
                                </Badge>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                            {col.unique} unique values
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </>
    </SectionErrorBoundary>
  );
};

export default DatasetExplorer;
