import { useState, useEffect } from "react";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";
import {
  Globe, Loader2, RefreshCw, TrendingUp, TrendingDown,
  AlertTriangle, Zap, Shield, BarChart3, Minus,
} from "lucide-react";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

interface Signal {
  category: string;
  title: string;
  summary: string;
  impact_level: string;
  direction: string;
  relevance_score: number;
  time_horizon?: string;
}

interface MarketData {
  signals: Signal[];
  market_sentiment: string;
  key_risks: string[];
  opportunities: string[];
}

const INDUSTRIES = [
  "Technology / SaaS",
  "Financial Services",
  "Healthcare",
  "Manufacturing",
  "Retail / E-Commerce",
  "Energy",
  "Real Estate",
  "Media / Entertainment",
];

const CATEGORY_ICONS: Record<string, any> = {
  macro_economic: BarChart3,
  industry_trend: TrendingUp,
  competitive: Zap,
  regulatory: Shield,
  technology: Globe,
  consumer: TrendingDown,
};

const IMPACT_COLORS: Record<string, string> = {
  high: "text-destructive border-destructive/30",
  medium: "text-warning border-warning/30",
  low: "text-muted-foreground border-border/50",
};

const DIRECTION_ICONS: Record<string, any> = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral: Minus,
};

const MarketIntelligence = () => {
  const { currentOrgId } = useOrganization();
  const { activeDatasetId } = useProject();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [industry, setIndustry] = useState("Technology / SaaS");
  const [customTopics, setCustomTopics] = useState("");
  const [data, setData] = useState<MarketData | null>(null);
  const [storedSignals, setStoredSignals] = useState<any[]>([]);

  const fetchStoredSignals = async () => {
    if (!currentOrgId || !activeDatasetId) return;
    const { data: signals } = await supabase
      .from("external_signals")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", activeDatasetId)
      .order("fetched_at", { ascending: false })
      .limit(30);
    if (signals) setStoredSignals(signals);
  };

  useEffect(() => { fetchStoredSignals(); }, [currentOrgId]);

  const fetchSignals = async () => {
    if (!currentOrgId || !activeDatasetId) {
      toast({ title: "Select a dataset first", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const topics = customTopics ? customTopics.split(",").map(t => t.trim()) : [];
      const { data: result, error } = await invokeWithRetry<MarketData>("fetch-market-signals", {
        body: { organization_id: currentOrgId, dataset_id: activeDatasetId, industry, topics },
      });
      if (error) throw error;
      if ((result as unknown as any)?.error) throw new Error(String((result as unknown as any).error));
      if (result) setData(result);
      fetchStoredSignals();
      toast({ title: "Market signals updated" });
    } catch (e: unknown) {
      toast({ title: "Signals unavailable", description: "Market signal generation is temporarily unavailable. Please try again in a moment or contact support if the issue persists.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const sentimentColor = (s: string) => {
    switch (s) {
      case "bullish": return "text-emerald-500 bg-emerald-500/10";
      case "bearish": return "text-destructive bg-destructive/10";
      case "cautious": return "text-amber-500 bg-amber-500/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  return (
    <DatasetRequired moduleName="Market Intelligence">
    <>
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Globe className="w-5 h-5 text-primary" />
            <h1 className="text-[18px] font-semibold tracking-tight">Market Intelligence</h1>
          </div>
        </header>

        <SectionErrorBoundary sectionName="Market Intelligence">
        <main className="flex-1 p-8 overflow-auto space-y-6">
          {/* Controls */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <Select value={industry} onValueChange={setIndustry}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map(i => (
                        <SelectItem key={i} value={i}>{i}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1">
                  <Input
                    value={customTopics}
                    onChange={e => setCustomTopics(e.target.value)}
                    placeholder="Custom topics (comma-separated)"
                  />
                </div>
                <Button onClick={fetchSignals} disabled={loading} className="gap-2 shrink-0">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Fetch Signals
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Empty state */}
          {!data && !loading && (
            <Card>
              <CardContent className="p-12 flex flex-col items-center text-center gap-3">
                <Globe className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">No signals fetched yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-xs leading-relaxed">
                  Select an industry sector and click "Fetch Signals" to generate AI-powered market intelligence signals for your sector.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Market Sentiment */}
          {data && (
            <div className="flex items-center gap-4">
              <Badge className={`text-sm px-4 py-1 ${sentimentColor(data.market_sentiment)}`}>
                Market Sentiment: {data.market_sentiment.toUpperCase()}
              </Badge>
              <span className="text-xs text-muted-foreground">{data.signals.length} signals detected</span>
            </div>
          )}

          {/* Signals Grid */}
          {data && data.signals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.signals.map((signal, idx) => {
                const CategoryIcon = CATEGORY_ICONS[signal.category] || Globe;
                const DirectionIcon = DIRECTION_ICONS[signal.direction] || Minus;
                return (
                  <Card key={idx}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CategoryIcon className="w-4 h-4 text-primary" />
                          <Badge variant="outline" className="text-[10px] capitalize">{signal.category.replace("_", " ")}</Badge>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${IMPACT_COLORS[signal.impact_level]}`}>
                          {signal.impact_level}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-semibold">{signal.title}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">{signal.summary}</p>
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1">
                          <DirectionIcon className={`w-3 h-3 ${
                            signal.direction === "positive" ? "text-emerald-500" :
                            signal.direction === "negative" ? "text-destructive" : "text-muted-foreground"
                          }`} />
                          <span className="text-[10px] capitalize text-muted-foreground">{signal.direction}</span>
                        </div>
                        {signal.time_horizon && (
                          <span className="text-[10px] text-muted-foreground capitalize">{signal.time_horizon.replace("_", " ")}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Risks & Opportunities */}
          {data && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.key_risks && data.key_risks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-4 h-4" /> Key Risks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {data.key_risks.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-destructive mt-0.5">•</span> {r}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {data.opportunities && data.opportunities.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 text-emerald-500">
                      <TrendingUp className="w-4 h-4" /> Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1">
                      {data.opportunities.map((o, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-emerald-500 mt-0.5">•</span> {o}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Stored signals history */}
          {!data && storedSignals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Signals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {storedSignals.slice(0, 10).map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{(s.data as any)?.title as string || s.signal_type}</p>
                        <p className="text-xs text-muted-foreground">{((s.data as any)?.summary as string)?.slice(0, 100)}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{new Date(s.fetched_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
        </SectionErrorBoundary>
    </>
    </DatasetRequired>
  );
};

export default MarketIntelligence;
