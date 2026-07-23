import { useState } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import DatasetRequired from "@/components/layout/DatasetRequired";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import { MessageSquare, Loader2, Sparkles, ArrowRight, Database, HelpCircle } from "lucide-react";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface QueryResult {
  answer: string;
  data_points?: { label: string; value: number; unit?: string }[];
  follow_up_questions?: string[];
  confidence: number;
  data_sources_used?: string[];
}

interface QueryHistory {
  query: string;
  result: QueryResult;
  timestamp: Date;
}

const SUGGESTED_QUERIES = [
  "What are the top performing metrics?",
  "Which segment has the highest growth?",
  "Show me month-over-month trends",
  "Which metrics are underperforming vs targets?",
  "What's the risk outlook for next quarter?",
  "Which data points have the highest variance?",
];

const NaturalLanguageQuery = () => {
  const { orgId: currentOrgId, datasetId } = useActiveDataContext();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QueryHistory[]>([]);

  const executeQuery = async (queryText: string) => {
    if (!currentOrgId || !datasetId || !queryText.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithRetry<QueryResult & { error?: string }>("nlq-query", {
        body: { organization_id: currentOrgId, dataset_id: datasetId, query: queryText },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data) setHistory(prev => [{ query: queryText, result: data, timestamp: new Date() }, ...prev]);
      setQuery("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Query failed";
      toast({ title: "Query failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor = (c: number) =>
    c >= 70 ? "text-emerald-500" : c >= 40 ? "text-amber-500" : "text-destructive";

  return (
    <DatasetRequired moduleName="Natural Language Query">
      <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <MessageSquare className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Ask Quantivis</h1>
            <Badge variant="outline" className="text-xs">Natural Language Query</Badge>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Natural Language Query">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Query Input */}
          <Card className="border-primary/20">
            <CardContent className="p-6">
              <div className="flex gap-3">
                <Input
                  placeholder="Ask anything about your data... e.g. 'What drove churn last quarter?'"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && executeQuery(query)}
                  className="text-base"
                  disabled={loading}
                />
                <Button onClick={() => executeQuery(query)} disabled={loading || !query.trim()} className="gap-2 shrink-0">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Ask
                </Button>
              </div>

              {/* Suggested Queries */}
              {history.length === 0 && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" /> Try these questions:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SUGGESTED_QUERIES.map(sq => (
                      <button
                        key={sq}
                        onClick={() => { setQuery(sq); executeQuery(sq); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                      >
                        {sq}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Results */}
          {history.map((item, idx) => (
            <Card key={idx} className="overflow-hidden">
              <CardHeader className="pb-2 bg-muted/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    {item.query}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${confidenceColor(item.result.confidence)}`}>
                      {Math.round(item.result.confidence)}% confidence
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {item.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <p className="text-sm leading-relaxed">{item.result.answer}</p>

                {/* Data Points */}
                {item.result.data_points && item.result.data_points.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {item.result.data_points.map((dp, i) => (
                      <div key={i} className="p-3 rounded-lg bg-muted/50 border border-border/30">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{dp.label}</p>
                        <p className="text-lg font-bold mt-1">
                          {typeof dp.value === "number" ? dp.value.toLocaleString() : dp.value}
                          {dp.unit && <span className="text-xs text-muted-foreground ml-1">{dp.unit}</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Data Sources */}
                {item.result.data_sources_used && item.result.data_sources_used.length > 0 && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Database className="w-3 h-3" />
                    Sources: {item.result.data_sources_used.join(", ")}
                  </div>
                )}

                {/* Follow-up Questions */}
                {item.result.follow_up_questions && item.result.follow_up_questions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Follow-up questions:</p>
                    <div className="flex flex-wrap gap-2">
                      {item.result.follow_up_questions.map((fq, i) => (
                        <button
                          key={i}
                          onClick={() => { setQuery(fq); executeQuery(fq); }}
                          className="text-xs px-3 py-1.5 rounded-full border border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          <ArrowRight className="w-3 h-3" /> {fq}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </main>
        </SectionErrorBoundary>
      </>
    </DatasetRequired>
  );
};

export default NaturalLanguageQuery;
