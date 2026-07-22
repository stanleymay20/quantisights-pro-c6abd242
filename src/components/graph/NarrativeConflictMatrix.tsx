import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GraphNode, GraphEdge } from "@/hooks/useOperationalGraph";

interface Props { nodes: GraphNode[]; edges: GraphEdge[]; }

export const NarrativeConflictMatrix = ({ nodes, edges }: Props) => {
  const nodeMap: Record<string, GraphNode> = {};
  for (const n of nodes) nodeMap[n.id] = n;
  const conflictEdges = edges.filter((e) => e.edge_type === "contradicts");

  if (!conflictEdges.length) {
    return <Card className="p-6 text-sm text-muted-foreground">No narrative conflicts.</Card>;
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="font-medium mb-2">Narrative contradiction pairs</div>
      {conflictEdges.slice(0, 20).map((e) => {
        const a = nodeMap[e.source_node_id];
        const b = nodeMap[e.target_node_id];
        if (!a || !b) return null;
        const sev = e.strength >= 0.8 ? "critical" : e.strength >= 0.6 ? "high" : "medium";
        return (
          <div key={e.id} className="flex items-center gap-3 text-sm border rounded-md p-2">
            <Badge variant={sev === "critical" ? "destructive" : "secondary"} className="text-[9px] uppercase">{sev}</Badge>
            <span className="truncate flex-1">{a.title}</span>
            <span className="text-muted-foreground text-xs">⟷</span>
            <span className="truncate flex-1">{b.title}</span>
          </div>
        );
      })}
    </Card>
  );
};
