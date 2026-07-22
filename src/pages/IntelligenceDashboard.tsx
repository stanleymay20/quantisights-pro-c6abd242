/**
 * /intelligence-dashboard
 *
 * Visible command center for AICIS Layer C/D intelligence:
 *  - Top risk predictions (with confidence intervals + factors)
 *  - AICIS recommendations (with urgency, ROI, status)
 *  - Cross-domain influence adjacency-matrix heatmap
 *  - Auto-created decisions traced back to AICIS source
 *
 * Read-only. Strict Real Data Only — no synthetic samples.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  Brain,
  Clock,
  Globe2,
  Loader2,
  Network,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import IntelligenceDisclaimer from "@/components/IntelligenceDisclaimer";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useActiveDataContext } from "@/hooks/useActiveDataContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface Prediction {
  id: string;
  external_id: string;
  country_iso3: string | null;
  domain: string | null;
  risk_probability: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  horizon_days: number | null;
  evidence_count: number | null;
  rank_position: number | null;
  model_version: string | null;
  factors: any;
  generated_at: string | null;
}

interface Recommendation {
  id: string;
  external_id: string;
  country_iso3: string | null;
  domain: string | null;
  intervention_type: string | null;
  intervention_title: string | null;
  urgency_hours: number | null;
  urgency_window: string | null;
  confidence: number | null;
  estimated_cost_eur: number | null;
  estimated_roi_eur: number | null;
  status: string | null;
  generated_at: string | null;
}

interface InfluenceEdge {
  id: string;
  source_node: string | null;
  target_node: string | null;
  domain: string | null;
  edge_kind: string | null;
  weight: number | null;
  lag_days: number | null;
  region: string | null;
}

interface AutoDecision {
  id: string;
  recommended_action: string | null;
  decision_status: string | null;
  capped_confidence: number | null;
  linked_aicis_prediction_id: string | null;
  linked_aicis_recommendation_id: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function urgencyTone(hours: number | null): "destructive" | "default" | "secondary" {
  if (hours == null) return "secondary";
  if (hours <= 24) return "destructive";
  if (hours <= 72) return "default";
  return "secondary";
}

function riskTone(p: number | null): string {
  if (p == null) return "bg-muted text-muted-foreground";
  if (p >= 0.75) return "bg-destructive/15 text-destructive border-destructive/30";
  if (p >= 0.6) return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
}

function fmtPct(x: number | null, digits = 0): string {
  if (x == null || isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function fmtEur(x: number | null): string {
  if (x == null || isNaN(x)) return "—";
  if (Math.abs(x) >= 1_000_000) return `€${(x / 1_000_000).toFixed(1)}M`;
  if (Math.abs(x) >= 1_000) return `€${(x / 1_000).toFixed(1)}k`;
  return `€${x.toFixed(0)}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Heatmap (adjacency matrix) — pure CSS/SVG, no extra deps
// ──────────────────────────────────────────────────────────────────────────

function InfluenceHeatmap({ edges }: { edges: InfluenceEdge[] }) {
  const { domains, matrix, maxWeight } = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) {
      if (e.source_node) set.add(e.source_node);
      if (e.target_node) set.add(e.target_node);
    }
    const domains = Array.from(set).sort();
    const idx = new Map(domains.map((d, i) => [d, i]));
    const matrix: number[][] = Array.from({ length: domains.length }, () =>
      Array(domains.length).fill(0)
    );
    let max = 0;
    for (const e of edges) {
      if (!e.source_node || !e.target_node) continue;
      const i = idx.get(e.source_node);
      const j = idx.get(e.target_node);
      if (i == null || j == null) continue;
      const w = Math.abs(Number(e.weight ?? 0));
      matrix[i][j] += w;
      if (matrix[i][j] > max) max = matrix[i][j];
    }
    return { domains, matrix, maxWeight: max };
  }, [edges]);

  if (domains.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        Insufficient Data — no cross-domain influence edges ingested yet.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <div className="inline-block min-w-full">
        <div className="flex">
          <div className="w-32 shrink-0" />
          {domains.map((d) => (
            <div
              key={`col-${d}`}
              className="w-20 shrink-0 text-[10px] text-muted-foreground rotate-[-35deg] origin-bottom-left h-16 flex items-end justify-start pl-1"
              title={d}
            >
              {d}
            </div>
          ))}
        </div>
        {domains.map((rowDomain, i) => (
          <div key={`row-${rowDomain}`} className="flex items-stretch">
            <div className="w-32 shrink-0 text-xs text-muted-foreground pr-2 py-1 truncate text-right" title={rowDomain}>
              {rowDomain}
            </div>
            {domains.map((colDomain, j) => {
              const v = matrix[i][j];
              const intensity = maxWeight > 0 ? v / maxWeight : 0;
              const bg =
                v === 0
                  ? "hsl(var(--muted) / 0.3)"
                  : `hsl(var(--primary) / ${0.15 + intensity * 0.75})`;
              return (
                <div
                  key={`cell-${i}-${j}`}
                  className="w-20 h-8 shrink-0 border border-border/40 flex items-center justify-center text-[10px] font-mono"
                  style={{ background: bg }}
                  title={`${rowDomain} → ${colDomain}: ${v.toFixed(2)}`}
                >
                  {v > 0 ? v.toFixed(1) : ""}
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
          <span>Cumulative weight per source → target</span>
          <div className="flex items-center gap-1">
            <span>low</span>
            <div className="flex">
              {[0.15, 0.35, 0.55, 0.75, 0.9].map((a) => (
                <div
                  key={a}
                  className="w-4 h-3"
                  style={{ background: `hsl(var(--primary) / ${a})` }}
                />
              ))}
            </div>
            <span>high</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────────

export default function IntelligenceDashboard() {
  const { orgId } = useActiveDataContext();
  const [loading, setLoading] = useState(true);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [edges, setEdges] = useState<InfluenceEdge[]>([]);
  const [autoDecisions, setAutoDecisions] = useState<AutoDecision[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [predRes, recRes, edgeRes, decRes] = await Promise.all([
          supabase
            .from("aicis_predictions")
            .select("*")
            .eq("organization_id", orgId)
            .order("risk_probability", { ascending: false })
            .limit(50),
          supabase
            .from("aicis_recommendations")
            .select("*")
            .eq("organization_id", orgId)
            .order("urgency_hours", { ascending: true, nullsFirst: false })
            .limit(50),
          supabase
            .from("aicis_influence_graph")
            .select("*")
            .eq("organization_id", orgId)
            .order("weight", { ascending: false })
            .limit(500),
          supabase
            .from("decision_ledger")
            .select("id, recommended_action, decision_status, capped_confidence, linked_aicis_prediction_id, linked_aicis_recommendation_id, created_at")
            .eq("organization_id", orgId)
            .or("linked_aicis_prediction_id.not.is.null,linked_aicis_recommendation_id.not.is.null")
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;
        if (predRes.error) throw predRes.error;
        if (recRes.error) throw recRes.error;
        if (edgeRes.error) throw edgeRes.error;
        if (decRes.error) throw decRes.error;
        setPredictions((predRes.data ?? []) as Prediction[]);
        setRecommendations((recRes.data ?? []) as Recommendation[]);
        setEdges((edgeRes.data ?? []) as InfluenceEdge[]);
        setAutoDecisions((decRes.data ?? []) as AutoDecision[]);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load AICIS intelligence");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const stats = useMemo(() => {
    const highRisk = predictions.filter((p) => (p.risk_probability ?? 0) >= 0.6).length;
    const urgent = recommendations.filter((r) => (r.urgency_hours ?? Infinity) <= 72).length;
    const countries = new Set(predictions.map((p) => p.country_iso3).filter(Boolean)).size;
    const domains = new Set(predictions.map((p) => p.domain).filter(Boolean)).size;
    return { highRisk, urgent, countries, domains };
  }, [predictions, recommendations]);

  if (!orgId) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brain className="w-5 h-5 text-primary" /> Intelligence Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>No active organization is loaded yet. Once your workspace finishes loading — or after you select an org from the header — AICIS predictions, recommendations and the influence heatmap will appear here.</p>
            <Button asChild size="sm" variant="outline"><Link to="/dashboard">Go to Dashboard</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            Intelligence Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            AICIS Layer C/D — risk predictions, recommended interventions and cross-domain
            influence, with full provenance back to the licensed bridge feed.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/aicis-sync">
              <Sparkles className="w-4 h-4 mr-1.5" /> Sync Status
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/decisions">
              <ArrowUpRight className="w-4 h-4 mr-1.5" /> Decision Ledger
            </Link>
          </Button>
        </div>
      </div>

      <IntelligenceDisclaimer />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI
          icon={<AlertTriangle className="w-4 h-4" />}
          label="High-Risk Predictions"
          value={stats.highRisk}
          hint="risk ≥ 0.60"
          tone={stats.highRisk > 0 ? "warn" : "neutral"}
        />
        <KPI
          icon={<Clock className="w-4 h-4" />}
          label="Urgent Recommendations"
          value={stats.urgent}
          hint="≤ 72h window"
          tone={stats.urgent > 0 ? "warn" : "neutral"}
        />
        <KPI
          icon={<Globe2 className="w-4 h-4" />}
          label="Countries Tracked"
          value={stats.countries}
          hint="distinct ISO3"
        />
        <KPI
          icon={<Network className="w-4 h-4" />}
          label="Domains in Scope"
          value={stats.domains}
          hint="energy, finance, security…"
        />
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="py-4 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading AICIS intelligence…
        </div>
      ) : (
        <Tabs defaultValue="predictions" className="space-y-4">
          <TabsList>
            <TabsTrigger value="predictions">
              Risk Predictions <Badge variant="secondary" className="ml-2">{predictions.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="recommendations">
              Recommendations <Badge variant="secondary" className="ml-2">{recommendations.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="influence">
              Influence Heatmap <Badge variant="secondary" className="ml-2">{edges.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="auto-decisions">
              Auto-Decisions <Badge variant="secondary" className="ml-2">{autoDecisions.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="predictions">
            <SectionErrorBoundary sectionName="AICIS Predictions">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-primary" /> Top Risk Predictions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {predictions.length === 0 ? (
                    <EmptyState text="No AICIS predictions ingested for this organization yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Country</TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead>CI</TableHead>
                          <TableHead>Horizon</TableHead>
                          <TableHead>Evidence</TableHead>
                          <TableHead>Generated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {predictions.slice(0, 25).map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="font-mono text-xs">
                              {p.country_iso3 ?? "—"}
                            </TableCell>
                            <TableCell className="text-sm">{p.domain ?? "—"}</TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-xs font-medium border",
                                  riskTone(p.risk_probability)
                                )}
                              >
                                {fmtPct(p.risk_probability, 1)}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono">
                              [{fmtPct(p.confidence_lower, 0)} – {fmtPct(p.confidence_upper, 0)}]
                            </TableCell>
                            <TableCell className="text-xs">
                              {p.horizon_days ? `${p.horizon_days}d` : "—"}
                            </TableCell>
                            <TableCell>
                              <ConfidenceBadge
                                confidence={Math.min(100, ((p.evidence_count ?? 0) / 50) * 100)}
                              />
                              <span className="ml-1 text-[10px] text-muted-foreground">n={p.evidence_count ?? 0}</span>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {p.generated_at
                                ? formatDistanceToNow(new Date(p.generated_at), { addSuffix: true })
                                : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="recommendations">
            <SectionErrorBoundary sectionName="AICIS Recommendations">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Recommended Interventions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recommendations.length === 0 ? (
                    <EmptyState text="No AICIS recommendations ingested yet." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Country</TableHead>
                          <TableHead>Domain</TableHead>
                          <TableHead>Urgency</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Cost</TableHead>
                          <TableHead>ROI</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recommendations.slice(0, 25).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm max-w-xs truncate" title={r.intervention_title ?? ""}>
                              {r.intervention_title ?? r.intervention_type ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{r.country_iso3 ?? "—"}</TableCell>
                            <TableCell className="text-sm">{r.domain ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={urgencyTone(r.urgency_hours)} className="text-xs">
                                {r.urgency_hours != null ? `${r.urgency_hours}h` : (r.urgency_window ?? "—")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{fmtPct(r.confidence, 0)}</TableCell>
                            <TableCell className="text-xs">{fmtEur(r.estimated_cost_eur)}</TableCell>
                            <TableCell className="text-xs">{fmtEur(r.estimated_roi_eur)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">
                                {r.status ?? "open"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="influence">
            <SectionErrorBoundary sectionName="Influence Heatmap">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="w-4 h-4 text-primary" /> Cross-Domain Influence
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Adjacency matrix of AICIS-detected influence edges. Rows = source, columns =
                    target. Color intensity reflects cumulative weight.
                  </p>
                </CardHeader>
                <CardContent>
                  <InfluenceHeatmap edges={edges} />
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="auto-decisions">
            <SectionErrorBoundary sectionName="AICIS Auto-Decisions">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Decisions Auto-Created from AICIS
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Risk ≥ 0.60 OR urgency ≤ 72h triggers a pending decision. Confidence is capped
                    at 85% for external-only evidence.
                  </p>
                </CardHeader>
                <CardContent>
                  {autoDecisions.length === 0 ? (
                    <EmptyState text="No AICIS-linked decisions yet. Run the auto-decision job after the next sync." />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Decision</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Confidence</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {autoDecisions.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="text-sm max-w-md truncate" title={d.recommended_action ?? ""}>
                              {d.recommended_action ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {d.linked_aicis_prediction_id ? (
                                <Badge variant="secondary" className="text-xs">prediction</Badge>
                              ) : d.linked_aicis_recommendation_id ? (
                                <Badge variant="secondary" className="text-xs">recommendation</Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs capitalize">{d.decision_status ?? "—"}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {d.capped_confidence != null ? `${Math.round(d.capped_confidence)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" asChild>
                                <Link to={`/decisions?id=${d.id}`}>
                                  Open <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Small components
// ──────────────────────────────────────────────────────────────────────────

function KPI({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon} {label}
        </div>
        <div
          className={cn(
            "text-2xl font-semibold mt-1",
            tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground"
          )}
        >
          {value}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-sm text-muted-foreground py-10 text-center">{text}</div>
  );
}
