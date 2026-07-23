import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { BrainCircuit, Loader2, AlertTriangle, Shield, Eye, EyeOff, Anchor, TrendingDown, CheckCircle2, Search } from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface BiasDetection {
  bias_type: string;
  bias_name: string;
  confidence: number;
  evidence: string[];
  mitigation: string;
}

interface BiasResult {
  biases: BiasDetection[];
  ai_analysis: string;
  decisions_analyzed: number;
  scan_timestamp: string;
  insufficient_data?: boolean;
  message?: string;
}

const biasIcons: Record<string, typeof Anchor> = {
  anchoring: Anchor,
  sunk_cost: TrendingDown,
  confirmation: CheckCircle2,
  recency: Eye,
  overconfidence: Shield,
};

const severityFromConfidence = (c: number) =>
  c >= 70 ? { label: "High", class: "text-destructive border-destructive/30 bg-destructive/10" }
    : c >= 50 ? { label: "Medium", class: "text-warning border-warning/30 bg-warning/10" }
    : { label: "Low", class: "text-muted-foreground border-border/30 bg-muted/30" };

const CognitiveBiasDetection = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BiasResult | null>(null);
  const [expandedBias, setExpandedBias] = useState<string | null>(null);

  const runScan = async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<BiasResult & { error?: string }>("cognitive-bias-detect", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data) setResult(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Scan failed";
      toast({ title: "Scan failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DatasetRequired moduleName="Cognitive Bias Detection">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <BrainCircuit className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Cognitive Bias Detection</h1>
            <Badge variant="outline" className="text-xs">Behavioral Analysis</Badge>
          </div>
          <Button onClick={runScan} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Scan Decision Patterns
          </Button>
        </header>

        <SectionErrorBoundary sectionName="Cognitive Bias Detection">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {!result && !loading && (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center space-y-4">
                <BrainCircuit className="w-12 h-12 text-muted-foreground mx-auto" />
                <h2 className="text-lg font-semibold">Cognitive Bias Scanner</h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Automatically detect <strong>anchoring</strong>, <strong>sunk cost fallacy</strong>, <strong>confirmation bias</strong>,
                  <strong> recency bias</strong>, and <strong>overconfidence</strong> in your organization's decision history.
                </p>
                <Button onClick={runScan} disabled={loading} size="lg" className="gap-2">
                  <Search className="w-4 h-4" /> Analyze Decision Patterns
                </Button>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card className="border-dashed border-border/50">
              <CardContent className="p-12 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
                <h2 className="text-lg font-semibold">Scanning decision history…</h2>
                <p className="text-sm text-muted-foreground max-w-lg mx-auto">
                  Analyzing approval rates, confidence drift, and timing patterns across your decision ledger. This runs a full AI behavioral analysis and can take up to 30 seconds on larger histories.
                </p>
              </CardContent>
            </Card>
          )}

          {result?.insufficient_data && (
            <Card className="border-warning/30">
              <CardContent className="p-6 flex items-center gap-4">
                <AlertTriangle className="w-8 h-8 text-warning shrink-0" />
                <div>
                  <p className="font-medium">Insufficient Decision History</p>
                  <p className="text-sm text-muted-foreground">{result.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">Decisions analyzed: {result.decisions_analyzed}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {result && !result.insufficient_data && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Biases Detected</p>
                    <p className={`text-2xl font-bold font-mono mt-1 ${result.biases.length > 0 ? "text-warning" : "text-emerald-400"}`}>
                      {result.biases.length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Decisions Analyzed</p>
                    <p className="text-2xl font-bold font-mono mt-1">{result.decisions_analyzed}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Decision Health</p>
                    <p className={`text-2xl font-bold font-mono mt-1 ${result.biases.length === 0 ? "text-emerald-400" : result.biases.length <= 2 ? "text-amber-400" : "text-destructive"}`}>
                      {result.biases.length === 0 ? "Clean" : result.biases.length <= 2 ? "Caution" : "At Risk"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Detected Biases */}
              {result.biases.length > 0 ? (
                <div className="space-y-4">
                  {result.biases.map((bias, idx) => {
                    const Icon = biasIcons[bias.bias_type] || AlertTriangle;
                    const sev = severityFromConfidence(bias.confidence);
                    const isExpanded = expandedBias === bias.bias_type;
                    return (
                      <Card key={idx} className={`border ${sev.class} transition-all`}>
                        <CardContent className="p-0">
                          <button
                            onClick={() => setExpandedBias(isExpanded ? null : bias.bias_type)}
                            className="w-full p-4 flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-3">
                              <Icon className="w-5 h-5 shrink-0" />
                              <div>
                                <p className="font-semibold text-sm">{bias.bias_name}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Detection confidence: {Math.round(bias.confidence)}%
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-[10px] ${sev.class}`}>{sev.label} Risk</Badge>
                              {isExpanded ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4 text-muted-foreground" />}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Evidence</p>
                                <ul className="space-y-1">
                                  {bias.evidence.map((e, i) => (
                                    <li key={i} className="text-xs flex items-start gap-2">
                                      <span className="w-1 h-1 rounded-full bg-primary mt-1.5 shrink-0" />
                                      {e}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Mitigation Strategy</p>
                                <p className="text-xs leading-relaxed bg-muted/30 p-3 rounded-lg">{bias.mitigation}</p>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Card className="border-emerald-500/20">
                  <CardContent className="p-6 flex items-center gap-4">
                    <Shield className="w-8 h-8 text-emerald-400 shrink-0" />
                    <div>
                      <p className="font-medium text-emerald-400">No Cognitive Biases Detected</p>
                      <p className="text-sm text-muted-foreground">
                        Your decision patterns show no statistically significant bias indicators across {result.decisions_analyzed} analyzed decisions.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* AI Analysis */}
              {result.ai_analysis && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BrainCircuit className="w-4 h-4 text-primary" />
                      AI Behavioral Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-line">{result.ai_analysis}</p>
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

export default CognitiveBiasDetection;
