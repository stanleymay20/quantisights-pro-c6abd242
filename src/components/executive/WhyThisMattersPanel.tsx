import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphEdge, TopologyScore } from "@/hooks/useOperationalGraph";

/**
 * WhyThisMattersPanel — Phase 5E.5
 *
 * Converts operational topology into executive-readable meaning.
 * STRICT RULES:
 *  - Deterministic facts only (no LLM prose, no speculation).
 *  - "Label: value" format, anchored to scored evidence.
 *  - Bucketed thresholds — never invented precision.
 */

interface Props {
  node: GraphNode;
  score?: TopologyScore;
  outgoing?: GraphEdge[];
  incoming?: GraphEdge[];
  className?: string;
}

const bucket = (v: number, low = 30, mid = 60): "Low" | "Moderate" | "High" | "Elevated" => {
  if (v >= 80) return "Elevated";
  if (v >= mid) return "High";
  if (v >= low) return "Moderate";
  return "Low";
};

const trendLabel = (v: number): string => {
  if (v >= 70) return "Increasing";
  if (v >= 40) return "Stable";
  return "Receding";
};

const toneFor = (v: string): string => {
  switch (v) {
    case "Elevated":
      return "bg-destructive/10 text-destructive border-destructive/30";
    case "High":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
    case "Moderate":
      return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    default:
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  }
};

interface Row {
  label: string;
  value: string;
  tone?: string;
}

export const WhyThisMattersPanel = ({ node, score, outgoing = [], incoming = [], className }: Props) => {
  const exposure = node.exposure_score ?? 0;
  const volatility = node.volatility_score ?? 0;
  const criticality = score?.operational_criticality ?? node.operational_criticality ?? 0;
  const propagation = score?.propagation_risk ?? 0;
  const blast = score?.blast_radius_score ?? 0;
  const escalation = score?.escalation_density ?? 0;
  const conflict = score?.conflict_density ?? 0;
  const reliability = score?.topology_reliability ?? 0;

  const blocked = incoming.some((e) => e.edge_staleness_state === "invalid" || e.propagation_saturation_score > 0.9);

  const rows: Row[] = [
    {
      label: "Execution Pressure",
      value: bucket(propagation),
      tone: toneFor(bucket(propagation)),
    },
    {
      label: "Strategic Exposure",
      value: bucket(exposure),
      tone: toneFor(bucket(exposure)),
    },
    {
      label: "Escalation Velocity",
      value: trendLabel(escalation),
    },
    {
      label: "Governance Concern",
      value: conflict >= 60 ? "Conflicting narratives" : conflict >= 30 ? "Watchlist" : "Stable",
      tone: toneFor(bucket(conflict)),
    },
    {
      label: "Intervention Dependency",
      value: blocked ? "Blocked" : outgoing.length >= 3 ? "Multi-step" : "Direct",
      tone: blocked ? toneFor("Elevated") : undefined,
    },
    {
      label: "Operational Criticality",
      value: bucket(criticality),
      tone: toneFor(bucket(criticality)),
    },
    {
      label: "Blast Radius",
      value: bucket(blast),
      tone: toneFor(bucket(blast)),
    },
    {
      label: "Topology Reliability",
      value: bucket(reliability, 40, 70),
      tone: bucket(reliability, 40, 70) === "Low" ? toneFor("High") : toneFor("Low"),
    },
    {
      label: "Signal Volatility",
      value: bucket(volatility),
    },
  ];

  // "Why leadership should care" — composed from deterministic state, no AI prose.
  const cares: string[] = [];
  if (propagation >= 60) cares.push("Pressure propagates through dependent operations.");
  if (blast >= 60) cares.push("Disruption here radiates across multiple downstream nodes.");
  if (conflict >= 50) cares.push("Narrative conflict detected — competing interpretations of reality.");
  if (escalation >= 60) cares.push("Escalation density rising — governance attention warranted.");
  if (blocked) cares.push("Intervention path is currently blocked or saturated.");
  if (cares.length === 0) cares.push("Within governance tolerance. No active executive concern.");

  return (
    <Card className={cn("p-4 space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase">
              {node.node_type}
            </Badge>
            {node.operational_state && (
              <Badge variant="secondary" className="text-[10px]">
                {node.operational_state}
              </Badge>
            )}
          </div>
          <div className="font-medium truncate">{node.title}</div>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
          Why this matters
        </div>
        <ul className="space-y-1 text-sm">
          {cares.map((c, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary/50 shrink-0">›</span>
              <span className="text-foreground/85">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between text-xs border-b border-border/40 py-1">
            <span className="text-muted-foreground">{r.label}</span>
            <span
              className={cn(
                "tabular-nums font-medium px-1.5 py-0.5 rounded text-[10.5px] border",
                r.tone ?? "border-transparent text-foreground/80",
              )}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default WhyThisMattersPanel;
