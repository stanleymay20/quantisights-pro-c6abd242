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
import { Badge } from "@/components/ui/badge";
import {
  Plus, Play, Sparkles, Trash2, Copy, Loader2,
  TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight,
  ArrowDownRight, Shuffle, Target, BarChart3
} from "lucide-react";
import {
  ComposedChart, Line, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Area
} from "recharts";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  forecast_start_date: string;
  forecast_end_date: string;
  status: string;
  created_at: string;
}

interface Assumption {
  id: string;
  scenario_id: string;
  metric_type: string;
  adjustment_type: string;
  adjustment_value: number;
}

interface ScenarioResult {
  date: string;
  baseline_value: number;
  simulated_value: number;
  delta_value: number;
  kpi_id: string;
}

interface AIAnalysis {
  executive_summary: string;
  projected_outcome: string;
  strategic_risks: string[];
  opportunity_areas: string[];
  recommended_actions: string[];
  confidence_score: number;
}

const FALLBACK_METRIC_TYPES = ["revenue", "customers", "cost", "churn", "orders", "sessions", "conversions"];
const ADJUSTMENT_TYPES = [
  { value: "percentage", label: "Percentage (%)" },
  { value: "absolute", label: "Absolute (+/-)" },
  { value: "multiplier", label: "Multiplier (×)" },
];

const TIER_LIMITS: Record<string, number> = { starter: 0, growth: 3, enterprise: 999999 };

