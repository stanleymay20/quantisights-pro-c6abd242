import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Calculator, Sparkles, TrendingUp, TrendingDown, Minus, Target,
  BarChart3, AlertTriangle, ArrowUpRight, ArrowDownRight, Loader2, Trash2, Eye
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface KPI {
  id: string;
  name: string;
  description: string | null;
  formula: string;
  metric_dependencies: string[];
  aggregation_type: string;
  status: string;
  created_at: string;
}

interface KPIValue {
  date: string;
  value: number;
}

interface KPITarget {
  id: string;
  target_value: number;
  target_date: string;
}

interface AIAnalysis {
  summary: string;
  trend: string;
  trend_percentage: number;
  risk_level: string;
  insights: string[];
  recommendations: string[];
  confidence_score: number;
}

const FALLBACK_METRIC_TYPES = ["revenue", "customers", "cost", "churn", "orders", "sessions", "conversions"];

const TIER_KPI_LIMITS: Record<string, number> = { starter: 3, growth: 25, enterprise: 999999 };

const KPIs = () => {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const [availableMetricTypes, setAvailableMetricTypes] = useState<string[]>([]);

  // Dynamically discover metric types from the active dataset
  useEffect(() => {
    if (!currentOrgId || !activeDatasetId) return;
    const fetchTypes = async () => {
      const { data } = await supabase
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", activeDatasetId);
      if (data) {
        const types = [...new Set(data.map(r => r.metric_type))].sort();
        setAvailableMetricTypes(types.length > 0 ? types : FALLBACK_METRIC_TYPES);
      }
    };
    fetchTypes();
  }, [currentOrgId, activeDatasetId]);

  const METRIC_TYPES = availableMetricTypes.length > 0 ? availableMetricTypes : FALLBACK_METRIC_TYPES;
  const { tier } = useSubscription();
  const { toast } = useToast();

  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [kpiValues, setKpiValues] = useState<KPIValue[]>([]);
  const [kpiTargets, setKpiTargets] = useState<KPITarget[]>([]);
  const [computing, setComputing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [executiveView, setExecutiveView] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newFormula, setNewFormula] = useState("");
  const [newDeps, setNewDeps] = useState<string[]>([]);
  const [newAggType, setNewAggType] = useState("sum");

  // Target form
  const [targetValue, setTargetValue] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const currentTier = tier || "starter";
  const kpiLimit = TIER_KPI_LIMITS[currentTier] || 3;
  const canUseAI = currentTier !== "starter";

  const fetchKpis = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setLoading(true);
    // Fetch KPIs scoped to the active dataset
    const query = supabase
      .from("kpis")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("status", "active")
      .order("created_at", { ascending: false });
    // KPIs table has dataset_id column but the generated types reflect a different kpis table shape;
    // this cast is needed until the types align with the actual table schema
    (query as unknown as { eq: (col: string, val: string) => typeof query }).eq("dataset_id", activeDatasetId);
    const { data, error } = await query;

    if (!error && data) setKpis(data as unknown as KPI[]);
    setLoading(false);
  }, [currentOrgId, activeDatasetId]);

  // Reset selection when dataset changes
  useEffect(() => {
    setSelectedKpi(null);
    setKpiValues([]);
    setKpiTargets([]);
    setAnalysis(null);
  }, [activeDatasetId]);

  useEffect(() => { fetchKpis(); }, [fetchKpis]);

  const fetchKpiData = useCallback(async (kpiId: string) => {
    if (!currentOrgId) return;
    const { data: values } = await supabase
      .from("kpi_values")
      .select("date, value")
      .eq("kpi_id", kpiId)
      .eq("organization_id", currentOrgId)
      .order("date", { ascending: true });

    if (values) setKpiValues(values.map(v => ({ date: v.date, value: Number(v.value) })));

    const { data: targets } = await supabase
      .from("kpi_targets")
      .select("id, target_value, target_date")
      .eq("kpi_id", kpiId)
      .eq("organization_id", currentOrgId)
      .order("target_date", { ascending: true });

    if (targets) setKpiTargets(targets.map(t => ({ ...t, target_value: Number(t.target_value) })));
  }, [currentOrgId]);

  useEffect(() => {
    if (selectedKpi) {
      fetchKpiData(selectedKpi);
      setAnalysis(null);
    }
  }, [selectedKpi, fetchKpiData]);

  const handleCreate = async () => {
    if (!currentOrgId || !user || !newName || !newFormula || newDeps.length === 0) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    if (kpis.length >= kpiLimit) {
      toast({ title: `KPI limit reached (${kpiLimit} for ${currentTier})`, variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("kpis").insert({
      organization_id: currentOrgId,
      dataset_id: activeDatasetId,
      name: newName,
      description: newDesc || null,
      formula: newFormula,
      metric_dependencies: newDeps,
      aggregation_type: newAggType,
      created_by: user.id,
    });

    if (error) {
      toast({ title: "Failed to create KPI", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "KPI created" });
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewFormula(""); setNewDeps([]); setNewAggType("sum");
      fetchKpis();
    }
  };

  const handleCompute = async (kpiId: string) => {
    setComputing(true);
    try {
      const { data, error } = await invokeWithRetry<any>("compute-kpi", {
        body: { kpi_id: kpiId, dataset_id: activeDatasetId, organization_id: currentOrgId },
      });
      if (error) throw error;
      if (data?.error) {
        const hint = data?.hint || data?.available_metric_types
          ? `\n\nAvailable metrics: ${(data.available_metric_types as string[] || []).join(", ")}\n${data.hint || ""}`
          : "";
        throw new Error(String(data.error) + hint);
      }
      toast({ title: `Computed ${data?.count} data points` });
      fetchKpiData(kpiId);
    } catch (e: unknown) {
      toast({ title: "Compute failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setComputing(false);
    }
  };

  const handleAnalyze = async (kpiId: string) => {
    if (!canUseAI) {
      toast({ title: "AI analysis requires Growth or Enterprise plan", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    try {
      const { data, error } = await invokeWithRetry<any>("ai-kpi-analysis", {
        body: { kpi_id: kpiId, dataset_id: activeDatasetId, organization_id: currentOrgId },
      });
      if (error) throw error;
      if (data?.error) {
        if (String(data.error).includes("minimum 2 data points")) {
          toast({ title: "Not enough data", description: "Compute KPI values first (need at least 2 data points) before running AI analysis.", variant: "destructive" });
        } else {
          throw new Error(String(data.error));
        }
        return;
      }
      setAnalysis(data?.analysis as AIAnalysis);
    } catch (e: unknown) {
      toast({ title: "Analysis failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddTarget = async () => {
    if (!selectedKpi || !currentOrgId || !user || !targetValue || !targetDate) return;
    const { error } = await supabase.from("kpi_targets").insert({
      kpi_id: selectedKpi,
      organization_id: currentOrgId,
      target_value: Number(targetValue),
      target_date: targetDate,
      created_by: user.id,
    });
    if (error) {
      toast({ title: "Failed to add target", variant: "destructive" });
    } else {
      toast({ title: "Target added" });
      setTargetValue(""); setTargetDate("");
      fetchKpiData(selectedKpi);
    }
  };

  const handleDelete = async (kpiId: string) => {
    if (!currentOrgId) return;
    const { error } = await supabase.from("kpis").update({ status: "archived" }).eq("id", kpiId).eq("organization_id", currentOrgId);
    if (!error) {
      toast({ title: "KPI archived" });
      if (selectedKpi === kpiId) setSelectedKpi(null);
      fetchKpis();
    }
  };

  const toggleDep = (dep: string) => {
    setNewDeps(prev => prev.includes(dep) ? prev.filter(d => d !== dep) : [...prev, dep]);
  };

  const selectedKpiObj = kpis.find(k => k.id === selectedKpi);

  // Inverse metrics where "up" is bad
  const INVERSE_METRICS = ["cost", "churn", "expense", "debt", "loss", "attrition", "turnover"];
  const isInverseKpi = selectedKpiObj
    ? (selectedKpiObj.metric_dependencies as string[]).some(d => INVERSE_METRICS.some(inv => d.toLowerCase().includes(inv)))
    : false;

  const trendIcon = (trend?: string) => {
    const isPositive = trend === "up" ? !isInverseKpi : isInverseKpi;
    if (trend === "up") return <TrendingUp className={`w-4 h-4 ${isPositive ? "text-success" : "text-destructive"}`} />;
    if (trend === "down") return <TrendingDown className={`w-4 h-4 ${isPositive ? "text-success" : "text-destructive"}`} />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const trendColor = (trend?: string) => {
    if (!trend || trend === "stable") return "text-muted-foreground";
    const isPositive = trend === "up" ? !isInverseKpi : isInverseKpi;
    return isPositive ? "text-success" : "text-destructive";
  };

  const riskBadge = (level?: string) => {
    const colors: Record<string, string> = {
      low: "bg-success/20 text-success",
      medium: "bg-warning/20 text-warning",
      high: "bg-destructive/20 text-destructive",
    };
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[level || "medium"]}`}>
        {level || "unknown"} risk
      </span>
    );
  };

  return (
    <DatasetRequired moduleName="KPIs">
    <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <SidebarMobileToggle />
            <BarChart3 className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">KPI Builder</h1>
            <Badge variant="outline" className="text-xs">
              {kpis.length}/{kpiLimit === 999999 ? "∞" : kpiLimit} KPIs
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant={executiveView ? "default" : "outline"}
              size="sm"
              onClick={() => setExecutiveView(!executiveView)}
              className="gap-2"
            >
              <Eye className="w-4 h-4" />
              Executive View
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="w-4 h-4" /> New KPI
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="tracking-tight">Create KPI</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <Input
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="e.g. Gross Margin"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Description</label>
                    <Textarea
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                      placeholder="Strategic purpose of this KPI"
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Metric Dependencies</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {METRIC_TYPES.map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleDep(m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            newDeps.includes(m)
                              ? "bg-primary/20 border-primary text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Formula</label>
                    <Input
                      value={newFormula}
                      onChange={e => setNewFormula(e.target.value)}
                      placeholder="e.g. revenue - cost"
                      className="mt-1 font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Use metric names: {newDeps.join(", ") || "select dependencies first"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Aggregation</label>
                    <Select value={newAggType} onValueChange={setNewAggType}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sum">Sum</SelectItem>
                        <SelectItem value="avg">Average</SelectItem>
                        <SelectItem value="ratio">Ratio</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreate} className="w-full">Create KPI</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <SectionErrorBoundary sectionName="KPI Builder">
        <main className="flex-1 p-8 overflow-auto">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* KPI List */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your KPIs</h2>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : kpis.length === 0 ? (
                <div className="glass-card p-8 rounded-xl text-center">
                  <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No KPIs yet. Create your first strategic KPI.</p>
                </div>
              ) : (
                kpis.map(kpi => (
                  <button
                    key={kpi.id}
                    onClick={() => setSelectedKpi(kpi.id)}
                    className={`w-full text-left glass-card p-4 rounded-xl transition-all ${
                      selectedKpi === kpi.id
                        ? "border-primary/50 shadow-lg shadow-primary/5"
                        : "hover:border-primary/20"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-sm">{kpi.name}</h3>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1 rounded hover:bg-destructive/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Archive KPI?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will archive "{kpi.name}" and hide it from the active list. This action cannot be undone from the UI.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(kpi.id)}>Archive</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{kpi.formula}</p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {(kpi.metric_dependencies as string[]).map(d => (
                        <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                          {d}
                        </span>
                      ))}
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* KPI Detail */}
            <div className="lg:col-span-2 space-y-4">
              {selectedKpiObj ? (
                <>
                  <div className="glass-card p-6 rounded-xl">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">{selectedKpiObj.name}</h2>
                        {selectedKpiObj.description && (
                          <p className="text-sm text-muted-foreground mt-1">{selectedKpiObj.description}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCompute(selectedKpiObj.id)}
                          disabled={computing}
                          className="gap-2"
                        >
                          {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                          Compute
                        </Button>
                        <Button
                          size="sm"
                          variant={canUseAI ? "default" : "outline"}
                          onClick={() => handleAnalyze(selectedKpiObj.id)}
                          disabled={analyzing || !canUseAI || kpiValues.length < 2}
                          className="gap-2"
                          title={kpiValues.length < 2 ? "Compute KPI values first (need at least 2 data points)" : ""}
                        >
                          {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          AI Analysis
                          {!canUseAI && <span className="text-[10px] ml-1 opacity-60">Growth+</span>}
                          {canUseAI && kpiValues.length < 2 && <span className="text-[10px] ml-1 opacity-60">Need data</span>}
                        </Button>
                      </div>
                    </div>

                    {/* Chart */}
                    {kpiValues.length > 0 ? (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={kpiValues}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                              tickFormatter={d => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
                            />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                            <Tooltip
                              contentStyle={{
                                background: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: "8px",
                                fontSize: "12px",
                              }}
                            />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="hsl(var(--primary))"
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 4 }}
                            />
                            {kpiTargets.map(t => (
                              <ReferenceLine
                                key={t.id}
                                y={t.target_value}
                                stroke="hsl(var(--warning))"
                                strokeDasharray="5 5"
                                label={{
                                  value: `Target: ${t.target_value}`,
                                  fill: "hsl(var(--warning))",
                                  fontSize: 11,
                                }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                        Click "Compute" to generate KPI values from your metrics data
                      </div>
                    )}
                  </div>

                  {/* Add Target */}
                  <div className="glass-card p-4 rounded-xl">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4 text-primary" /> Set Target
                    </h3>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Value</label>
                        <Input
                          type="number"
                          value={targetValue}
                          onChange={e => setTargetValue(e.target.value)}
                          placeholder="100000"
                          className="mt-1"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-muted-foreground">Date</label>
                        <Input
                          type="date"
                          value={targetDate}
                          onChange={e => setTargetDate(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <Button size="sm" onClick={handleAddTarget} disabled={!targetValue || !targetDate}>
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* AI Analysis Panel */}
                  {analysis && (
                    <div className="glass-card p-6 rounded-xl border-primary/20">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-primary" /> Executive Intelligence
                        </h3>
                        <div className="flex items-center gap-3">
                          {trendIcon(analysis.trend)}
                         <span className={`text-sm font-bold ${trendColor(analysis.trend)}`}>
                            {analysis.trend_percentage > 0 ? "+" : ""}{analysis.trend_percentage?.toFixed(1)}%
                          </span>
                          {riskBadge(analysis.risk_level)}
                        </div>
                      </div>
                      <p className="text-sm mb-4 leading-relaxed">{analysis.summary}</p>

                      {executiveView && (
                        <>
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Insights</h4>
                            <div className="space-y-2">
                              {analysis.insights?.map((ins, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <ArrowUpRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                  <span>{ins}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="mb-4">
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recommendations</h4>
                            <div className="space-y-2">
                              {analysis.recommendations?.map((rec, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <ArrowDownRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                  <span>{rec}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-3 border-t border-border">
                            <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              Confidence Score: {analysis.confidence_score}/100
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center min-h-[400px]">
                  <BarChart3 className="w-16 h-16 text-muted-foreground mb-4" />
                  <h2 className="text-[16px] font-semibold tracking-tight mb-2">Select or Create a KPI</h2>
                  <p className="text-muted-foreground text-sm text-center max-w-md">
                    Define strategic KPIs from your metrics data. Compute values, set targets, and get AI-powered executive insights.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
        </SectionErrorBoundary>
    </div>
    </DatasetRequired>
  );
};

export default KPIs;
