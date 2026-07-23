import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, GraphEdge } from "@/hooks/useOperationalGraph";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const PressurePropagationMap = ({ nodes, edges }: Props) => {
  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;
  const pressureEdges = edges.filter((e) => e.edge_type === "pressure_propagates_to");

  // Group by source pressure node
  const grouped: Record<string, GraphEdge[]> = {};
  for (const e of pressureEdges) {
    const k = e.source_node_id;
    (grouped[k] ||= []).push(e);
  }

  if (!Object.keys(grouped).length) {
    return <Card className="p-6 text-sm text-muted-foreground">No pressure propagation detected.</Card>;
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([srcId, list]) => {
        const src = nodeMap[srcId];
        if (!src) return null;
        return (
          <Card key={srcId} className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="destructive" className="text-[10px]">PRESSURE</Badge>
              <div className="font-medium">{src.title}</div>
              <span className="text-[10px] text-muted-foreground ml-auto">{list.length} downstream</span>
            </div>
            <div className="space-y-2">
              {list.slice(0, 8).map((e) => {
                const tgt = nodeMap[e.target_node_id];
                if (!tgt) return null;
                return (
                  <div key={e.id} className="flex items-center gap-3 text-sm border-l-2 border-primary/40 pl-3">
                    <span className="text-xs text-muted-foreground tabular-nums w-12">
                      {(e.propagation_weight * 100).toFixed(0)}%
                    </span>
                    <span className="truncate flex-1">{tgt.title}</span>
                    <Badge variant="outline" className="text-[9px]">{e.relationship_semantics}</Badge>
                    <Badge variant="outline" className="text-[9px]">{e.edge_staleness_state}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
