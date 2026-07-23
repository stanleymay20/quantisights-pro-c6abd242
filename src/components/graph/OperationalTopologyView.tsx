import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, TopologyScore } from "@/hooks/useOperationalGraph";

interface Props {
  nodes: GraphNode[];
  scores: TopologyScore[];
}

export const OperationalTopologyView = ({ nodes, scores }: Props) => {
  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;
  const top = [...scores].sort((a, b) => b.blast_radius_score - a.blast_radius_score).slice(0, 12);

  if (!top.length) {
    return <Card className="p-6 text-sm text-muted-foreground">No topology computed yet.</Card>;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {top.map((s) => {
        const n = nodeMap[s.node_id];
        if (!n) return null;
        return (
          <Card key={s.node_id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline" className="text-[10px] uppercase">{n.node_type}</Badge>
              <span className="text-[10px] text-muted-foreground">centrality {s.centrality_score.toFixed(0)}</span>
            </div>
            <div className="font-medium truncate mb-3">{n.title}</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Blast radius</div>
                <div className="font-semibold tabular-nums">{s.blast_radius_score.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Propagation</div>
                <div className="font-semibold tabular-nums">{s.propagation_risk.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Conflict</div>
                <div className="font-semibold tabular-nums">{s.conflict_density.toFixed(0)}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t text-[10px] text-muted-foreground space-y-0.5">
              <div>Evidence confidence: {s.evidence_confidence.toFixed(0)}</div>
              <div>Relationship stability: {s.relationship_stability.toFixed(0)}</div>
              <div>Cross-source consistency: {s.cross_source_consistency.toFixed(0)}</div>
              <div>Topology reliability: {s.topology_reliability.toFixed(0)}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
