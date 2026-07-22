import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, GraphEdge } from "@/hooks/useOperationalGraph";

interface Props { nodes: GraphNode[]; edges: GraphEdge[]; }

// Walks backwards along derived_from / informed_by / caused_by to surface lineage trees.
export const GovernanceLineageExplorer = ({ nodes, edges }: Props) => {
  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;
  const lineageEdges = edges.filter((e) =>
    ["derived_from", "informed_by", "caused_by"].includes(e.edge_type)
  );

  // group by target (the "child")
  const byChild: Record<string, GraphEdge[]> = {};
  for (const e of lineageEdges) (byChild[e.target_node_id] ||= []).push(e);

  const items = Object.entries(byChild).slice(0, 15);
  if (!items.length) {
    return <Card className="p-6 text-sm text-muted-foreground">No governance lineage available.</Card>;
  }

  return (
    <div className="space-y-3">
      {items.map(([childId, parents]) => {
        const child = nodeMap[childId];
        if (!child) return null;
        return (
          <Card key={childId} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[10px] uppercase">{child.node_type}</Badge>
              <div className="font-medium">{child.title}</div>
            </div>
            <div className="space-y-1 pl-4 border-l-2 border-muted">
              {parents.slice(0, 6).map((e) => {
                const p = nodeMap[e.source_node_id];
                if (!p) return null;
                return (
                  <div key={e.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary" className="text-[9px] uppercase">{e.edge_type.replace("_", " ")}</Badge>
                    <span className="truncate">{p.title}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">{e.edge_staleness_state}</span>
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
