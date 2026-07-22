import { useState, useEffect, useRef } from "react";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Download, FileText, Shield, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Activity, Info, Loader2,
  BarChart3, Briefcase, Target, Eye,
} from "lucide-react";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import DatasetRequired from "@/components/layout/DatasetRequired";

// ─── Types ───
interface RoleRisk {
  role_type: string;
  score: number;
  components: { deviation: number; trend: number; volatility: number; forecast: number };
  escalation_required: boolean;
  last_updated?: string;
}

interface Convergence {
  score: number;
  alignment_status: string;
  dispersion: number;
  conflict_penalty: number;
}

interface DecisionRow {
  id: string;
  recommended_action: string;
  decision_type: string;
  decision_status: string;
  capped_confidence: number | null;
  predicted_net_impact: number | null;
  predicted_roi_probability: number | null;
  outcome_delta: number | null;
  execution_status: string;
  confidence_cap_reason: string | null;
  raw_confidence: number | null;
}

interface SimResult {
  metric_type: string;
  expected_value: number;
  p10_value: number;
  p90_value: number;
  probability_negative: number;
  capped_confidence: number | null;
  confidence_cap_reason: string | null;
  raw_confidence: number | null;
  sample_size: number;
  data_sufficiency: string;
}

interface Advisory {
  title: string;
  action: string;
  priority: string;
  category: string;
  capped_confidence: number | null;
  raw_confidence: number | null;
  confidence_cap_reason: string | null;
  rationale: string | null;
  impact_score: number | null;
  source_evidence: Array<any> | null;
}

