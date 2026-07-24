/**
 * StoryArc — beginning / middle / end structure (Storytelling with Data, Ch. 7).
 *
 * Executive narratives should flow: Situation → Change → Decision → Evidence.
 *   • Situation: what was expected / baseline
 *   • Change:    what shifted (the conflict)
 *   • Decision:  what we recommend (the resolution)
 *   • Evidence:  the proof anchoring the recommendation
 *
 * Renders as a linear, print-safe timeline. Each stage is optional so
 * consumers can degrade gracefully when a stage's data is missing.
 */
import { CheckCircle2, GitBranch, MapPin, Scale } from "lucide-react";
import { ReactNode } from "react";

export interface StoryArcStage {
  label: string;
  body: ReactNode;
}

export interface StoryArcProps {
  situation?: StoryArcStage;
  change?: StoryArcStage;
  decision?: StoryArcStage;
  evidence?: StoryArcStage;
  className?: string;
}

const DEFAULTS = {
  situation: { label: "Situation", icon: MapPin, tone: "text-muted-foreground" },
  change: { label: "Change", icon: GitBranch, tone: "text-warning" },
  decision: { label: "Decision", icon: CheckCircle2, tone: "text-primary" },
  evidence: { label: "Evidence", icon: Scale, tone: "text-success" },
} as const;

type StageKey = keyof typeof DEFAULTS;

export function StoryArc({
  situation,
  change,
  decision,
  evidence,
  className = "",
}: StoryArcProps) {
  const stages: Array<{ key: StageKey; stage?: StoryArcStage }> = [
    { key: "situation", stage: situation },
    { key: "change", stage: change },
    { key: "decision", stage: decision },
    { key: "evidence", stage: evidence },
  ];

  const active = stages.filter((s) => s.stage);
  if (active.length === 0) return null;

  return (
    <div className={`grid gap-4 md:grid-cols-4 ${className}`}>
      {active.map(({ key, stage }, idx) => {
        const cfg = DEFAULTS[key];
        const Icon = cfg.icon;
        return (
          <div
            key={key}
            className="relative rounded-xl border border-border/50 bg-card/40 p-5 print:break-inside-avoid"
          >
            <div className="mb-3 flex items-center gap-2">
              <Icon className={`h-4 w-4 ${cfg.tone}`} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {String(idx + 1).padStart(2, "0")} · {stage!.label || cfg.label}
              </span>
            </div>
            <div className="text-sm leading-relaxed text-foreground/90">
              {stage!.body}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default StoryArc;
