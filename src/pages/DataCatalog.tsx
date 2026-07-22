import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { getVerifiedAuth, authHeaders } from "@/lib/auth-helpers";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { toast } from "sonner";
import {
  Search, Database, RefreshCw, BarChart3, Clock,
  Layers, Activity, Eye,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DatasetEntry {
  id: string;
  name: string;
  status: string;
  row_count: number | null;
  created_at: string;
  last_refreshed_at: string | null;
  is_stale: boolean | null;
  freshness_policy_hours: number | null;
  current_version: number | null;
  column_mapping: unknown;
  data_source_id: string | null;
}

interface QualityCheck {
  id: string;
  dataset_id: string | null;
  score: number | null;
  details: Record<string, unknown> | null;
}

interface MetricProfile {
  count: number;
  mean: number;
  median: number;
  std_dev: number;
  min: number;
  max: number;
  skewness: number;
  kurtosis: number;
  outlier_count: number;
  outlier_percentage: number;
  coefficient_of_variation: number;
  distribution_shape: string;
  iqr: number;
}

interface DatasetProfile {
  total_records?: number;
  metric_types?: number;
  quality_score?: number;
  metric_profiles?: Record<string, MetricProfile>;
  correlations?: Record<string, number>;
}

export default function DataCatalog() {
  const { currentOrgId: organizationId } = useOrganization();
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [qualityChecks, setQualityChecks] = useState<Record<string, QualityCheck>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<DatasetProfile | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    loadCatalog();
  }, [organizationId]);

  const loadCatalog = async () => {
    if (!organizationId) return;
    setLoading(true);

    const [dsRes, qcRes] = await Promise.all([
      supabase.from("datasets")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase.from("data_quality_checks")
        .select("id, dataset_id, score, details")
        .eq("organization_id", organizationId)
        .eq("check_type", "statistical_profile")
        .order("created_at", { ascending: false }),
    ]);

    setDatasets(dsRes.data || []);

    const qcMap: Record<string, QualityCheck> = {};
    for (const qc of (qcRes.data || []) as QualityCheck[]) {
      if (qc.dataset_id && !qcMap[qc.dataset_id]) {
        qcMap[qc.dataset_id] = qc;
      }
    }
    setQualityChecks(qcMap);
    setLoading(false);
  };

  const runProfile = async (datasetId: string) => {
    if (!organizationId) return;
    setProfileLoading(datasetId);
    try {
      const auth = await getVerifiedAuth();
      if (!auth) throw new Error("Not authenticated");

      const { data: result, error } = await invokeWithRetry<{ profile: DatasetProfile }>("data-profiler", {
        body: { dataset_id: datasetId, organization_id: organizationId },
        headers: authHeaders(auth),
      });

      if (error) throw error;
      toast.success("Profile generated successfully");
      setSelectedProfile(result?.profile ?? null);
      await loadCatalog();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to profile dataset");
    } finally {
      setProfileLoading(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return datasets;
    const q = search.toLowerCase();
    return datasets.filter(d =>
      d.name.toLowerCase().includes(q) ||
      d.status.toLowerCase().includes(q)
    );
  }, [datasets, search]);

  // Ingestion never sets status to "active" — the pipeline only ever
  // transitions pending -> processing -> completed/failed (see
  // DataUpload.tsx). Filtering on "active" always matched zero rows.
  const activeCount = datasets.filter(d => d.status === "completed").length;
  const totalRows = datasets.reduce((s, d) => s + (d.row_count || 0), 0);
  const staleCount = datasets.filter(d => d.is_stale).length;
  const profiledCount = Object.keys(qualityChecks).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight tracking-tight">Data Catalog</h1>
          <p className="text-muted-foreground">Searchable registry of all datasets with profiling, metadata, and lineage.</p>
        </div>
        <Button onClick={loadCatalog} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <SectionErrorBoundary sectionName="Catalog Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Database className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active Datasets</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Layers className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{totalRows.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Rows</p>
            </CardContent>
          </Card>
          <Card title={staleCount > 0 ? "Datasets that have not been refreshed within their freshness policy window. This does not indicate data loss." : undefined}>
            <CardContent className="pt-6 text-center">
              <Activity className="h-6 w-6 mx-auto mb-2" style={{ color: staleCount > 0 ? "hsl(var(--warning))" : "hsl(var(--primary))" }} />
              <p className="text-2xl font-bold">{staleCount}</p>
              <p className="text-xs text-muted-foreground">
                {staleCount > 0 ? "Need refresh" : "All fresh"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <BarChart3 className="h-6 w-6 mx-auto text-primary mb-2" />
              <p className="text-2xl font-bold">{profiledCount}</p>
              <p className="text-xs text-muted-foreground">Profiled</p>
            </CardContent>
          </Card>
        </div>
      </SectionErrorBoundary>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search datasets by name or status..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Dataset table */}
      <SectionErrorBoundary sectionName="Dataset Table">
        <Card>
          <CardHeader>
            <CardTitle>All Datasets</CardTitle>
            <CardDescription>{filtered.length} datasets found</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Freshness</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(ds => {
                  const qc = qualityChecks[ds.id];
                  return (
                    <TableRow key={ds.id}>
                      <TableCell className="font-medium">{ds.name}</TableCell>
                      <TableCell>
                        <Badge variant={ds.status === "completed" ? "default" : ds.status === "failed" ? "destructive" : "outline"}>
                          {ds.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{ds.row_count?.toLocaleString() || "—"}</TableCell>
                      <TableCell>v{ds.current_version || 1}</TableCell>
                      <TableCell>
                        {ds.is_stale ? (
                          <span title="Dataset has not been refreshed within its freshness policy window. This does not indicate data loss — upload a new version or adjust the freshness policy in settings.">
                            <Badge variant="outline" className="text-amber-600 border-amber-500/40 cursor-help">Needs refresh</Badge>
                          </span>
                        ) : (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-500/40">Fresh</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {qc ? (
                          <div className="flex items-center gap-2">
                            <Progress value={qc.score || 0} className="w-12 h-2" />
                            <span className="text-xs">{qc.score}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Not profiled</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ds.last_refreshed_at
                          ? formatDistanceToNow(new Date(ds.last_refreshed_at), { addSuffix: true })
                          : formatDistanceToNow(new Date(ds.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runProfile(ds.id)}
                            disabled={profileLoading === ds.id}
                          >
                            {profileLoading === ds.id ? (
                              <RefreshCw className="h-3 w-3 animate-spin" />
                            ) : (
                              <BarChart3 className="h-3 w-3" />
                            )}
                          </Button>
                          {qc && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button size="sm" variant="ghost" onClick={() => {
                                  const details = qc.details as Record<string, unknown> | null;
                                  setSelectedProfile((details?.profile as DatasetProfile) || (details as unknown as DatasetProfile) || null);
                                }}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Dataset Profile: {ds.name}</DialogTitle>
                                </DialogHeader>
                                {selectedProfile && (
                                  <div className="space-y-4 text-sm">
                                    <div className="grid grid-cols-3 gap-4">
                                      <div className="p-3 rounded-md bg-muted">
                                        <p className="text-xs text-muted-foreground">Total Records</p>
                                        <p className="font-bold">{selectedProfile.total_records?.toLocaleString()}</p>
                                      </div>
                                      <div className="p-3 rounded-md bg-muted">
                                        <p className="text-xs text-muted-foreground">Metric Types</p>
                                        <p className="font-bold">{selectedProfile.metric_types}</p>
                                      </div>
                                      <div className="p-3 rounded-md bg-muted">
                                        <p className="text-xs text-muted-foreground">Quality Score</p>
                                        <p className="font-bold">{Math.round(selectedProfile.quality_score)}%</p>
                                      </div>
                                    </div>

                                    {selectedProfile.metric_profiles && Object.entries(selectedProfile.metric_profiles).map(([type, mp]) => (
                                      <Card key={type}>
                                        <CardHeader className="py-3">
                                          <CardTitle className="text-sm">{type}</CardTitle>
                                        </CardHeader>
                                        <CardContent className="grid grid-cols-4 gap-2 text-xs">
                                          <div><span className="text-muted-foreground">Count:</span> {mp.count}</div>
                                          <div><span className="text-muted-foreground">Mean:</span> {mp.mean}</div>
                                          <div><span className="text-muted-foreground">Median:</span> {mp.median}</div>
                                          <div><span className="text-muted-foreground">Std Dev:</span> {mp.std_dev}</div>
                                          <div><span className="text-muted-foreground">Min:</span> {mp.min}</div>
                                          <div><span className="text-muted-foreground">Max:</span> {mp.max}</div>
                                          <div><span className="text-muted-foreground">Skewness:</span> {mp.skewness}</div>
                                          <div><span className="text-muted-foreground">Kurtosis:</span> {mp.kurtosis}</div>
                                          <div><span className="text-muted-foreground">Outliers:</span> {mp.outlier_count} ({Math.round(mp.outlier_percentage)}%)</div>
                                          <div><span className="text-muted-foreground">CV:</span> {mp.coefficient_of_variation}%</div>
                                          <div><span className="text-muted-foreground">Distribution:</span> {mp.distribution_shape}</div>
                                          <div><span className="text-muted-foreground">IQR:</span> {mp.iqr}</div>
                                        </CardContent>
                                      </Card>
                                    ))}

                                    {selectedProfile.correlations && Object.keys(selectedProfile.correlations).length > 0 && (
                                      <Card>
                                        <CardHeader className="py-3">
                                          <CardTitle className="text-sm">Cross-Metric Correlations</CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-xs space-y-1">
                                          {Object.entries(selectedProfile.correlations).map(([pair, corr]) => (
                                            <div key={pair} className="flex justify-between">
                                              <span>{pair}</span>
                                              <Badge variant={Math.abs(corr) > 0.7 ? "default" : "outline"}>
                                                {corr}
                                              </Badge>
                                            </div>
                                          ))}
                                        </CardContent>
                                      </Card>
                                    )}
                                  </div>
                                )}
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading..." : "No datasets found. Upload data to create your first dataset."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </SectionErrorBoundary>
    </div>
  );
}