// ─── Helpers ───
function fmt(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function confidenceLabel(raw: number | null, capped: number | null, reason: string | null): string {
  if (raw == null && capped == null) return "No confidence data available.";
  if (raw === capped || reason == null) return `Confidence: ${capped ?? raw}%. No cap applied — data meets quality thresholds.`;
  return `Raw model confidence was ${raw}%, reduced to ${capped}% because ${reason}. This ensures outputs remain defensible given data limitations.`;
}

function riskColor(score: number): string {
  if (score <= 25) return "bg-success";
  if (score <= 50) return "bg-primary";
  if (score <= 75) return "bg-warning";
  return "bg-destructive";
}

function riskTextColor(score: number): string {
  if (score <= 25) return "text-success";
  if (score <= 50) return "text-primary";
  if (score <= 75) return "text-warning";
  return "text-destructive";
}

function governancePosture(maxRisk: number, conflicts: number): { label: string; color: string; bg: string } {
  if (maxRisk > 75 || conflicts > 2) return { label: "RED — Immediate Board Attention", color: "text-destructive", bg: "bg-destructive/10" };
  if (maxRisk > 50 || conflicts > 0) return { label: "AMBER — Active Monitoring Required", color: "text-warning", bg: "bg-warning/10" };
  return { label: "GREEN — Stable Governance Posture", color: "text-success", bg: "bg-success/10" };
}

const RISK_DIMENSIONS = ["deviation", "trend", "volatility", "forecast"] as const;
const ROLES = ["ceo", "cfo", "cmo", "coo"];

const StrategyPack = () => {
  const { orgId: currentOrgId, datasetId: activeDatasetId } = useActiveDataContext();
  const [loading, setLoading] = useState(true);
  const [orgName, setOrgName] = useState("");

  // Data state
  const [roleRisks, setRoleRisks] = useState<RoleRisk[]>([]);
  const [convergence, setConvergence] = useState<Convergence | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [simulations, setSimulations] = useState<SimResult[]>([]);
  const [advisories, setAdvisories] = useState<Advisory[]>([]);
  const [selectedDecisions, setSelectedDecisions] = useState<string[]>([]);

  useEffect(() => {
    if (!currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const [orgRes, riskRes, eciRes, conflictRes, decRes, simRes, advRes] = await Promise.all([
        supabase.from("organizations").select("name").eq("id", currentOrgId).maybeSingle(),
        supabase.from("executive_risk_index").select("role_type, score, components, escalation_required, last_updated").eq("organization_id", currentOrgId),
        supabase.from("executive_convergence_index").select("score, alignment_status, dispersion, conflict_penalty").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("executive_conflicts").select("*").eq("organization_id", currentOrgId).is("resolved_at", null),
        supabase.from("decision_ledger").select("id, recommended_action, decision_type, decision_status, capped_confidence, predicted_net_impact, predicted_roi_probability, outcome_delta, execution_status, confidence_cap_reason, raw_confidence").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(50),
        supabase.from("simulation_results").select("metric_type, expected_value, p10_value, p90_value, probability_negative, capped_confidence, confidence_cap_reason, raw_confidence, sample_size, data_sufficiency").eq("organization_id", currentOrgId).order("created_at", { ascending: false }).limit(10),
        activeDatasetId
          ? supabase.from("advisory_instances").select("title, action, priority, category, capped_confidence, raw_confidence, confidence_cap_reason, rationale, impact_score, source_evidence").eq("organization_id", currentOrgId).eq("dataset_id", activeDatasetId).in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
      ]);

      setOrgName(orgRes.data?.name || "Organization");
      setRoleRisks((riskRes.data || []).map((r: any) => ({ ...r, components: (r.components as RoleRisk["components"]) || {} })) as RoleRisk[]);
      setConvergence(eciRes.data as unknown as Convergence | null);
      setConflicts(conflictRes.data || []);
      setDecisions((decRes.data || []) as unknown as DecisionRow[]);
      setSimulations((simRes.data || []) as unknown as SimResult[]);
      setAdvisories((advRes.data || []) as unknown as Advisory[]);
      setLoading(false);
    };
    load();
  }, [currentOrgId]);

  const maxRisk = roleRisks.reduce((m, r) => Math.max(m, r.score), 0);
  // Risk scores are recomputed periodically (compute-executive-signals),
  // so this pack and a board report generated moments apart can show
  // genuinely different current numbers -- both correct, just different
  // snapshots. Showing "today's date" instead of when the risk data was
  // actually last computed made that look like an unexplained
  // contradiction rather than a live-data timing difference.
  const riskDataAsOf = roleRisks.reduce<string | null>((latest, r) => {
    if (!r.last_updated) return latest;
    return !latest || r.last_updated > latest ? r.last_updated : latest;
  }, null);
  const posture = governancePosture(maxRisk, conflicts.length);
  const completedDecisions = decisions.filter(d => d.execution_status === "completed");
  const successRate = completedDecisions.length > 0
    ? (completedDecisions.filter(d => (d.outcome_delta || 0) > 0).length / completedDecisions.length * 100).toFixed(0)
    : null;

  const toggleDecisionSelect = (id: string) => {
    setSelectedDecisions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  const comparedDecisions = decisions.filter(d => selectedDecisions.includes(d.id));

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="text-muted-foreground">Compiling Strategy Pack…</p>
        </div>
      </main>
    );
  }

  return (
    <DatasetRequired moduleName="Strategy Pack">
    <>
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border px-6 py-4 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <SidebarMobileToggle />
              <Briefcase className="w-5 h-5 text-primary" />
              <div>
                <h1 className="text-lg font-semibold">Strategy Pack</h1>
                <p className="text-xs text-muted-foreground">Board-ready consulting deliverable</p>
              </div>
            </div>
            <Button onClick={() => window.print()} className="gap-2">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
          </div>
        </header>

        <IntelligenceDisclaimer variant="banner" context="report" />
        <div className="p-6 max-w-6xl mx-auto space-y-8 print:p-0 print:max-w-none">

          {/* ═══════ SLIDE 1: Executive Posture ═══════ */}
          <section className="print:break-after-page">
            <div className="flex items-center gap-2 mb-4 print:mb-2">
              <Badge variant="outline" className="text-xs font-mono">01</Badge>
              <h2 className="text-[16px] font-semibold tracking-tight">Executive Posture</h2>
            </div>
            <Card className={`${posture.bg} border-none`}>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-bold ${posture.color}`}>{posture.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {orgName} • Compiled {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    {riskDataAsOf && (
                      <> • Risk data as of {new Date(riskDataAsOf).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold">{maxRisk}<span className="text-lg text-muted-foreground">/100</span></p>
                  <p className="text-xs text-muted-foreground">Peak Risk Score</p>
                </div>
              </CardContent>
            </Card>

            {/* Key metrics strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <MiniStat label="Convergence" value={convergence ? `${convergence.score}%` : "—"} sub={convergence?.alignment_status || ""} />
              <MiniStat label="Active Conflicts" value={String(conflicts.length)} sub={conflicts.length > 0 ? "Unresolved" : "None"} />
              <MiniStat label="Decision Success" value={successRate ? `${successRate}%` : "—"} sub={`${completedDecisions.length} completed`} />
              <MiniStat label="Open Advisories" value={String(advisories.length)} sub={advisories.filter(a => a.priority === "high").length + " high priority"} />
            </div>
          </section>

          {/* ═══════ SLIDE 2: Risk Heatmap ═══════ */}
          <section className="print:break-after-page">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-xs font-mono">02</Badge>
              <h2 className="text-[16px] font-semibold tracking-tight">Risk Heatmap</h2>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Role</th>
                        <th className="text-center py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Overall</th>
                        {RISK_DIMENSIONS.map(d => (
                          <th key={d} className="text-center py-3 px-4 text-xs font-medium text-muted-foreground uppercase">{d}</th>
                        ))}
                        <th className="text-center py-3 px-4 text-xs font-medium text-muted-foreground uppercase">Escalation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROLES.map(role => {
                        const r = roleRisks.find(rr => rr.role_type === role);
                        return (
                          <tr key={role} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-4 font-semibold uppercase text-sm">{role}</td>
                            <td className="py-3 px-4 text-center">
                              {r ? (
                                <span className={`inline-flex items-center gap-1.5 font-bold ${riskTextColor(r.score)}`}>
                                  <span className={`w-2.5 h-2.5 rounded-full ${riskColor(r.score)}`} />
                                  {r.score}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </td>
                            {RISK_DIMENSIONS.map(dim => {
                              const val = r?.components?.[dim] ?? null;
                              return (
                                <td key={dim} className="py-3 px-4 text-center">
                                  {val !== null ? (
                                    <HeatCell value={val} />
                                  ) : <span className="text-muted-foreground text-xs">—</span>}
                                </td>
                              );
                            })}
                            <td className="py-3 px-4 text-center">
                              {r?.escalation_required ? (
                                <Badge className="bg-destructive/10 text-destructive border-destructive/30 text-xs">⚠ Yes</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">No</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* ═══════ SLIDE 3: Probabilistic Outlook ═══════ */}
          <section className="print:break-after-page">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-xs font-mono">03</Badge>
              <h2 className="text-[16px] font-semibold tracking-tight">Probabilistic Outlook</h2>
            </div>
            {simulations.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No simulations available. Run Monte Carlo from the Simulations module.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {simulations.slice(0, 5).map((sim, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold capitalize">{sim.metric_type.replace(/_/g, " ")}</h3>
                        <ConfidenceBadge raw={sim.raw_confidence} capped={sim.capped_confidence} reason={sim.confidence_cap_reason} />
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Expected</p>
                          <p className="font-mono font-semibold">{fmt(sim.expected_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">P10 Downside</p>
                          <p className="font-mono font-semibold text-destructive">{fmt(sim.p10_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">P90 Upside</p>
                          <p className="font-mono font-semibold text-primary">{fmt(sim.p90_value)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Decline Risk</p>
                          <p className="font-mono font-semibold">{Math.round(sim.probability_negative)}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Data Quality</p>
                          <p className="font-mono font-semibold capitalize">{sim.data_sufficiency}</p>
                        </div>
                      </div>
                      {/* Confidence transparency */}
                      <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground flex items-start gap-2">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <p>{confidenceLabel(sim.raw_confidence, sim.capped_confidence, sim.confidence_cap_reason)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ═══════ SLIDE 4: Decision Comparison ═══════ */}
          <section className="print:break-after-page">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-xs font-mono">04</Badge>
              <h2 className="text-[16px] font-semibold tracking-tight">Decision Comparison</h2>
              <span className="text-xs text-muted-foreground ml-2">Select up to 4 decisions to compare</span>
            </div>

            {/* Selection list */}
            <Card className="mb-4">
              <CardContent className="p-4 max-h-60 overflow-y-auto">
                <div className="space-y-1">
                  {decisions.slice(0, 20).map(d => (
                    <button
                      key={d.id}
                      onClick={() => toggleDecisionSelect(d.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedDecisions.includes(d.id) ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        selectedDecisions.includes(d.id) ? "bg-primary border-primary" : "border-border"
                      }`}>
                        {selectedDecisions.includes(d.id) && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </span>
                      <span className="truncate flex-1">{d.recommended_action}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{d.decision_type}</Badge>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Comparison table */}
            {comparedDecisions.length >= 2 ? (
              <Card>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-xs text-muted-foreground uppercase w-32">Metric</th>
                        {comparedDecisions.map(d => (
                          <th key={d.id} className="text-left py-3 px-4 text-xs text-muted-foreground max-w-[200px]">
                            <p className="truncate font-medium text-foreground">{d.recommended_action.slice(0, 50)}</p>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <CompRow label="Type" values={comparedDecisions.map(d => d.decision_type)} />
                      <CompRow label="Status" values={comparedDecisions.map(d => d.decision_status)} />
                      <CompRow label="Confidence" values={comparedDecisions.map(d => d.capped_confidence != null ? `${Math.round(d.capped_confidence)}%` : "—")} />
                      <CompRow label="ROI Prob." values={comparedDecisions.map(d => d.predicted_roi_probability != null ? `${Number(d.predicted_roi_probability).toFixed(0)}%` : "—")} />
                      <CompRow label="Net Impact" values={comparedDecisions.map(d => d.predicted_net_impact != null ? fmt(Number(d.predicted_net_impact)) : "—")} />
                      <CompRow label="Outcome Δ" values={comparedDecisions.map(d => d.outcome_delta != null ? `${Number(d.outcome_delta) > 0 ? "+" : ""}${Number(d.outcome_delta).toFixed(1)}%` : "—")} />
                      <CompRow label="Execution" values={comparedDecisions.map(d => d.execution_status.replace(/_/g, " "))} />
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">Select at least 2 decisions above to compare.</CardContent></Card>
            )}
          </section>

          {/* ═══════ SLIDE 5: Recommendations & Transparency ═══════ */}
          <section className="print:break-after-page">
            <div className="flex items-center gap-2 mb-4">
              <Badge variant="outline" className="text-xs font-mono">05</Badge>
              <h2 className="text-[16px] font-semibold tracking-tight">Strategic Recommendations</h2>
            </div>
            {advisories.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No active advisories.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {advisories.map((adv, i) => (
                  <Card key={i}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <h3 className="font-semibold">{adv.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{adv.action}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={adv.priority === "high" ? "destructive" : adv.priority === "medium" ? "default" : "secondary"} className="text-xs">
                            {adv.priority}
                          </Badge>
                          <ConfidenceBadge raw={adv.raw_confidence} capped={adv.capped_confidence} reason={adv.confidence_cap_reason} />
                        </div>
                      </div>

                      {/* "Why this recommendation?" transparency panel */}
                      <details className="group">
                        <summary className="flex items-center gap-2 text-xs text-primary cursor-pointer hover:underline">
                          <Eye className="w-3.5 h-3.5" />
                          Why this recommendation?
                        </summary>
                        <div className="mt-3 p-4 rounded-lg bg-muted/50 space-y-3 text-sm">
                          {adv.rationale && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Rationale</p>
                              <p>{adv.rationale}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Confidence Explanation</p>
                            <p className="text-xs">{confidenceLabel(adv.raw_confidence, adv.capped_confidence, adv.confidence_cap_reason)}</p>
                          </div>
                          {adv.impact_score != null && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Impact Score</p>
                              <p>{adv.impact_score}/100</p>
                            </div>
                          )}
                          {adv.source_evidence && Array.isArray(adv.source_evidence) && adv.source_evidence.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Source Evidence</p>
                              <ul className="list-disc list-inside text-xs space-y-1">
                                {adv.source_evidence.map((ev: any, idx: number) => (
                                  <li key={idx}>{typeof ev === "string" ? ev : JSON.stringify(ev)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Footer */}
          <div className="text-center py-8 text-xs text-muted-foreground border-t border-border print:border-none">
            <p>Confidential — {orgName} — Quantivis Strategy Pack</p>
            <p className="mt-1">{new Date().toISOString()}</p>
          </div>
        </div>
      </main>

      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:break-after-page { break-after: page; }
          @page { margin: 0.5in; size: A4; }
        }
      `}</style>
    </>
    </DatasetRequired>
  );
};

// ─── Sub-components ───

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground capitalize">{sub}</p>
      </CardContent>
    </Card>
  );
}

function HeatCell({ value }: { value: number }) {
  const normalized = Math.min(100, Math.max(0, value));
  const bg = normalized <= 25 ? "bg-success/20 text-success" :
             normalized <= 50 ? "bg-primary/20 text-primary" :
             normalized <= 75 ? "bg-warning/20 text-warning" :
             "bg-destructive/20 text-destructive";
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-mono font-semibold ${bg}`}>
      {normalized.toFixed(0)}
    </span>
  );
}

function ConfidenceBadge({ raw, capped, reason }: { raw: number | null; capped: number | null; reason: string | null }) {
  const display = capped ?? raw;
  if (display == null) return null;
  const wasCapped = raw != null && capped != null && raw !== capped;
  return (
    <Tooltip>
      <TooltipTrigger>
      <Badge variant="outline" className={`text-xs gap-1 ${wasCapped ? "border-warning/50 text-warning" : ""}`}>
          {wasCapped && <AlertTriangle className="w-3 h-3" />}
          {display}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {confidenceLabel(raw, capped, reason)}
      </TooltipContent>
    </Tooltip>
  );
}

function CompRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-b border-border/50">
      <td className="py-2.5 px-4 text-xs text-muted-foreground font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2.5 px-4 font-mono text-sm capitalize">{v}</td>
      ))}
    </tr>
  );
}

export default StrategyPack;
