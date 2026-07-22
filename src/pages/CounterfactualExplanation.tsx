import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { FlipVertical, Loader2, AlertTriangle, ArrowUpDown, Gauge } from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Factor {
  factor: string;
  current_mean: number;
  threshold_to_flip: number;
  change_required_pct: number;
  sensitivity: string;
}

interface CounterfactualResult {
  entity_type: string;
  entity_id: string;
  original_recommendation: string;
  counterfactual_scenario: string;
  factors_to_change: Factor[];
  minimum_changes_required: number;
  narrative: string;
  confidence: number;
}

const CounterfactualExplanation = () => {
  const { orgId: currentOrgId, datasetId } = useActiveDataContext();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CounterfactualResult | null>(null);
  const [entityType, setEntityType] = useState<string>("decision");
  const [entityId, setEntityId] = useState<string>("");

  // Clear selection when dataset changes
  useEffect(() => {
    setEntityId("");
    setResult(null);
  }, [datasetId]);

  // Fetch available entities
  // Decisions are org-scoped (institutional memory), but reset selection on dataset change
  const { data: decisions } = useQuery({
    queryKey: ["decisions-for-cf", currentOrgId, datasetId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data } = await supabase.from("decision_ledger")
        .select("id, recommended_action, decision_status, capped_confidence")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!currentOrgId && entityType === "decision",
  });

  // Advisories are dataset-scoped — filter by active dataset
  const { data: advisories } = useQuery({
    queryKey: ["advisories-for-cf", currentOrgId, datasetId],
    queryFn: async () => {
      if (!currentOrgId || !datasetId) return [];
      const { data } = await supabase.from("advisory_instances")
        .select("id, title, status, capped_confidence")
        .eq("organization_id", currentOrgId)
        .eq("dataset_id", datasetId)
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: !!currentOrgId && !!datasetId && entityType === "advisory",
  });

  const entities = entityType === "decision" ? decisions : advisories;

  const runAnalysis = async () => {
    if (!currentOrgId || !datasetId || !entityId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<CounterfactualResult & { error?: string }>("counterfactual-explain", {
        body: { organization_id: currentOrgId, dataset_id: datasetId, entity_type: entityType, entity_id: entityId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data) setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Analysis failed";
      toast({ title: "Analysis failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sensitivityColor = (s: string) =>
    s === "high" ? "text-destructive" : s === "medium" ? "text-warning" : "text-success";

  return (
    <DatasetRequired moduleName="Counterfactual Explanations">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <FlipVertical className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Counterfactual Explanations</h1>
            <Badge variant="outline" className="text-xs">What-If Reversal</Badge>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Counterfactual Explanation">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Selection Controls */}
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-4">
                "What would need to change for the <strong>opposite</strong> recommendation?" — Select any AI recommendation to understand its fragility.
              </p>
              <div className="flex gap-3 flex-wrap">
                <Select value={entityType} onValueChange={(v) => { setEntityType(v); setEntityId(""); setResult(null); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="decision">Decision</SelectItem>
                    <SelectItem value="advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={entityId} onValueChange={setEntityId}>
                  <SelectTrigger className="flex-1 min-w-[250px]">
                    <SelectValue placeholder="Select a recommendation..." />
                  </SelectTrigger>
                  <SelectContent>
                    {entities?.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>
                        <span className="truncate">
                          {e.recommended_action || e.title}
                          {e.capped_confidence && <span className="text-muted-foreground ml-2">({Math.round(e.capped_confidence)}%)</span>}
                        </span>
                      </SelectItem>
                    ))}
                    {(!entities || entities.length === 0) && (
                      <SelectItem value="_none" disabled>No {entityType}s found</SelectItem>
                    )}
                  </SelectContent>
                </Select>

                <Button onClick={runAnalysis} disabled={loading || !entityId} className="gap-2 shrink-0">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlipVertical className="w-4 h-4" />}
                  Explain Counterfactual
                </Button>
              </div>
            </CardContent>
          </Card>

          {result && (
            <>
              {/* Original vs Counterfactual */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Current Recommendation</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{result.original_recommendation}</p>
                  </CardContent>
                </Card>
                <Card className="border-destructive/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs text-muted-foreground uppercase tracking-wider">Counterfactual Scenario</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{result.counterfactual_scenario}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Sensitivity Tornado */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ArrowUpDown className="w-4 h-4 text-primary" />
                      Factor Sensitivity (Change Required to Flip)
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      Min changes: {result.minimum_changes_required}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.factors_to_change.map((factor, idx) => (
                    <div key={idx} className="relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">{factor.factor.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-muted-foreground">
                            {factor.current_mean} → {factor.threshold_to_flip}
                          </span>
                          <span className={`font-mono font-bold ${sensitivityColor(factor.sensitivity)}`}>
                            {Math.round(factor.change_required_pct)}%
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${sensitivityColor(factor.sensitivity)}`}>
                            {factor.sensitivity}
                          </Badge>
                        </div>
                      </div>
                      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            factor.sensitivity === "high" ? "bg-destructive" :
                            factor.sensitivity === "medium" ? "bg-warning" : "bg-success"
                          }`}
                          style={{ width: `${Math.min(factor.change_required_pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Decision Robustness */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Gauge className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        Decision Robustness: {" "}
                        <span className={
                          result.factors_to_change.filter(f => f.sensitivity === "high").length === 0
                            ? "text-success" : "text-warning"
                        }>
                          {result.factors_to_change.filter(f => f.sensitivity === "high").length === 0
                            ? "Robust"
                            : `Fragile (${result.factors_to_change.filter(f => f.sensitivity === "high").length} high-sensitivity factors)`
                          }
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {result.factors_to_change.filter(f => f.sensitivity === "high").length === 0
                          ? "This recommendation is resilient to reasonable changes in input factors."
                          : "Small changes in key factors could flip this recommendation. Consider gathering more data or hedging."}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Narrative */}
              {result.narrative && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FlipVertical className="w-4 h-4 text-primary" />
                      AI Counterfactual Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{result.narrative}</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default CounterfactualExplanation;
