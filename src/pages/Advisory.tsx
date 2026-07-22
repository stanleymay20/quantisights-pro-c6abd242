import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import DatasetRequired from "@/components/layout/DatasetRequired";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { embedAdvisoriesBatch } from "@/lib/decision-lifecycle";
import { useToast } from "@/hooks/use-toast";
import {
  Lightbulb, AlertTriangle, TrendingUp, DollarSign, Shield, Target,
  Loader2, ChevronDown, ChevronUp, RefreshCw, Clock, CheckCircle2,
  Zap, BarChart3, PlayCircle, Archive, XCircle, History,
} from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import ConfidenceBadge, { resolveConfidence } from "@/components/ConfidenceBadge";
import { useDecisionContexts } from "@/hooks/useDecisionContexts";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import DualLayerEvidencePanel from "@/components/dashboard/DualLayerEvidencePanel";
import TrustStrip from "@/components/trust/TrustStrip";
import { trustFromAdvisory } from "@/components/trust/trust-adapter";

interface Advisory {
  id: string;
  title: string;
  category: string;
  priority: "critical" | "high" | "medium" | "low";
  action: string;
  expected_impact: string;
  timeframe: string;
  confidence: number | null;
  rationale: string;
  kpi_affected: string[];
  playbook_steps: string[];
}

interface AdvisoryInstance {
  id: string;
  organization_id: string;
  advisory_type: string;
  title: string;
  category: string;
  priority: string;
  action: string;
  expected_impact: string | null;
  timeframe: string | null;
  confidence: number | null;
  rationale: string | null;
  kpi_affected: string[] | null;
  playbook_steps: string[] | null;
  status: string;
  assigned_to: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  impact_score: number | null;
  created_at: string;
  updated_at: string;
  // Dual-layer enrichment
  client_evidence_summary?: string | null;
  internal_context_summary?: string | null;
  combined_interpretation?: string | null;
  client_confidence?: number | null;
  enriched_confidence?: number | null;
  confidence_delta?: number | null;
  blending_rule?: string | null;
}

const PRIORITY_CONFIG: Record<string, { bg: string; border: string; text: string; label: string }> = {
  critical: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive", label: "Critical" },
  high: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", label: "High" },
  medium: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary", label: "Medium" },
  low: { bg: "bg-success/10", border: "border-success/30", text: "text-success", label: "Low" },
};

const CATEGORY_ICONS: Record<string, typeof Lightbulb> = {
  cost_optimization: DollarSign,
  revenue_growth: TrendingUp,
  risk_mitigation: Shield,
  operational: Target,
  strategic: Lightbulb,
};

const STATUS_CONFIG: Record<string, { icon: typeof PlayCircle; color: string; label: string }> = {
  open: { icon: AlertTriangle, color: "text-warning", label: "Open" },
  in_progress: { icon: PlayCircle, color: "text-primary", label: "In Progress" },
  resolved: { icon: CheckCircle2, color: "text-success", label: "Resolved" },
  dismissed: { icon: XCircle, color: "text-muted-foreground", label: "Dismissed" },
};

