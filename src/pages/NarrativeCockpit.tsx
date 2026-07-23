import { useMemo } from "react";
import { useNarrativeFusion, type FusionCluster, type NarrativeConflict } from "@/hooks/useNarrativeFusion";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, RefreshCw, TrendingUp, TrendingDown, Minus, ShieldAlert, Hash } from "lucide-react";

function severityClass(s?: string | null): string {
  switch (s) {
    case "critical": return "bg-destructive text-destructive-foreground";
    case "high": return "bg-destructive/80 text-destructive-foreground";
    case "elevated": return "bg-orange-500/80 text-white";
    case "moderate": return "bg-yellow-500/80 text-black";
    default: return "bg-muted text-muted-foreground";
  }
}

function TrendIcon({ t }: { t: string }) {
  if (t === "rising") return <TrendingUp className="h-4 w-4 text-destructive" />;
  if (t === "falling") return <TrendingDown className="h-4 w-4 text-green-600" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function ConfidenceBreakdownPopover({ c }: { c: FusionCluster }) {
  const cb = c.confidence_breakdown;
  if (!cb) {
    return <Badge variant="outline">Confidence: {Math.round(c.confidence_score)}%</Badge>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge variant="outline" className="cursor-pointer">
          Confidence: {Math.round(cb.composite)}%
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <div className="font-semibold text-sm">Confidence decomposition</div>
          {[
            ["Data quality", cb.data_quality_confidence],
            ["Evidence volume", cb.evidence_volume_confidence],
            ["Cross-source consistency", cb.cross_source_consistency],
            ["Historical reliability", cb.historical_reliability],
            ["Model stability", cb.model_stability],
          ].map(([label, val]) => (
            <div key={String(label)} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{Math.round(Number(val))}%</span>
              </div>
              <Progress value={Number(val)} className="h-1" />
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NarrativeCard({ c, conflicts }: { c: FusionCluster; conflicts: NarrativeConflict[] }) {
  const linkedConflicts = conflicts.filter(
    (cf) => cf.narrative_a_id === c.id || cf.narrative_b_id === c.id,
  );
  const evidenceCount =
    (c.supporting_item_ids?.length ?? 0) +
    (c.supporting_intervention_ids?.length ?? 0) +
    (c.supporting_advisory_ids?.length ?? 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base">{c.title}</CardTitle>
              <TrendIcon t={c.trend_direction} />
              {c.narrative_severity && (
                <Badge className={severityClass(c.narrative_severity)}>{c.narrative_severity}</Badge>
              )}
              {c.version && c.version > 1 && (
                <Badge variant="outline" className="text-xs">v{c.version}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
              {c.narrative_class && <Badge variant="secondary">{c.narrative_class}</Badge>}
              {c.narrative_scope && <Badge variant="outline">{c.narrative_scope}</Badge>}
              {c.affected_domains?.slice(0, 3).map((d) => (
                <span key={d} className="px-1.5 py-0.5 rounded bg-muted">{d}</span>
              ))}
            </div>
          </div>
          {linkedConflicts.length > 0 && (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert className="h-3 w-3" />
              {linkedConflicts.length} conflict
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{c.canonical_summary || c.narrative}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Pressure</div>
            <div className="font-mono text-base">{Math.round(c.pressure_score)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Velocity</div>
            <div className="font-mono text-base">{c.escalation_velocity?.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Stability</div>
            <div className="font-mono text-base">{Math.round(c.stability_score ?? 0)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Volatility</div>
            <div className="font-mono text-base">{Math.round(c.volatility_score ?? 0)}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ConfidenceBreakdownPopover c={c} />
          <Badge variant="outline">Evidence: {evidenceCount}</Badge>
          {c.evidence_hash && (
            <Badge variant="outline" className="gap-1 font-mono text-xs">
              <Hash className="h-3 w-3" />
              {c.evidence_hash.slice(0, 8)}
            </Badge>
          )}
          {c.llm_rendered && <Badge variant="secondary">AI-rendered</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function PressureGauges({ latest }: { latest: ReturnType<typeof useNarrativeFusion>["pressureHistory"][number] | undefined }) {
  if (!latest) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No pressure snapshot yet. Run the fusion engine to populate.
        </CardContent>
      </Card>
    );
  }
  const dims = [
    ["Operational", latest.operational_pressure],
    ["Strategic", latest.strategic_pressure],
    ["Supply chain", latest.supply_chain_pressure],
    ["Regulatory", latest.regulatory_pressure],
    ["Execution", latest.execution_pressure],
    ["Cyber", latest.cyber_pressure],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Operational pressure</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {dims.map(([label, val]) => (
            <div key={label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono">{Math.round(Number(val ?? 0))}</span>
              </div>
              <Progress value={Number(val ?? 0)} className="h-1.5" />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs border-t pt-3">
          <div>
            <div className="text-muted-foreground">Overall</div>
            <div className="font-mono text-base">{Math.round(latest.pressure_score)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Velocity</div>
            <div className="font-mono text-base">{latest.pressure_velocity?.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Acceleration</div>
            <div className="font-mono text-base">{latest.pressure_acceleration?.toFixed(2)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function NarrativeCockpit() {
  const { clusters, pressureHistory, observability, conflicts, auditLog, loading, generating, regenerate } = useNarrativeFusion();
  const latestPressure = pressureHistory[pressureHistory.length - 1];

  const sorted = useMemo(
    () => clusters.slice().sort((a, b) => Number(b.pressure_score) - Number(a.pressure_score)),
    [clusters],
  );

  return (
    <SectionErrorBoundary sectionName="NarrativeCockpit">
      <div className="container py-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">Narrative cockpit</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compressed operational narratives, deterministic-first. LLMs only render phrasing.
            </p>
          </div>
          <Button onClick={() => regenerate()} disabled={generating || loading} size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Fusing…" : "Refresh"}
          </Button>
        </header>

        <PressureGauges latest={latestPressure} />

        {conflicts.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Narrative conflicts ({conflicts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {conflicts.slice(0, 5).map((cf) => {
                const a = clusters.find((c) => c.id === cf.narrative_a_id);
                const b = clusters.find((c) => c.id === cf.narrative_b_id);
                return (
                  <div key={cf.id} className="text-sm border rounded p-2 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={severityClass(cf.severity)}>{cf.severity}</Badge>
                      <Badge variant="outline">{cf.conflict_type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        Dimensions: {cf.affected_dimensions.join(", ")}
                      </span>
                    </div>
                    <div className="text-xs">
                      <span className="font-medium">{a?.title ?? "—"}</span>
                      <span className="text-muted-foreground"> vs </span>
                      <span className="font-medium">{b?.title ?? "—"}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="narratives">
          <TabsList>
            <TabsTrigger value="narratives">Narratives ({sorted.length})</TabsTrigger>
            <TabsTrigger value="audit">Audit ({auditLog.length})</TabsTrigger>
            <TabsTrigger value="observability">Observability</TabsTrigger>
          </TabsList>

          <TabsContent value="narratives" className="space-y-3 mt-4">
            {sorted.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  {loading ? "Loading narratives…" : "No active narratives. Generate fusion to surface operational meaning."}
                </CardContent>
              </Card>
            )}
            {sorted.map((c) => (
              <NarrativeCard key={c.id} c={c} conflicts={conflicts} />
            ))}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardContent className="pt-4 space-y-1 max-h-[60vh] overflow-y-auto">
                {auditLog.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-6">No audit events yet.</div>
                )}
                {auditLog.map((a) => (
                  <div key={a.id} className="text-xs border-b py-1.5 flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{a.event_type}</Badge>
                    <span className="text-muted-foreground font-mono">
                      {new Date(a.created_at).toLocaleString()}
                    </span>
                    {a.reason && <span className="text-muted-foreground italic">{a.reason}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="observability" className="mt-4">
            <Card>
              <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div><div className="text-muted-foreground text-xs">Inputs</div><div className="font-mono text-lg">{observability?.inputs_count ?? 0}</div></div>
                <div><div className="text-muted-foreground text-xs">Active narratives</div><div className="font-mono text-lg">{observability?.clusters_count ?? 0}</div></div>
                <div><div className="text-muted-foreground text-xs">Compression ratio</div><div className="font-mono text-lg">{((observability?.compression_ratio ?? 0) * 100).toFixed(1)}%</div></div>
                <div><div className="text-muted-foreground text-xs">Suppressed</div><div className="font-mono text-lg">{observability?.duplicates_suppressed ?? 0}</div></div>
                <div><div className="text-muted-foreground text-xs">→ Decision conversion</div><div className="font-mono text-lg">{(observability?.narrative_to_decision_conversion_pct ?? 0).toFixed(1)}%</div></div>
                <div><div className="text-muted-foreground text-xs">Resolution effectiveness</div><div className="font-mono text-lg">{(observability?.narrative_resolution_effectiveness_pct ?? 0).toFixed(1)}%</div></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SectionErrorBoundary>
  );
}
