import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ChevronRight, Pause, Play, RotateCcw, Activity, AlertCircle, Layers, Compass, CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import GovernanceIntegrityBadge from "./GovernanceIntegrityBadge";

/**
 * TraversalPlayback — Phase 5E.5 primary demo surface
 *
 * Replays operational reasoning step-by-step:
 *   Signal → Pressure → Narrative → Intervention → Decision → Expected Outcome
 *
 * Calm, executive-grade animation. No flashy graph effects.
 * Each step shows evidence_refs, confidence contribution, propagation reason,
 * causal classification, operational implication.
 */

export type TraversalStageKind =
  | "signal"
  | "pressure"
  | "narrative"
  | "intervention"
  | "decision"
  | "outcome";

export interface TraversalStage {
  kind: TraversalStageKind;
  title: string;
  evidence_refs?: Array<{ label: string; ref?: string }>;
  confidence_contribution?: number; // 0..1
  propagation_reason?: string;
  causal_classification?: "deterministic" | "statistical" | "heuristic" | "correlation_only";
  operational_implication?: string;
}

interface Props {
  stages: TraversalStage[];
  autoplay?: boolean;
  stepMs?: number;
  className?: string;
  title?: string;
}

const STAGE_META: Record<TraversalStageKind, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  signal: { label: "Signal", icon: Activity, tone: "text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/5" },
  pressure: { label: "Pressure", icon: AlertCircle, tone: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5" },
  narrative: { label: "Narrative", icon: Layers, tone: "text-violet-600 dark:text-violet-400 border-violet-500/30 bg-violet-500/5" },
  intervention: { label: "Intervention", icon: Compass, tone: "text-cyan-600 dark:text-cyan-400 border-cyan-500/30 bg-cyan-500/5" },
  decision: { label: "Decision", icon: CheckCircle2, tone: "text-primary border-primary/30 bg-primary/5" },
  outcome: { label: "Expected Outcome", icon: Target, tone: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
};

const causalLabel = (c?: TraversalStage["causal_classification"]): string => {
  switch (c) {
    case "deterministic": return "Deterministic";
    case "statistical": return "Statistical inference";
    case "heuristic": return "Heuristic estimate";
    case "correlation_only": return "Correlation only";
    default: return "Observed";
  }
};

export const TraversalPlayback = ({ stages, autoplay = false, stepMs = 2200, className, title = "Reasoning playback" }: Props) => {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(autoplay);

  useEffect(() => {
    if (!playing) return;
    if (active >= stages.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setActive((i) => Math.min(i + 1, stages.length - 1)), stepMs);
    return () => clearTimeout(t);
  }, [playing, active, stages.length, stepMs]);

  const cumulativeConfidence = useMemo(() => {
    const visible = stages.slice(0, active + 1);
    if (!visible.length) return 0;
    const contribs = visible.map((s) => s.confidence_contribution ?? 0);
    const composite = contribs.reduce((acc, c) => acc + (1 - acc) * c, 0);
    return Math.min(0.85, composite); // governance cap
  }, [stages, active]);

  if (!stages.length) {
    return (
      <Card className={cn("p-6 text-sm text-muted-foreground", className)}>
        No traversal available yet. Rebuild the operational graph to generate reasoning chains.
      </Card>
    );
  }

  return (
    <Card className={cn("p-5 space-y-5", className)}>
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Executive reasoning replay</div>
          <h3 className="text-[13px] font-semibold truncate">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <GovernanceIntegrityBadge />
          <Button size="sm" variant="ghost" onClick={() => { setActive(0); setPlaying(false); }} aria-label="Restart">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant={playing ? "secondary" : "default"} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause className="h-3.5 w-3.5 mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
            {playing ? "Pause" : active >= stages.length - 1 ? "Replay" : "Play"}
          </Button>
        </div>
      </header>

      {/* Stage rail */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {stages.map((s, i) => {
          const meta = STAGE_META[s.kind];
          const Icon = meta.icon;
          const reached = i <= active;
          return (
            <div key={i} className="flex items-center shrink-0">
              <button
                onClick={() => { setActive(i); setPlaying(false); }}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-all duration-500",
                  reached ? meta.tone : "border-border/40 text-muted-foreground/60 bg-transparent",
                  i === active && "ring-1 ring-primary/40 shadow-sm",
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{meta.label}</span>
              </button>
              {i < stages.length - 1 && (
                <ChevronRight className={cn("h-3 w-3 mx-0.5 transition-colors duration-500", reached ? "text-foreground/40" : "text-border")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Active stage detail */}
      <div className="space-y-4">
        {stages.slice(0, active + 1).map((s, i) => {
          const meta = STAGE_META[s.kind];
          const Icon = meta.icon;
          const isActive = i === active;
          return (
            <div
              key={i}
              className={cn(
                "rounded-lg border p-4 transition-all duration-700",
                isActive ? "border-primary/30 bg-card shadow-sm" : "border-border/40 bg-muted/20 opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn("rounded-md border p-1.5", meta.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{meta.label}</div>
                    <div className="font-medium truncate">{s.title}</div>
                  </div>
                </div>
                {s.causal_classification && (
                  <Badge variant="outline" className="text-[10px] shrink-0">{causalLabel(s.causal_classification)}</Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                {s.propagation_reason && (
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground">Propagation reason</div>
                    <div className="text-foreground/85">{s.propagation_reason}</div>
                  </div>
                )}
                {s.operational_implication && (
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground">Operational implication</div>
                    <div className="text-foreground/85">{s.operational_implication}</div>
                  </div>
                )}
                {typeof s.confidence_contribution === "number" && (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Confidence contribution</span>
                      <span className="tabular-nums">{Math.round(s.confidence_contribution * 100)}%</span>
                    </div>
                    <Progress value={s.confidence_contribution * 100} className="h-1" />
                  </div>
                )}
                {s.evidence_refs && s.evidence_refs.length > 0 && (
                  <div className="space-y-0.5">
                    <div className="text-muted-foreground">Evidence</div>
                    <div className="flex flex-wrap gap-1">
                      {s.evidence_refs.map((e, j) => (
                        <Badge key={j} variant="secondary" className="text-[10px] font-normal">{e.label}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs border-t pt-3">
        <span className="text-muted-foreground">Composite confidence (governance-capped at 85%)</span>
        <span className="tabular-nums font-medium">{Math.round(cumulativeConfidence * 100)}%</span>
      </div>
    </Card>
  );
};

export default TraversalPlayback;
