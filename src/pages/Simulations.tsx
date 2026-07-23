import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useOrganization } from "@/hooks/useOrganization";
import { useProject } from "@/contexts/ProjectContext";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { Activity, TrendingUp, TrendingDown, Shield, Info, Loader2, BarChart3 } from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DatasetRequired from "@/components/layout/DatasetRequired";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";

const Simulations = () => {
  const { currentOrgId: organizationId } = useOrganization();
  const { activeDatasetId } = useProject();
  const queryClient = useQueryClient();
  const [metricType, setMetricType] = useState("");
  const [horizon, setHorizon] = useState("6");

  // Fetch available metric types
  const { data: metricTypes } = useQuery({
    queryKey: ["metric-types", organizationId, activeDatasetId],
    queryFn: async () => {
      if (!organizationId || !activeDatasetId) return [];
      const { data } = await supabase
        .from("metrics")
        .select("metric_type")
        .eq("organization_id", organizationId)
        .eq("dataset_id", activeDatasetId);
      const unique = [...new Set((data || []).map((m) => m.metric_type))];
      return unique.sort();
    },
    enabled: !!organizationId && !!activeDatasetId,
  });

  // Fetch past simulations — dataset-scoped
  const { data: simulations, isLoading } = useQuery({
    queryKey: ["simulations", organizationId, activeDatasetId],
    queryFn: async () => {
      if (!organizationId || !activeDatasetId) return [];
      const { data, error } = await supabase
        .from("simulation_results")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("dataset_id", activeDatasetId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && !!activeDatasetId,
  });

  const runSim = useMutation({
    mutationFn: async () => {
      if (!organizationId || !activeDatasetId) {
        throw new Error("Select an active dataset before running a simulation.");
      }
      if (!metricType) {
        throw new Error("Select a metric type first.");
      }

      const { data, error } = await invokeWithRetry<any>("monte-carlo-sim", {
        body: {
          organization_id: organizationId,
          dataset_id: activeDatasetId,
          metric_type: metricType,
          forecast_horizon: parseInt(horizon),
          simulation_runs: 10000,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      return data;
    },
    onSuccess: () => {
      toast({ title: "Simulation complete", description: "Monte Carlo results ready." });
      queryClient.invalidateQueries({ queryKey: ["simulations"] });
    },
    onError: (e: Error) => {
      toast({ title: "Simulation failed", description: e.message, variant: "destructive" });
    },
  });

  const latest = simulations?.[0];

  return (
    <DatasetRequired moduleName="Simulations" moduleDescription="Run what-if scenarios on your operational data — model the impact of price changes, headcount shifts, or supply chain disruptions before committing.">
    <SectionErrorBoundary sectionName="Monte Carlo Simulations">
        <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <Activity className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Monte Carlo Simulations</h1>
            <Badge variant="outline" className="ml-2 text-xs">Probabilistic Engine</Badge>
          </div>
        </header>

        <IntelligenceDisclaimer variant="banner" context="simulation" />
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          {/* Run simulation controls */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Run New Simulation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5 min-w-[200px]">
                  <label className="text-xs font-medium text-muted-foreground">Metric Type</label>
                  <Select value={metricType} onValueChange={setMetricType}>
                    <SelectTrigger><SelectValue placeholder="Select metric" /></SelectTrigger>
                    <SelectContent>
                      {(metricTypes || []).map((mt) => (
                        <SelectItem key={mt} value={mt}>{mt.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">Forecast Horizon</label>
                  <Select value={horizon} onValueChange={setHorizon}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 months</SelectItem>
                      <SelectItem value="6">6 months</SelectItem>
                      <SelectItem value="12">12 months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => runSim.mutate()}
                  disabled={!organizationId || !activeDatasetId || !metricType || runSim.isPending}
                >
                  {runSim.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running 10K paths…</>
                  ) : (
                    <><BarChart3 className="w-4 h-4 mr-2" />Run Simulation</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Latest result summary */}
          {latest && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* median_value, not expected_value (the arithmetic mean): GBM output is
                  log-normal/right-skewed, so the mean can legitimately fall outside the
                  P10-P90 band for volatile metrics. The median is the P50 percentile of
                  the same sorted path array, so it is always bounded by P10 and P90. */}
              <StatCard
                label="Expected Value"
                value={fmt(latest.median_value)}
                icon={<TrendingUp className="w-4 h-4 text-primary" />}
              />
              <StatCard
                label="P10 Downside"
                value={fmt(latest.p10_value)}
                icon={<TrendingDown className="w-4 h-4 text-destructive" />}
              />
              <StatCard
                label="P90 Upside"
                value={fmt(latest.p90_value)}
                icon={<TrendingUp className="w-4 h-4 text-primary" />}
              />
              <StatCard
                label="Prob. of Decline"
                value={`${Math.round(latest.probability_negative)}%`}
                icon={<Shield className="w-4 h-4 text-muted-foreground" />}
              />
            </div>
          )}

          {/* Distribution band for latest */}
          {latest && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Probability Distribution</CardTitle>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant={latest.data_sufficiency === "robust" ? "default" : "secondary"} className="text-xs">
                      Confidence: {Math.round(latest.capped_confidence)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p>Raw: {Math.round(latest.raw_confidence)}% → Capped: {Math.round(latest.capped_confidence)}%</p>
                    <p>{latest.confidence_cap_reason}</p>
                    <p>Sample size: {latest.sample_size} | Variance: {Math.round(latest.variance_score)}%</p>
                  </TooltipContent>
                </Tooltip>
              </CardHeader>
              <CardContent>
                <DistributionBand sim={latest} />
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
                  <div>Mean Growth Rate: <span className="font-mono text-foreground">{latest.mean_growth_rate}%/period</span></div>
                  <div>Volatility (σ): <span className="font-mono text-foreground">{latest.volatility}%</span></div>
                  <div>VaR 95%: <span className="font-mono text-foreground">{fmt(latest.value_at_risk_95)}</span></div>
                  <div>Data Sufficiency: <span className="font-mono text-foreground capitalize">{latest.data_sufficiency}</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Simulation History</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                </div>
              ) : !simulations?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">No simulations yet. Run your first one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground text-xs">
                        <th className="text-left py-2 pr-4">Metric</th>
                        <th className="text-right py-2 px-2">Horizon</th>
                        <th className="text-right py-2 px-2">Expected</th>
                        <th className="text-right py-2 px-2">P10</th>
                        <th className="text-right py-2 px-2">P90</th>
                        <th className="text-right py-2 px-2">Decline %</th>
                        <th className="text-right py-2 px-2">Conf.</th>
                        <th className="text-right py-2 pl-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulations.map((s) => (
                        <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2.5 pr-4 font-medium">{s.metric_type.replace(/_/g, " ")}</td>
                          <td className="text-right px-2">{s.forecast_horizon}mo</td>
                          <td className="text-right px-2 font-mono">{fmt(s.median_value)}</td>
                          <td className="text-right px-2 font-mono text-destructive">{fmt(s.p10_value)}</td>
                          <td className="text-right px-2 font-mono text-primary">{fmt(s.p90_value)}</td>
                          <td className="text-right px-2">{Math.round(s.probability_negative)}%</td>
                          <td className="text-right px-2">
                            <Badge variant="outline" className="text-xs">{Math.round(s.capped_confidence)}%</Badge>
                          </td>
                          <td className="text-right pl-2 text-muted-foreground text-xs">
                            {new Date(s.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
    </main>
        </SectionErrorBoundary>
    </DatasetRequired>
  );
};

function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-semibold font-mono">{value}</p>
      </CardContent>
    </Card>
  );
}

function DistributionBand({ sim }: { sim: any }) {
  const min = Number(sim.p10_value);
  const max = Number(sim.p90_value);
  const range = max - min || 1;
  const pos = (v: number) => ((v - min) / range) * 100;
  const p25 = Math.max(0, Math.min(100, pos(Number(sim.p25_value))));
  const median = Math.max(0, Math.min(100, pos(Number(sim.median_value))));
  const p75 = Math.max(0, Math.min(100, pos(Number(sim.p75_value))));

  return (
    <div className="space-y-2">
      <div className="relative h-10 rounded-lg overflow-hidden bg-muted">
        {/* P10-P90 full band */}
        <div className="absolute inset-0 bg-gradient-to-r from-destructive/20 via-primary/20 to-primary/30" />
        {/* IQR band P25-P75 */}
        <div
          className="absolute top-1 bottom-1 bg-primary/30 rounded"
          style={{ left: `${p25}%`, width: `${p75 - p25}%` }}
        />
        {/* Median line */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-foreground/70" style={{ left: `${median}%` }} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground font-mono">
        <span>P10: {fmt(sim.p10_value)}</span>
        <span>Median: {fmt(sim.median_value)}</span>
        <span>P90: {fmt(sim.p90_value)}</span>
      </div>
    </div>
  );
}

export default Simulations;
