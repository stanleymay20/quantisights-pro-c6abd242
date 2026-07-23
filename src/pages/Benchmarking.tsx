import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart3, TrendingUp, TrendingDown, Minus, Loader2, Building2, Target, Award, RefreshCw,
} from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface BenchmarkScore {
  id: string;
  metric_type: string;
  current_value: number;
  percentile_rank: number;
  quartile: number;
  gap_to_p75: number | null;
  gap_to_p90: number | null;
  trend: string;
  computed_at: string;
}

const QUARTILE_CONFIG: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "Bottom Quartile", color: "text-destructive", bg: "bg-destructive/10" },
  2: { label: "Below Median", color: "text-warning", bg: "bg-warning/10" },
  3: { label: "Above Median", color: "text-primary", bg: "bg-primary/10" },
  4: { label: "Top Quartile", color: "text-success", bg: "bg-success/10" },
};

const TREND_ICONS: Record<string, typeof TrendingUp> = {
  improving: TrendingUp,
  declining: TrendingDown,
  stable: Minus,
};

const extractFormulaVariables = (formula: string): string[] => {
  const tokens = formula.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) || [];
  return [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
};

const BenchmarkingPage = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [scores, setScores] = useState<BenchmarkScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [orgIndustry, setOrgIndustry] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrgId) return;
    const fetchData = async () => {
      setLoading(true);

      // Fetch org details
      const { data: org } = await supabase
        .from("organizations")
        .select("industry, revenue_band, size_band")
        .eq("id", currentOrgId)
        .single();
      if (org) setOrgIndustry(org.industry);

      // Fetch benchmark scores
      const { data, error } = await supabase
        .from("benchmark_scores")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("computed_at", { ascending: false })
        .limit(50);

      if (!error && data) setScores(data as unknown as BenchmarkScore[]);
      setLoading(false);
    };
    fetchData();
  }, [currentOrgId]);

  const handleCompute = async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setComputing(true);

    try {
      // Fetch all active KPIs for the org
      const { data: kpis, error: kpiListErr } = await supabase
        .from("kpis")
        .select("id, name, formula, metric_dependencies")
        .eq("organization_id", currentOrgId)
        .eq("status", "active");

      if (kpiListErr) throw kpiListErr;

      if (!kpis || kpis.length === 0) {
        toast({ title: "No active KPIs", description: "Define KPIs first before computing benchmarks.", variant: "destructive" });
        return;
      }

      // Discover metric types from active dataset
      const { data: metricRows, error: metricErr } = await supabase
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", activeDatasetId);

      if (metricErr) throw metricErr;

      const metricTypeSet = new Set((metricRows || []).map((m) => m.metric_type));

      // Pre-validate KPIs so we don't call compute-kpi on incompatible formulas
      const compatibleKpis = kpis.filter((kpi) => {
        const explicitDeps = Array.isArray(kpi.metric_dependencies)
          ? kpi.metric_dependencies.filter((d): d is string => typeof d === "string" && d.length > 0)
          : [];

        const inferredDeps = explicitDeps.length > 0
          ? explicitDeps
          : extractFormulaVariables(kpi.formula || "");

        return inferredDeps.length > 0 && inferredDeps.every((dep) => metricTypeSet.has(dep));
      });

      const preSkipped = kpis.filter((kpi) => !compatibleKpis.some((c) => c.id === kpi.id));

      if (compatibleKpis.length === 0) {
        toast({
          title: "No computable KPIs for this dataset",
          description: "Your KPI formulas don't match metric types in the active dataset. Edit KPI formulas/dependencies to match dataset metric names.",
          variant: "destructive",
        });
        return;
      }

      // Compute only compatible KPIs
      const runtimeSkipped: string[] = [];
      let successCount = 0;

      for (const kpi of compatibleKpis) {
        const { data: result, error } = await invokeWithRetry<Record<string, unknown>>("compute-kpi", {
          body: { kpi_id: kpi.id, dataset_id: activeDatasetId },
        });

        if (error || result?.error) {
          runtimeSkipped.push(kpi.name);
        } else {
          successCount++;
        }
      }

      if (successCount === 0) {
        toast({
          title: "No KPIs computed",
          description: "All selected KPIs were skipped. Check KPI formulas and dependencies against active dataset metric types.",
          variant: "destructive",
        });
        return;
      }

      const totalSkipped = preSkipped.length + runtimeSkipped.length;
      toast({
        title: "Benchmarks computed",
        description: `Recalculated ${successCount} KPI(s)${totalSkipped > 0 ? `, skipped ${totalSkipped}` : ""}.`,
      });

      // Refresh scores
      const { data } = await supabase
        .from("benchmark_scores")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("computed_at", { ascending: false })
        .limit(50);

      if (data) setScores(data as unknown as BenchmarkScore[]);
    } catch (err: unknown) {
      toast({ title: "Computation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setComputing(false);
    }
  };

  const avgPercentile = scores.length > 0
    ? Math.round(scores.reduce((s, sc) => s + sc.percentile_rank, 0) / scores.length)
    : null;

  const topQuartileCount = scores.filter(s => s.quartile === 4).length;

  return (
    <DatasetRequired moduleName="Benchmarking">
    <SectionErrorBoundary sectionName="Benchmarking">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Industry Benchmarking</h1>
            <p className="text-xs text-muted-foreground">
              Peer comparison & percentile ranking
              {orgIndustry && <span> — {orgIndustry}</span>}
            </p>
          </div>
          <button
            onClick={handleCompute}
            disabled={computing || !currentOrgId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
          >
            {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {computing ? "Computing..." : "Compute Benchmarks"}
          </button>
        </header>

        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Avg Percentile</p>
                  <p className="text-[18px] font-semibold tracking-tight">{avgPercentile !== null ? `P${avgPercentile}` : "—"}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Award className="w-5 h-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Top Quartile KPIs</p>
                  <p className="text-[18px] font-semibold tracking-tight">{topQuartileCount} / {scores.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-sky-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Industry</p>
                  <p className="text-lg font-semibold">{orgIndustry || "Not set"}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Benchmark cards */}
          {loading ? (
            <Card><CardContent className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></CardContent></Card>
          ) : scores.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-20 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Target className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">No Benchmark Data Yet</h2>
                <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
                  Industry benchmarks will be computed as your data volume grows and industry classification is configured. 
                  Ensure your organization's industry is set in Settings.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scores.map((sc, i) => {
                const qCfg = QUARTILE_CONFIG[sc.quartile] || QUARTILE_CONFIG[2];
                const TrendIcon = TREND_ICONS[sc.trend] || Minus;
                return (
                  <motion.div key={sc.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Card>
                      <CardContent className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-sm capitalize">{sc.metric_type.replace(/_/g, " ")}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={`${qCfg.bg} ${qCfg.color} border-none text-xs`}>{qCfg.label}</Badge>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <TrendIcon className="w-3 h-3" /> {sc.trend}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[18px] font-semibold tracking-tight">P{Math.round(sc.percentile_rank)}</p>
                            <p className="text-xs text-muted-foreground">percentile</p>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>P0</span>
                            <span>P50</span>
                            <span>P100</span>
                          </div>
                          <div className="relative">
                            <Progress value={sc.percentile_rank} className="h-2" />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-xs text-muted-foreground">Current</p>
                            <p className="text-sm font-semibold">{Number(sc.current_value).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Gap to P75</p>
                            <p className={`text-sm font-semibold ${sc.gap_to_p75 && sc.gap_to_p75 > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                              {sc.gap_to_p75 !== null ? `${sc.gap_to_p75 > 0 ? "+" : ""}${Number(sc.gap_to_p75).toLocaleString()}` : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Gap to P90</p>
                            <p className={`text-sm font-semibold ${sc.gap_to_p90 && sc.gap_to_p90 > 0 ? "text-amber-500" : "text-emerald-500"}`}>
                              {sc.gap_to_p90 !== null ? `${sc.gap_to_p90 > 0 ? "+" : ""}${Number(sc.gap_to_p90).toLocaleString()}` : "—"}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>
    </>
    </SectionErrorBoundary>
    </DatasetRequired>
  );
};

export default BenchmarkingPage;
