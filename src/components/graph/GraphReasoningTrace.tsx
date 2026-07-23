import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOperationalGraph, type TraversalResult, type GraphNode } from "@/hooks/useOperationalGraph";

const TRAVERSALS = [
  { value: "root_cause", label: "Root cause" },
  { value: "pressure_propagation", label: "Pressure propagation" },
  { value: "escalation_chain", label: "Escalation chain" },
  { value: "dependency_concentration", label: "Dependency concentration" },
  { value: "intervention_impact", label: "Intervention impact" },
  { value: "narrative_conflict", label: "Narrative conflict" },
  { value: "governance_lineage", label: "Governance lineage" },
];

export const GraphReasoningTrace = ({ nodes }: { nodes: GraphNode[] }) => {
  const { traverse } = useOperationalGraph();
  const [startNode, setStartNode] = useState<string>("");
  const [type, setType] = useState<string>("root_cause");
  const [result, setResult] = useState<TraversalResult | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!startNode) return;
    setLoading(true);
    try {
      const r = await traverse(startNode, type);
      setResult(r);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="font-medium">Deterministic reasoning trace</div>
      <div className="grid gap-2 md:grid-cols-3">
        <Select value={startNode} onValueChange={setStartNode}>
          <SelectTrigger><SelectValue placeholder="Start node" /></SelectTrigger>
          <SelectContent>
            {nodes.slice(0, 50).map((n) => (
              <SelectItem key={n.id} value={n.id}>{n.node_type}: {n.title.slice(0, 40)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {TRAVERSALS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={run} disabled={!startNode || loading}>{loading ? "Tracing..." : "Trace"}</Button>
      </div>

      {result && (
        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{result.traversal_type}</Badge>
            <span className="text-xs text-muted-foreground">
              Confidence: {(result.confidence * 100).toFixed(0)}% (capped 85%)
            </span>
          </div>
          {result.confidence_breakdown && (
            <div className="grid grid-cols-5 gap-2 text-[10px]">
              {Object.entries(result.confidence_breakdown).map(([k, v]) => (
                <div key={k} className="border rounded p-1">
                  <div className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</div>
                  <div className="font-semibold tabular-nums">{Math.round(v as number)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-1">
            {(result.reasoning_chain ?? []).map((step: Record<string, unknown>, i: number) => (
              <div key={i} className="text-xs border-l-2 border-primary/40 pl-3 py-1">
                <div className="font-medium">
                  Step {String(step.step ?? "")}: {String(step.from ?? "")} → {String(step.to ?? "")}
                </div>
                <div className="text-muted-foreground">
                  {String(step.label ?? "")}: {String(step.value ?? "")}
                </div>
              </div>
            ))}
          </div>
          {(result.reasoning_chain ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground">No path found.</div>
          )}
        </div>
      )}
    </Card>
  );
};
