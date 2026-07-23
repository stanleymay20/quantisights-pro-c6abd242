import { useState } from "react";
import { useNarrativeFusion, type FusionCluster } from "@/hooks/useNarrativeFusion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, RefreshCw, TrendingUp, TrendingDown, Minus, Layers } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, AreaChart, Area, BarChart, Bar, Legend, CartesianGrid } from "recharts";

function trendIcon(t: string) {
  if (t === "rising") return <TrendingUp className="h-3.5 w-3.5 text-destructive" />;
  if (t === "falling") return <TrendingDown className="h-3.5 w-3.5 text-success" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function ClusterRow({ c }: { c: FusionCluster }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {trendIcon(c.trend_direction)}
              <h4 className="font-semibold text-sm truncate">{c.title}</h4>
              <Badge variant="outline" className="text-[10px]">{c.cluster_type}</Badge>
            </div>
            <p className="text-sm text-muted-foreground leading-snug">{c.narrative}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="text-2xl font-bold tabular-nums">{Math.round(c.pressure_score)}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Pressure</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3 text-[11px]">
          {c.affected_domains.slice(0, 4).map((d) => <Badge key={d} variant="secondary">{d}</Badge>)}
          {c.affected_geographies.slice(0, 3).map((g) => <Badge key={g} variant="outline">{g}</Badge>)}
          <Badge variant="outline">v {c.escalation_velocity.toFixed(1)}/d</Badge>
          <Badge variant="outline">conf {Math.round(c.confidence_score)}%</Badge>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs gap-1">
            <ChevronDown className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`} />
            Evidence ({c.supporting_item_ids.length + c.supporting_intervention_ids.length + c.supporting_advisory_ids.length})
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-1 text-xs text-muted-foreground">
          <div>Items: {c.supporting_item_ids.length} · Interventions: {c.supporting_intervention_ids.length} · Advisories: {c.supporting_advisory_ids.length}</div>
          {c.affected_entities.length > 0 && (
            <div>Entities: {c.affected_entities.slice(0, 8).join(", ")}</div>
          )}
          <div>Narrative strength: {Math.round(c.narrative_strength)} · Generated {new Date(c.generated_at).toLocaleString()}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function NarrativeFusionPanel() {
  const { clusters, pressureHistory, observability, loading, generating, regenerate } = useNarrativeFusion();
  const latest = pressureHistory[pressureHistory.length - 1];

  const trendData = pressureHistory.map((p) => ({
    t: new Date(p.snapshot_at).toLocaleDateString(),
    pressure: Math.round(p.pressure_score),
    velocity: +p.pressure_velocity.toFixed(2),
    stabilization: Math.round(p.stabilization_indicator),
  }));

  const pressureMap = latest ? [
    { name: "Operational", value: Math.round(latest.operational_pressure) },
    { name: "Strategic", value: Math.round(latest.strategic_pressure) },
    { name: "Geopolitical", value: Math.round(latest.geopolitical_pressure) },
    { name: "Cyber", value: Math.round(latest.cyber_pressure) },
    { name: "Supply Chain", value: Math.round(latest.supply_chain_pressure) },
    { name: "Regulatory", value: Math.round(latest.regulatory_pressure) },
    { name: "Execution", value: Math.round(latest.execution_pressure) },
  ] : [];

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" /> Narrative Fusion
          </h2>
          <p className="text-xs text-muted-foreground">
            Compressed operational narratives across signals, interventions, and advisories.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => regenerate()} disabled={generating || loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-2 ${generating ? "animate-spin" : ""}`} />
          {generating ? "Fusing…" : "Regenerate"}
        </Button>
      </div>

      {observability && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Compression</div>
            <div className="text-xl font-bold">{(observability.compression_ratio * 100).toFixed(1)}%</div>
            <div className="text-[10px] text-muted-foreground">{observability.clusters_count} / {observability.inputs_count} inputs</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Duplicates Suppressed</div>
            <div className="text-xl font-bold">{observability.duplicates_suppressed}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">→ Decision Rate</div>
            <div className="text-xl font-bold">{observability.narrative_to_decision_conversion_pct.toFixed(1)}%</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Resolution Effectiveness</div>
            <div className="text-xl font-bold">{observability.narrative_resolution_effectiveness_pct.toFixed(1)}%</div>
          </Card>
        </div>
      )}

      {trendData.length > 1 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2">Pressure Trend</h3>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip />
                <Area type="monotone" dataKey="pressure" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.2)" />
                <Area type="monotone" dataKey="stabilization" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-2">Escalation Velocity</h3>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="velocity" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {pressureMap.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Organizational Pressure Map</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={pressureMap} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Fused Narratives ({clusters.length})</h3>
        {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
        {!loading && clusters.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Awaiting intelligence activity. Narratives appear when ≥2 related signals are detected.
          </Card>
        )}
        {clusters.map((c) => <ClusterRow key={c.id} c={c} />)}
      </div>
    </div>
  );
}
