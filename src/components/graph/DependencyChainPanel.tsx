import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, GraphEdge } from "@/hooks/useOperationalGraph";

interface Props { nodes: GraphNode[]; edges: GraphEdge[]; }

export const DependencyChainPanel = ({ nodes, edges }: Props) => {
  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;
  const depEdges = edges.filter((e) =>
    ["depends_on", "intervention_blocks", "intervention_accelerates", "resolved_by"].includes(e.edge_type)
  );

  if (!depEdges.length) {
    return <Card className="p-6 text-sm text-muted-foreground">No dependency chains detected.</Card>;
  }

  return (
    <Card className="p-4">
      <div className="font-medium mb-3">Intervention & dependency chains</div>
      <div className="space-y-2">
        {depEdges.slice(0, 25).map((e) => {
          const s = nodeMap[e.source_node_id];
          const t = nodeMap[e.target_node_id];
          if (!s || !t) return null;
          return (
            <div key={e.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
              <span className="truncate flex-1">{s.title}</span>
              <Badge variant="secondary" className="text-[9px] uppercase">{e.edge_type.replace(/_/g, " ")}</Badge>
              <span className="truncate flex-1 text-muted-foreground">{t.title}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right">
                {(e.strength * 100).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};
