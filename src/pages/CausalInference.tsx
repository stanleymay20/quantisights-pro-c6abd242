import { useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { Network, Loader2, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface CausalNode {
  id: string;
  label: string;
  data_points: number;
  mean: number;
}

interface CausalEdge {
  from: string;
  to: string;
  strength: number;
  lag: number;
  direction: string;
}

interface CausalResult {
  dag: { nodes: CausalNode[]; edges: CausalEdge[] };
  narrative: string;
  confidence: number;
  sample_size: number;
  metric_types_analyzed: number;
  causal_chains: string[][];
  insufficient_data?: boolean;
  message?: string;
}

const CausalInference = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CausalResult | null>(null);

  const runAnalysis = async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<CausalResult & { error?: string }>("causal-inference", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
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

  const strengthColor = (s: number) =>
    s >= 0.7 ? "text-success" : s >= 0.5 ? "text-warning" : "text-muted-foreground";

  return (
    <DatasetRequired moduleName="Causal Inference">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Network className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Causal Inference Engine</h1>
            <Badge variant="outline" className="text-xs">DAG Analysis</Badge>
          </div>
          <Button onClick={runAnalysis} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Network className="w-4 h-4" />}
            Run Causal Analysis
          </Button>
        </header>

        <SectionErrorBoundary sectionName="Causal Inference">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {!result && !loading && (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center space-y-4">
                <Network className="w-12 h-12 text-muted-foreground mx-auto" />
                <h2 className="text-lg font-semibold">Causal Directed Acyclic Graph (DAG)</h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Discover cause-and-effect relationships in your metrics using temporal precedence analysis (Granger-like causality).
                  Unlike correlation, this identifies which metrics actually <strong>drive</strong> others.
                </p>
                <Button onClick={runAnalysis} disabled={loading} size="lg" className="gap-2">
                  <Network className="w-4 h-4" /> Generate Causal Model
                </Button>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
                <h2 className="text-lg font-semibold">Building causal model…</h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Running temporal precedence analysis across your metrics to identify directional cause-and-effect relationships. This can take up to 30 seconds.
                </p>
              </CardContent>
            </Card>
          )}

          {result?.insufficient_data && (
            <Card className="border-warning/30">
              <CardContent className="p-6 flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-warning shrink-0" />
                <div>
                  <p className="font-medium">Insufficient Data</p>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">Current data points: {(result as unknown as any).data_points as number || 0}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && !result.insufficient_data && (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Causal Edges</p>
                    <p className="text-2xl font-bold font-mono mt-1">{result.dag.edges.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Metric Nodes</p>
                    <p className="text-2xl font-bold font-mono mt-1">{result.dag.nodes.length}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Confidence</p>
                    <p className={`text-2xl font-bold font-mono mt-1 ${result.confidence >= 70 ? "text-success" : result.confidence >= 50 ? "text-warning" : "text-destructive"}`}>
                      {Math.round(result.confidence)}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sample Size</p>
                    <p className="text-2xl font-bold font-mono mt-1">{result.sample_size}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Causal Chains */}
              {result.causal_chains.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-primary" />
                      Causal Chains
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.causal_chains.map((chain, idx) => (
                      <div key={idx} className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted/30 border border-border/30">
                        {chain.map((node, i) => (
                          <span key={i} className="flex items-center gap-2">
                            <Badge variant={i === 0 ? "default" : "outline"} className="text-xs">
                              {node.replace(/_/g, " ")}
                            </Badge>
                            {i < chain.length - 1 && <ArrowRight className="w-3 h-3 text-primary" />}
                          </span>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Causal Edges */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Causal Relationships</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {result.dag.edges.map((edge, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-border/30 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="text-xs">{edge.from.replace(/_/g, " ")}</Badge>
                          <ArrowRight className={`w-4 h-4 ${edge.direction === "positive" ? "text-success" : "text-destructive"}`} />
                          <Badge variant="outline" className="text-xs">{edge.to.replace(/_/g, " ")}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className={`font-mono font-bold ${strengthColor(edge.strength)}`}>
                            r={edge.strength}
                          </span>
                          <span className="text-muted-foreground">lag-{edge.lag}</span>
                          <Badge variant={edge.direction === "positive" ? "default" : "destructive"} className="text-[10px]">
                            {edge.direction}
                          </Badge>
                        </div>
                      </div>
                    ))}
                    {result.dag.edges.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No statistically significant causal relationships detected (threshold: r &gt; 0.3)
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* AI Narrative */}
              {result.narrative && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      AI Causal Interpretation
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

export default CausalInference;