const AdvisoryPage = () => {
  const { orgId: currentOrgId, datasetId: activeDatasetId } = useActiveDataContext();
  const { activeContext } = useDecisionContexts(currentOrgId);
  const { toast } = useToast();
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [instances, setInstances] = useState<AdvisoryInstance[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [criticalCount, setCriticalCount] = useState(0);
  const [dataSufficiency, setDataSufficiency] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [resolutionText, setResolutionText] = useState<Record<string, string>>({});
  const [impactScore, setImpactScore] = useState<Record<string, string>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) return;
    const { data, error } = await supabase
      .from("advisory_instances")
      .select("*")
      .eq("organization_id", currentOrgId)
      .eq("dataset_id", activeDatasetId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setInstances(data as AdvisoryInstance[]);
  }, [currentOrgId, activeDatasetId]);

  const fetchAdvisories = useCallback(async () => {
    if (!currentOrgId || !activeDatasetId) return;
    setLoading(true);
    setTimedOut(false);
    // Client-side 20s hard cap so the spinner never runs forever
    const clientTimeout = setTimeout(() => {
      setLoading(false);
      setTimedOut(true);
    }, 20_000);
    try {
      const { data, error } = await invokeWithRetry<Record<string, unknown>>("prescriptive-advisory", {
        body: {
          organization_id: currentOrgId,
          dataset_id: activeDatasetId,
          ...(activeContext?.id ? { decision_context_id: activeContext.id } : {}),
        },
      }, { maxAttempts: 1, timeoutMs: 18_000 });
      clearTimeout(clientTimeout);
      if (error) throw error;
      if (data?.error) throw new Error(data.error as string);
      setAdvisories((data?.advisories as Advisory[]) || []);
      setCriticalCount((data?.critical_count as number) || 0);
      setDataSufficiency((data?.data_sufficiency as string) || null);
      setSampleSize((data?.sample_size as number) || 0);
      setHasRun(true);
      // Refetch instances since the edge function inserts new ones
      fetchInstances();
      // Embed new advisories into institutional memory (non-blocking)
      if (currentOrgId) embedAdvisoriesBatch(currentOrgId);
    } catch (err: unknown) {
      clearTimeout(clientTimeout);
      const msg = err instanceof Error ? err.message : "Unknown error";
      const isTimeout = msg.includes("timed out");
      if (isTimeout) {
        setTimedOut(true);
      } else {
        toast({ title: "Failed to load advisories", description: msg, variant: "destructive" });
      }
    } finally {
      clearTimeout(clientTimeout);
      setLoading(false);
    }
  }, [currentOrgId, activeDatasetId, activeContext?.id, toast, fetchInstances]);

  // Load existing instances immediately on mount — no auto-fire of the expensive edge function.
  // Users can manually trigger "Run Analysis" from the Live Analysis tab.
  useEffect(() => {
    if (currentOrgId && activeDatasetId) {
      fetchInstances();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, activeDatasetId]);

  const updateInstanceStatus = async (
    id: string,
    status: string,
    extras?: Partial<Database["public"]["Tables"]["advisory_instances"]["Update"]>,
  ) => {
    setUpdatingId(id);
    try {
      const update: Database["public"]["Tables"]["advisory_instances"]["Update"] = { status, ...extras };
      if (status === "resolved") update.resolved_at = new Date().toISOString();
      const { error } = await supabase
        .from("advisory_instances")
        .update(update)
        .eq("id", id);
      if (error) throw error;
      toast({ title: `Advisory marked as ${status}` });
      fetchInstances();
      setResolutionText(prev => { const next = { ...prev }; delete next[id]; return next; });
      setImpactScore(prev => { const next = { ...prev }; delete next[id]; return next; });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const renderAdvisoryCard = (adv: Advisory, i: number) => {
    const config = PRIORITY_CONFIG[adv.priority] || PRIORITY_CONFIG.low;
    const CategoryIcon = CATEGORY_ICONS[adv.category] || Lightbulb;
    const isExpanded = expanded === adv.id;

    return (
      <motion.div key={adv.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
        <Card className={`border ${config.border} transition-all`}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 flex-1">
                <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                  <CategoryIcon className={`w-5 h-5 ${config.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-base">{adv.title}</h3>
                    <Badge className={`${config.bg} ${config.text} border-none text-xs`}>{config.label}</Badge>
                    <Badge variant="outline" className="text-xs capitalize">{adv.category.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="text-sm text-foreground/80 mt-1">{adv.action}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {adv.timeframe}</span>
                    <span className="flex items-center gap-1"><BarChart3 className="w-3 h-3" /> <ConfidenceBadge confidence={adv.confidence} showDetails /></span>
                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {adv.expected_impact}</span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setExpanded(isExpanded ? null : adv.id)}>
                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </div>

            {isExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="mt-6 pt-6 border-t border-border space-y-5">
                <div>
                  <h4 className="text-sm font-semibold mb-2">Strategic Rationale</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{adv.rationale}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-2">KPIs Affected</h4>
                  <div className="flex flex-wrap gap-2">
                    {adv.kpi_affected.map((k, j) => <Badge key={j} variant="outline" className="text-xs">{k}</Badge>)}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" /> Action Playbook
                  </h4>
                  <ol className="space-y-2">
                    {adv.playbook_steps.map((step, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm">
                        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{j + 1}</span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <TrustStrip
                  record={trustFromAdvisory(adv, currentOrgId)}
                  variant="compact"
                />
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const openInstances = instances.filter(i => i.status === "open" || i.status === "in_progress");
  const closedInstances = instances.filter(i => i.status === "resolved" || i.status === "dismissed");

  return (
    <DatasetRequired moduleName="Advisory Engine" moduleDescription="Get AI-generated strategic advisories ranked by confidence and expected impact — calibrated to your actual performance data.">
      <SectionErrorBoundary sectionName="Advisory">
        <header className="h-14 border-b border-border/30 flex items-center justify-between px-8 shrink-0 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <SidebarMobileToggle />
            <h1 className="text-[18px] font-semibold tracking-tight">Prescriptive Advisory</h1>
            <p className="text-xs text-muted-foreground">AI-powered strategic recommendations with lifecycle tracking</p>
          </div>
          <Button onClick={() => { fetchAdvisories(); fetchInstances(); }} disabled={loading} variant="outline" size="sm" className="gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </Button>
        </header>

        <IntelligenceDisclaimer variant="banner" context="advisory" />
        <main className="flex-1 p-8 overflow-auto">
          <Tabs defaultValue="live" className="space-y-6">
            <TabsList>
              <TabsTrigger value="live" className="gap-2"><Zap className="w-4 h-4" /> Live Analysis</TabsTrigger>
              <TabsTrigger value="tracked" className="gap-2">
                <PlayCircle className="w-4 h-4" /> Tracked ({openInstances.length})
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-2"><History className="w-4 h-4" /> History ({closedInstances.length})</TabsTrigger>
            </TabsList>

            {/* Live Analysis Tab */}
            <TabsContent value="live" className="space-y-6">
              {criticalCount > 0 && (
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardContent className="p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    <span className="text-sm font-medium">
                      {criticalCount} critical action{criticalCount > 1 ? "s" : ""} require immediate attention
                    </span>
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <Card><CardContent className="py-16 flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-muted-foreground">Generating strategic recommendations...</p>
                  <p className="text-xs text-muted-foreground">This typically takes 10–20 seconds.</p>
                </CardContent></Card>
              ) : timedOut ? (
                <Card><CardContent className="py-16 flex flex-col items-center gap-4">
                  <AlertTriangle className="w-10 h-10 text-warning" />
                  <h2 className="text-lg font-semibold">Analysis is taking longer than expected</h2>
                  <p className="text-muted-foreground text-sm text-center max-w-md">
                    The advisory engine is busy processing. Your data is intact — try again in a moment or check tracked advisories below.
                  </p>
                  <Button onClick={() => { setTimedOut(false); fetchAdvisories(); }} variant="outline" size="sm" className="mt-2 gap-2">
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </Button>
                </CardContent></Card>
              ) : advisories.length === 0 ? (
                hasRun ? (
                  <Card>
                    <CardContent className="py-16 flex flex-col items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7 text-primary" />
                      </div>
                      <h2 className="text-lg font-semibold tracking-tight">All Clear — No Actions Required</h2>
                      <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
                        Your dataset has been analyzed ({sampleSize} records, data sufficiency: {dataSufficiency || "—"}).
                        All metrics are within healthy thresholds. No strategic interventions are recommended at this time.
                      </p>
                      <Button onClick={fetchAdvisories} variant="outline" size="sm" className="mt-2 gap-2">
                        <RefreshCw className="w-4 h-4" /> Re-run Analysis
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                <Card>
                  <CardContent className="py-16 flex flex-col items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Lightbulb className="w-7 h-7 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold tracking-tight">Run Live Analysis</h2>
                    <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
                      Generate AI-powered strategic recommendations calibrated to your dataset. Analysis typically takes 10–20 seconds.
                    </p>
                    <Button onClick={fetchAdvisories} size="sm" className="mt-2 gap-2">
                      <Zap className="w-4 h-4" /> Run Analysis
                    </Button>
                  </CardContent>
                </Card>
                )
              ) : (
                <div className="space-y-4">
                  {advisories.map((adv, i) => renderAdvisoryCard(adv, i))}
                </div>
              )}
            </TabsContent>

            {/* Tracked Advisories Tab */}
            <TabsContent value="tracked" className="space-y-4">
              {openInstances.length === 0 ? (
                <Card><CardContent className="py-16 flex flex-col items-center gap-4">
                  <Archive className="w-12 h-12 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">No Active Advisories</h2>
                  <p className="text-muted-foreground text-sm">Run the orchestration engine to generate tracked advisories.</p>
                </CardContent></Card>
              ) : openInstances.map((inst) => {
                const config = PRIORITY_CONFIG[inst.priority] || PRIORITY_CONFIG.low;
                const statusCfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.open;
                const StatusIcon = statusCfg.icon;
                const isExpanded = expanded === inst.id;

                return (
                  <motion.div key={inst.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className={`border ${config.border}`}>
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <h3 className="font-semibold">{inst.title}</h3>
                              <Badge className={`${config.bg} ${config.text} border-none text-xs`}>{config.label}</Badge>
                              <Badge variant="outline" className={`text-xs gap-1 ${statusCfg.color}`}>
                                <StatusIcon className="w-3 h-3" /> {statusCfg.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{inst.action}</p>
                            <p className="text-xs text-muted-foreground mt-2">Created {new Date(inst.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {inst.status === "open" && (
                              <Button size="sm" variant="outline" onClick={() => updateInstanceStatus(inst.id, "in_progress")} disabled={updatingId === inst.id}>
                                <PlayCircle className="w-4 h-4 mr-1" /> Start
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => setExpanded(isExpanded ? null : inst.id)}>
                              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-6 pt-6 border-t border-border space-y-4">
                            {inst.rationale && (
                              <div>
                                <h4 className="text-sm font-semibold mb-1">Rationale</h4>
                                <p className="text-sm text-muted-foreground">{inst.rationale}</p>
                              </div>
                            )}
                            {Array.isArray(inst.playbook_steps) && inst.playbook_steps.length > 0 && (
                              <div>
                                <h4 className="text-sm font-semibold mb-2">Playbook</h4>
                                <ol className="space-y-1">
                                  {inst.playbook_steps.map((s: string, j: number) => (
                                    <li key={j} className="text-sm text-muted-foreground flex gap-2">
                                      <span className="text-primary font-bold">{j + 1}.</span> {s}
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            )}
                            <DualLayerEvidencePanel
                              evidence={{
                                client_evidence_summary: inst.client_evidence_summary,
                                internal_context_summary: inst.internal_context_summary,
                                combined_interpretation: inst.combined_interpretation,
                                client_confidence: inst.client_confidence,
                                enriched_confidence: inst.enriched_confidence,
                                confidence_delta: inst.confidence_delta,
                                blending_rule: inst.blending_rule,
                              }}
                            />
                            <div className="flex flex-col gap-3 pt-4 border-t border-border">
                              <Textarea
                                placeholder="Resolution summary (what was done, outcome)..."
                                value={resolutionText[inst.id] || ""}
                                onChange={e => setResolutionText(prev => ({ ...prev, [inst.id]: e.target.value }))}
                                rows={2}
                              />
                              <div className="flex items-center gap-3">
                                <Select value={impactScore[inst.id] || ""} onValueChange={v => setImpactScore(prev => ({ ...prev, [inst.id]: v }))}>
                                  <SelectTrigger className="w-40"><SelectValue placeholder="Impact score" /></SelectTrigger>
                                  <SelectContent>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                                      <SelectItem key={n} value={String(n)}>{n}/10 Impact</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  onClick={() => updateInstanceStatus(inst.id, "resolved", {
                                    resolution_summary: resolutionText[inst.id] || null,
                                    impact_score: impactScore[inst.id] ? Number(impactScore[inst.id]) : null,
                                  })}
                                  disabled={updatingId === inst.id}
                                  className="gap-1"
                                >
                                  <CheckCircle2 className="w-4 h-4" /> Resolve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => updateInstanceStatus(inst.id, "dismissed")}
                                  disabled={updatingId === inst.id}
                                  className="gap-1"
                                >
                                  <XCircle className="w-4 h-4" /> Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-4">
              {closedInstances.length === 0 ? (
                <Card><CardContent className="py-16 flex flex-col items-center gap-4">
                  <History className="w-12 h-12 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">No History Yet</h2>
                  <p className="text-muted-foreground text-sm">Resolved and dismissed advisories will appear here.</p>
                </CardContent></Card>
              ) : closedInstances.map((inst) => {
                const config = PRIORITY_CONFIG[inst.priority] || PRIORITY_CONFIG.low;
                const statusCfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.open;
                return (
                  <Card key={inst.id} className="border-border/50 opacity-80">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-medium text-sm">{inst.title}</h3>
                            <Badge className={`${config.bg} ${config.text} border-none text-xs`}>{config.label}</Badge>
                            <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>{statusCfg.label}</Badge>
                            {inst.impact_score && (
                              <Badge variant="secondary" className="text-xs">{inst.impact_score}/10 impact</Badge>
                            )}
                          </div>
                          {inst.resolution_summary && (
                            <p className="text-xs text-muted-foreground mt-1">{inst.resolution_summary}</p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {inst.resolved_at ? new Date(inst.resolved_at).toLocaleDateString() : new Date(inst.updated_at).toLocaleDateString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>
          </Tabs>
        </main>
      </SectionErrorBoundary>
    </DatasetRequired>
  );
};

export default AdvisoryPage;