const Scenarios = () => {
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

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<Assumption[]>([]);
  const [results, setResults] = useState<ScenarioResult[]>([]);
  const [simulating, setSimulating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Add assumption form
  const [addMetric, setAddMetric] = useState("");
  const [addType, setAddType] = useState("percentage");
  const [addValue, setAddValue] = useState("");

  const currentTier = tier || "starter";
  const scenarioLimit = TIER_LIMITS[currentTier] || 0;
  const canSimulate = currentTier !== "starter";
  const canUseAI = currentTier !== "starter";

  const fetchScenarios = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setLoading(true);
    const { data } = await supabase
      .from("scenarios")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", activeDatasetId)
      .neq("status", "archived")
      .order("created_at", { ascending: false });
    if (data) setScenarios(data as unknown as Scenario[]);
    setLoading(false);
  }, [currentOrgId, activeDatasetId]);

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

  const fetchDetails = useCallback(async (scenarioId: string) => {
    const [{ data: assumptionData }, { data: resultData }] = await Promise.all([
      supabase.from("scenario_assumptions").select("*").eq("scenario_id", scenarioId),
      supabase.from("scenario_results").select("date, baseline_value, simulated_value, delta_value, kpi_id")
        .eq("scenario_id", scenarioId).order("date", { ascending: true }),
    ]);
    if (assumptionData) setAssumptions(assumptionData as unknown as Assumption[]);
    if (resultData) setResults(resultData.map(r => ({
      ...r,
      baseline_value: Number(r.baseline_value),
      simulated_value: Number(r.simulated_value),
      delta_value: Number(r.delta_value),
    })) as ScenarioResult[]);
    setAnalysis(null);
  }, []);

  useEffect(() => {
    if (selectedId) fetchDetails(selectedId);
  }, [selectedId, fetchDetails]);

  const handleCreate = async () => {
    if (!currentOrgId || !user || !newName || !newStart || !newEnd) {
      toast({ title: "Fill in all required fields", variant: "destructive" });
      return;
    }
    if (!canSimulate) {
      toast({ title: "Scenario simulation requires Growth or Enterprise plan", variant: "destructive" });
      return;
    }
    if (scenarios.length >= scenarioLimit) {
      toast({ title: `Scenario limit reached (${scenarioLimit} for ${currentTier})`, variant: "destructive" });
      return;
    }

    const { data, error } = await supabase.from("scenarios").insert({
      organization_id: currentOrgId,
      dataset_id: activeDatasetId,
      name: newName,
      description: newDesc || null,
      forecast_start_date: newStart,
      forecast_end_date: newEnd,
      created_by: user.id,
    }).select().single();

    if (error) {
      toast({ title: "Failed to create scenario", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Scenario created" });
      setCreateOpen(false);
      setNewName(""); setNewDesc(""); setNewStart(""); setNewEnd("");
      fetchScenarios();
      if (data) setSelectedId(data.id);
    }
  };

  const handleAddAssumption = async () => {
    if (!selectedId || !addMetric || !addValue) return;
    const { error } = await supabase.from("scenario_assumptions").insert({
      scenario_id: selectedId,
      metric_type: addMetric,
      adjustment_type: addType,
      adjustment_value: Number(addValue),
    });
    if (error) {
      toast({ title: "Failed to add assumption", variant: "destructive" });
    } else {
      setAddMetric(""); setAddValue("");
      fetchDetails(selectedId);
    }
  };

  const handleDeleteAssumption = async (id: string) => {
    await supabase.from("scenario_assumptions").delete().eq("id", id);
    if (selectedId) fetchDetails(selectedId);
  };

  const handleSimulate = async () => {
    if (!selectedId || !activeDatasetId) {
      toast({ title: "Select a dataset first", variant: "destructive" });
      return;
    }
    setSimulating(true);
    try {
      const { data, error } = await invokeWithRetry<any>("simulate-scenario", {
        body: { scenario_id: selectedId, dataset_id: activeDatasetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast({ title: `Simulation complete: ${data?.projected_values} projections computed` });
      fetchDetails(selectedId);
      fetchScenarios();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Simulation failed";
      toast({ title: "Simulation failed", description: msg, variant: "destructive" });
    } finally {
      setSimulating(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (!selectedId || !canUseAI || !activeDatasetId) return;
    setAnalyzing(true);
    try {
      const { data, error } = await invokeWithRetry<any>("ai-scenario-analysis", {
        body: { scenario_id: selectedId, dataset_id: activeDatasetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setAnalysis(data?.analysis as AIAnalysis);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI analysis failed";
      toast({ title: "AI analysis failed", description: msg, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDuplicate = async () => {
    const sel = scenarios.find(s => s.id === selectedId);
    if (!sel || !currentOrgId || !user) return;
    const { data, error } = await supabase.from("scenarios").insert({
      organization_id: currentOrgId,
      dataset_id: activeDatasetId,
      name: `${sel.name} (copy)`,
      description: sel.description,
      forecast_start_date: sel.forecast_start_date,
      forecast_end_date: sel.forecast_end_date,
      created_by: user.id,
    }).select().single();

    if (!error && data) {
      // Copy assumptions
      if (assumptions.length > 0) {
        await supabase.from("scenario_assumptions").insert(
          assumptions.map(a => ({
            scenario_id: data.id,
            metric_type: a.metric_type,
            adjustment_type: a.adjustment_type,
            adjustment_value: a.adjustment_value,
          }))
        );
      }
      toast({ title: "Scenario duplicated" });
      fetchScenarios();
      setSelectedId(data.id);
    }
  };

  const handleDelete = async (id: string) => {
    await supabase.from("scenarios").update({ status: "archived" }).eq("id", id);
    if (selectedId === id) { setSelectedId(null); setResults([]); setAssumptions([]); }
    fetchScenarios();
    toast({ title: "Scenario archived" });
  };

  const selectedScenario = scenarios.find(s => s.id === selectedId);

  // Aggregate results by date for chart (sum across KPIs)
  const chartData = results.reduce<Record<string, { date: string; baseline: number; simulated: number; delta: number }>>((acc, r) => {
    if (!acc[r.date]) acc[r.date] = { date: r.date, baseline: 0, simulated: 0, delta: 0 };
    acc[r.date].baseline += r.baseline_value;
    acc[r.date].simulated += r.simulated_value;
    acc[r.date].delta += r.delta_value;
    return acc;
  }, {});

  // Sample chart data (max 90 points for performance)
  const chartArray = Object.values(chartData);
  const step = Math.max(1, Math.floor(chartArray.length / 90));
  const sampledChart = chartArray.filter((_, i) => i % step === 0);

  // Summary stats
  const totalBaseline = chartArray.reduce((s, d) => s + d.baseline, 0);
  const totalSimulated = chartArray.reduce((s, d) => s + d.simulated, 0);
  const totalDelta = totalSimulated - totalBaseline;
  const pctChange = totalBaseline ? ((totalDelta / totalBaseline) * 100) : 0;

  const outcomeColor = (outcome?: string) => {
    if (outcome === "positive") return "text-success";
    if (outcome === "negative") return "text-destructive";
    return "text-warning";
  };

  return (
    <DatasetRequired moduleName="Scenarios">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <SidebarMobileToggle />
            <Shuffle className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Scenario Simulation</h1>
            {!canSimulate && (
              <Badge variant="outline" className="text-xs text-warning border-warning/30">Growth+ Required</Badge>
            )}
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" disabled={!canSimulate}>
                <Plus className="w-4 h-4" /> New Scenario
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="tracking-tight">Create Scenario</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Name</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Revenue Growth 10%" className="mt-1" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Description</label>
                  <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What-if scenario description" rows={2} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Forecast Start</label>
                    <Input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Forecast End</label>
                    <Input type="date" value={newEnd} onChange={e => setNewEnd(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <Button onClick={handleCreate} className="w-full">Create Scenario</Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <SectionErrorBoundary sectionName="Scenario Simulation">
        <main className="flex-1 p-8 overflow-auto">
          {!canSimulate ? (
            <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center min-h-[400px]">
              <Shuffle className="w-16 h-16 text-muted-foreground mb-4" />
              <h2 className="text-[16px] font-semibold tracking-tight mb-2">Strategic Simulation</h2>
              <p className="text-muted-foreground text-sm text-center max-w-md">
                Model what-if scenarios and project KPI outcomes. Upgrade to Growth or Enterprise to unlock simulation capabilities.
              </p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Left Panel: Scenario List */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scenarios</h2>
                {loading ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                ) : scenarios.length === 0 ? (
                  <div className="glass-card p-8 rounded-xl text-center">
                    <Shuffle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No scenarios yet. Create your first what-if simulation.</p>
                  </div>
                ) : (
                  scenarios.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={`w-full text-left glass-card p-4 rounded-xl transition-all ${
                        selectedId === s.id ? "border-primary/50 shadow-lg shadow-primary/5" : "hover:border-primary/20"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-sm">{s.name}</h3>
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`text-[10px] ${
                            s.status === "active" ? "border-success/30 text-success" :
                            s.status === "draft" ? "border-muted-foreground/30" : ""
                          }`}>
                            {s.status}
                          </Badge>
                          <button
                            onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                            className="p-1 rounded hover:bg-destructive/20 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {s.forecast_start_date} → {s.forecast_end_date}
                      </p>
                    </button>
                  ))
                )}
              </div>

              {/* Main Panel */}
              <div className="lg:col-span-2 space-y-4">
                {selectedScenario ? (
                  <>
                    {/* Header + Actions */}
                    <div className="glass-card p-6 rounded-xl">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h2 className="text-lg font-semibold tracking-tight">{selectedScenario.name}</h2>
                          {selectedScenario.description && (
                            <p className="text-sm text-muted-foreground mt-1">{selectedScenario.description}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={handleDuplicate} className="gap-1">
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </Button>
                          <Button size="sm" onClick={handleSimulate} disabled={simulating || assumptions.length === 0} className="gap-2">
                            {simulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Run Simulation
                          </Button>
                          <Button
                            size="sm"
                            variant={canUseAI ? "default" : "outline"}
                            onClick={handleAIAnalysis}
                            disabled={analyzing || results.length === 0 || !canUseAI}
                            className="gap-2"
                          >
                            {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            AI Analysis
                          </Button>
                        </div>
                      </div>

                      {/* Comparison Chart */}
                      {sampledChart.length > 0 ? (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={sampledChart}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                dataKey="date"
                                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={d => new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })}
                              />
                              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                              <Tooltip
                                contentStyle={{
                                  background: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: "8px",
                                  fontSize: "12px",
                                }}
                              />
                              <Legend />
                              <Line type="monotone" dataKey="baseline" name="Baseline" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                              <Line type="monotone" dataKey="simulated" name="Simulated" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                              <Area type="monotone" dataKey="delta" name="Delta" fill="hsl(var(--primary) / 0.15)" stroke="none" />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                          Add assumptions and click "Run Simulation" to see projections
                        </div>
                      )}
                    </div>

                    {/* Impact Summary */}
                    {results.length > 0 && (
                      <div className="grid grid-cols-3 gap-3">
                        <div className="glass-card p-4 rounded-xl text-center">
                          <p className="text-xs text-muted-foreground mb-1">Total Delta</p>
                          <p className={`text-xl font-bold tracking-tight ${totalDelta >= 0 ? "text-success" : "text-destructive"}`}>
                            {totalDelta >= 0 ? "+" : ""}{totalDelta.toFixed(0)}
                          </p>
                        </div>
                        <div className="glass-card p-4 rounded-xl text-center">
                          <p className="text-xs text-muted-foreground mb-1">Change</p>
                          <p className={`text-xl font-bold tracking-tight ${pctChange >= 0 ? "text-success" : "text-destructive"}`}>
                            {pctChange >= 0 ? "+" : ""}{pctChange.toFixed(1)}%
                          </p>
                        </div>
                        <div className="glass-card p-4 rounded-xl text-center">
                          <p className="text-xs text-muted-foreground mb-1">Data Points</p>
                          <p className="text-xl font-bold tracking-tight">{results.length}</p>
                        </div>
                      </div>
                    )}

                    {/* Assumption Builder */}
                    <div className="glass-card p-5 rounded-xl">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-primary" /> Assumptions
                      </h3>

                      {/* Existing assumptions */}
                      {assumptions.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {assumptions.map(a => (
                            <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-xs">{a.metric_type}</Badge>
                                <span className="text-sm font-medium">
                                  {a.adjustment_type === "percentage" ? `${a.adjustment_value > 0 ? "+" : ""}${a.adjustment_value}%` :
                                   a.adjustment_type === "multiplier" ? `×${a.adjustment_value}` :
                                   `${a.adjustment_value > 0 ? "+" : ""}${a.adjustment_value}`}
                                </span>
                              </div>
                              <button onClick={() => handleDeleteAssumption(a.id)} className="p-1 rounded hover:bg-destructive/20">
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add assumption */}
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Metric</label>
                          <Select value={addMetric} onValueChange={setAddMetric}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {METRIC_TYPES.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Type</label>
                          <Select value={addType} onValueChange={setAddType}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ADJUSTMENT_TYPES.map(t => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="w-28">
                          <label className="text-xs text-muted-foreground">Value</label>
                          <Input type="number" value={addValue} onChange={e => setAddValue(e.target.value)} placeholder="10" className="mt-1" />
                        </div>
                        <Button size="sm" onClick={handleAddAssumption} disabled={!addMetric || !addValue}>
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* AI Analysis Panel */}
                    {analysis && (
                      <div className="glass-card p-6 rounded-xl border-primary/20">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary" /> Strategic Intelligence
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className={`text-sm font-bold ${outcomeColor(analysis.projected_outcome)}`}>
                              {analysis.projected_outcome?.toUpperCase()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Confidence: {analysis.confidence_score}/100
                            </span>
                          </div>
                        </div>
                        <p className="text-sm mb-4 leading-relaxed">{analysis.executive_summary}</p>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Strategic Risks</h4>
                            <div className="space-y-2">
                              {analysis.strategic_risks?.map((r, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                                  <span>{r}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Opportunities</h4>
                            <div className="space-y-2">
                              {analysis.opportunity_areas?.map((o, i) => (
                                <div key={i} className="flex items-start gap-2 text-sm">
                                  <ArrowUpRight className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                                  <span>{o}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border">
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recommended Actions</h4>
                          <div className="space-y-2">
                            {analysis.recommended_actions?.map((a, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <ArrowDownRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                                <span>{a}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="glass-card p-12 rounded-xl flex flex-col items-center justify-center min-h-[400px]">
                    <Shuffle className="w-16 h-16 text-muted-foreground mb-4" />
                    <h2 className="text-[16px] font-semibold tracking-tight mb-2">Strategic Decision Laboratory</h2>
                    <p className="text-muted-foreground text-sm text-center max-w-md">
                      Model what-if scenarios, adjust metric drivers, and project KPI outcomes to support data-driven strategic decisions.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default Scenarios;
