import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import { useOperationalGraph } from "@/hooks/useOperationalGraph";
import { GraphAttentionSummary } from "@/components/graph/GraphAttentionSummary";
import { OperationalTopologyView } from "@/components/graph/OperationalTopologyView";
import { PressurePropagationMap } from "@/components/graph/PressurePropagationMap";
import { DependencyChainPanel } from "@/components/graph/DependencyChainPanel";
import { NarrativeConflictMatrix } from "@/components/graph/NarrativeConflictMatrix";
import { GovernanceLineageExplorer } from "@/components/graph/GovernanceLineageExplorer";
import { GraphReasoningTrace } from "@/components/graph/GraphReasoningTrace";
import GovernanceIntegrityBadge from "@/components/executive/GovernanceIntegrityBadge";
import { Link } from "react-router-dom";
export default function OperationalGraph() {
  const { nodes, edges, scores, attention, patterns, governance, loading, busy, rebuildGraph } = useOperationalGraph();

  const breaches = governance.filter((g) => g.escalation_threshold_breached);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Operational Intelligence Graph</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Governed operational topology. Deterministic traversal. No invented causality.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <GovernanceIntegrityBadge />
          <Button asChild variant="outline" size="sm">
            <Link to="/boardroom">Open Boardroom</Link>
          </Button>
          <Button onClick={rebuildGraph} disabled={busy}>
            {busy ? "Rebuilding..." : "Rebuild graph"}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-5">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Nodes</div><div className="text-2xl font-semibold tabular-nums">{nodes.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Edges</div><div className="text-2xl font-semibold tabular-nums">{edges.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Scored</div><div className="text-2xl font-semibold tabular-nums">{scores.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Memory patterns</div><div className="text-2xl font-semibold tabular-nums">{patterns.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Threshold breaches</div><div className="text-2xl font-semibold tabular-nums">{breaches.length}</div></Card>
      </div>

      <SectionErrorBoundary sectionName="OperationalGraph">
        <Tabs defaultValue="executive" className="w-full">
          <TabsList className="grid grid-cols-7 w-full">
            <TabsTrigger value="executive">Executive</TabsTrigger>
            <TabsTrigger value="topology">Topology</TabsTrigger>
            <TabsTrigger value="pressure">Pressure</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
            <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
            <TabsTrigger value="lineage">Lineage</TabsTrigger>
            <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
          </TabsList>

          <TabsContent value="executive" className="space-y-4 mt-4">
            <div className="text-xs text-muted-foreground">
              Level 1 — Executive abstractions (top {Math.ceil(5 / 3)} compressed). You never default into raw graph clutter.
            </div>
            <GraphAttentionSummary views={attention} level={1} />
            <div className="text-xs text-muted-foreground mt-6">Level 2 — Operational chains</div>
            <GraphAttentionSummary views={attention} level={2} />
            <div className="text-xs text-muted-foreground mt-6">Level 3 — Evidence lineage</div>
            <GraphAttentionSummary views={attention} level={3} />
          </TabsContent>

          <TabsContent value="topology" className="mt-4">
            <OperationalTopologyView nodes={nodes} scores={scores} />
          </TabsContent>

          <TabsContent value="pressure" className="mt-4">
            <PressurePropagationMap nodes={nodes} edges={edges} />
          </TabsContent>

          <TabsContent value="dependencies" className="mt-4">
            <DependencyChainPanel nodes={nodes} edges={edges} />
          </TabsContent>

          <TabsContent value="conflicts" className="mt-4">
            <NarrativeConflictMatrix nodes={nodes} edges={edges} />
          </TabsContent>

          <TabsContent value="lineage" className="mt-4">
            <GovernanceLineageExplorer nodes={nodes} edges={edges} />
          </TabsContent>

          <TabsContent value="reasoning" className="mt-4">
            <GraphReasoningTrace nodes={nodes} />
          </TabsContent>
        </Tabs>
      </SectionErrorBoundary>

      {breaches.length > 0 && (
        <Card className="p-4 border-destructive/40">
          <div className="font-medium mb-2 flex items-center gap-2">
            <Badge variant="destructive">Governance escalations</Badge>
            <span className="text-xs text-muted-foreground">{breaches.length} active</span>
          </div>
          <div className="space-y-1 text-xs">
            {breaches.slice(0, 8).map((b) => (
              <div key={b.id} className="flex items-center gap-2 border-b last:border-0 py-1">
                <Badge variant="outline" className="text-[9px]">{b.threshold_kind}</Badge>
                <span className="tabular-nums">{b.threshold_value?.toFixed(0)}</span>
                <span className="text-muted-foreground truncate flex-1">{b.reason}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
    </div>
  );
}
