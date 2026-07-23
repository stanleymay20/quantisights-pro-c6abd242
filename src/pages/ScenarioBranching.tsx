import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  GitBranch, Plus, Loader2, Play, Trash2, BarChart3,
  TrendingUp, TrendingDown, ArrowRight, AlertTriangle,
} from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface BranchResults {
  projected_risk: number;
  risk_delta: number;
  baseline_risk: number;
  escalation_triggered: boolean;
  ai_board_summary?: string;
  [key: string]: unknown;
}

interface Branch {
  id: string;
  name: string;
  description: string | null;
  parameters: Record<string, number>;
  results: BranchResults | null;
  status: string;
  comparison_group_id: string | null;
  created_at: string;
}

const ScenarioBranching = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { user } = useAuth();
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [comparisonGroupId] = useState(() => crypto.randomUUID());

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [dynamicMetrics, setDynamicMetrics] = useState<string[]>([]);
  const [newParams, setNewParams] = useState<Record<string, number>>({});

  // Dynamically discover metric types for branching parameters
  useEffect(() => {
    if (!currentOrgId || !activeDatasetId) return;
    const fetchTypes = async () => {
      const { data } = await supabase
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", activeDatasetId);
      if (data) {
        const types = [...new Set(data.map(r => r.metric_type))].sort().slice(0, 6);
        setDynamicMetrics(types);
        const defaults: Record<string, number> = {};
        types.forEach(t => { defaults[`${t}_change_percent`] = 0; });
        if (Object.keys(defaults).length === 0) {
          defaults["value_change_percent"] = 0;
        }
        setNewParams(defaults);
      }
    };
    fetchTypes();
  }, [currentOrgId, activeDatasetId]);

  const fetchBranches = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("scenario_branches")
      .select("*")
      .eq("organization_id", currentOrgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setBranches(data as unknown as Branch[]);
    setLoading(false);
  };

  useEffect(() => { fetchBranches(); }, [currentOrgId]);

  const createBranch = async () => {
    if (!currentOrgId || !user || !newName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("scenario_branches").insert([{
      organization_id: currentOrgId,
      name: newName,
      description: newDesc || null,
      parameters: newParams,
      created_by: user.id,
      comparison_group_id: comparisonGroupId,
    }]);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Branch created" });
      setNewName("");
      setNewDesc("");
      const resetParams: Record<string, number> = {};
      dynamicMetrics.forEach(t => { resetParams[`${t}_change_percent`] = 0; });
      setNewParams(Object.keys(resetParams).length > 0 ? resetParams : { value_change_percent: 0 });
      fetchBranches();
    }
    setCreating(false);
  };

  const simulateBranch = async (branch: Branch) => {
    if (!currentOrgId || !activeDatasetId) return;
    setSimulating(branch.id);
    try {
      const { data, error } = await invokeWithRetry<Record<string, unknown>>("strategic-simulation", {
        body: {
          organization_id: currentOrgId,
          dataset_id: activeDatasetId,
          role_type: "ceo",
          scenario_parameters: branch.parameters,
        },
      });
      if (error) throw error;
      const rawData = data as unknown as Record<string, unknown> | null;
      if (rawData?.error) throw new Error(String(rawData.error));

      const branchUpdate: Database["public"]["Tables"]["scenario_branches"]["Update"] = {
        results: data as unknown as Json,
        status: "simulated",
      };
      await supabase.from("scenario_branches")
        .update(branchUpdate)
        .eq("id", branch.id);

      toast({ title: "Simulation complete" });
      fetchBranches();
    } catch (e: unknown) {
      toast({ title: "Simulation failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setSimulating(null);
    }
  };

  const deleteBranch = async (id: string) => {
    await supabase.from("scenario_branches").delete().eq("id", id);
    fetchBranches();
  };

  // Get branches with results for comparison
  const simulatedBranches = branches.filter(b => b.results);

  return (
    <DatasetRequired moduleName="Scenario Branching">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <GitBranch className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">What-If Branching</h1>
            <Badge variant="outline" className="text-xs">Compare scenarios side-by-side</Badge>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Create New Branch */}
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Create Scenario Branch
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Branch Name</Label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Aggressive Growth" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief scenario description" />
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(newParams).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs capitalize">{key.replace(/_/g, " ").replace(" percent", " %")}</Label>
                    <Input
                      type="number"
                      value={value}
                      onChange={e => setNewParams(p => ({ ...p, [key]: Number(e.target.value) }))}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={createBranch} disabled={creating || !newName.trim()} className="gap-2">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Branch
              </Button>
            </CardContent>
          </Card>

          {/* Branches List */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : branches.length === 0 ? (
            <Card className="p-12 text-center">
              <GitBranch className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Create 2+ scenario branches to compare them side-by-side</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {branches.map(branch => (
                <Card key={branch.id} className={branch.results ? "border-primary/20" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{branch.name}</CardTitle>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={`text-[10px] ${
                          branch.status === "simulated" ? "text-success border-success/30" : ""
                        }`}>
                          {branch.status}
                        </Badge>
                        <button onClick={() => deleteBranch(branch.id)} className="p-1 rounded hover:bg-destructive/20">
                          <Trash2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    </div>
                    {branch.description && <p className="text-xs text-muted-foreground">{branch.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Parameters */}
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(branch.parameters).map(([k, v]) => (
                        <div key={k} className="text-xs">
                          <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ").replace(" percent", "")}: </span>
                          <span className={`font-medium ${Number(v) > 0 ? "text-success" : Number(v) < 0 ? "text-destructive" : ""}`}>
                            {Number(v) > 0 ? "+" : ""}{v}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Results */}
                    {branch.results && (
                      <div className="p-3 rounded-lg bg-muted/50 border border-border/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Projected Risk</span>
                          <span className={`text-sm font-bold ${
                            branch.results.projected_risk >= 70 ? "text-destructive" :
                            branch.results.projected_risk >= 40 ? "text-warning" : "text-success"
                          }`}>
                            {branch.results.projected_risk}/100
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Risk Delta</span>
                          <span className={`text-sm font-bold flex items-center gap-1 ${
                            branch.results.risk_delta > 0 ? "text-destructive" : "text-emerald-500"
                          }`}>
                            {branch.results.risk_delta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {branch.results.risk_delta > 0 ? "+" : ""}{branch.results.risk_delta}
                          </span>
                        </div>
                        {branch.results.escalation_triggered && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="w-3 h-3" /> Escalation triggered
                          </div>
                        )}
                      </div>
                    )}

                    {/* Simulate Button */}
                    {!branch.results && (
                      <Button
                        onClick={() => simulateBranch(branch)}
                        disabled={simulating === branch.id}
                        size="sm"
                        className="w-full gap-2"
                      >
                        {simulating === branch.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        Run Simulation
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Side-by-Side Comparison */}
          {simulatedBranches.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-primary" /> Scenario Comparison
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30">
                        <th className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">Metric</th>
                        {simulatedBranches.map(b => (
                          <th key={b.id} className="text-center py-2 px-3 text-xs font-medium">{b.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {["projected_risk", "risk_delta", "baseline_risk"].map(metric => (
                        <tr key={metric} className="border-b border-border/10">
                          <td className="py-2 px-3 text-xs text-muted-foreground capitalize">{metric.replace(/_/g, " ")}</td>
                          {simulatedBranches.map(b => {
                            const val = b.results?.[metric] as number | undefined;
                            const isBest = metric === "projected_risk"
                              ? val === Math.min(...simulatedBranches.map(sb => (sb.results?.[metric] as number) ?? 999))
                              : metric === "risk_delta"
                              ? val === Math.min(...simulatedBranches.map(sb => (sb.results?.[metric] as number) ?? 999))
                              : false;
                            return (
    <SectionErrorBoundary sectionName="Scenario Branching">
                              <td key={b.id} className={`text-center py-2 px-3 font-medium ${isBest ? "text-primary font-bold" : ""}`}>
                                {val ?? "—"}
                              </td>
    </SectionErrorBoundary>
                            );
                          })}
                        </tr>
                      ))}
                      <tr className="border-b border-border/10">
                        <td className="py-2 px-3 text-xs text-muted-foreground">Escalation</td>
                        {simulatedBranches.map(b => (
                          <td key={b.id} className="text-center py-2 px-3">
                            {b.results?.escalation_triggered ? (
                              <Badge variant="destructive" className="text-[10px]">Yes</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-success">No</Badge>
                            )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* AI Summaries */}
                {simulatedBranches.some(b => b.results?.ai_board_summary) && (
                  <div className="mt-4 space-y-3">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Analysis per Branch</h4>
                    {simulatedBranches.filter(b => b.results?.ai_board_summary).map(b => (
                      <div key={b.id} className="p-3 rounded-lg bg-muted/30 border border-border/20">
                        <p className="text-xs font-semibold text-primary mb-1">{b.name}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{b.results?.ai_board_summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </main>
    </>
    </DatasetRequired>
  );
};

export default ScenarioBranching;
