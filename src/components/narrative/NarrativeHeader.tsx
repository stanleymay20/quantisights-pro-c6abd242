/**
 * NarrativeHeader — "Context before chart" (Storytelling with Data, Ch. 1).
 *
 * Every executive surface should lead with three answers, not a KPI grid:
 *   • WHO is this for?          (audience)
 *   • WHAT do we want them to do? (action)
 *   • WHY does it matter?         (takeaway — one sentence)
 *
 * Anchors reader attention before any chart, table, or metric loads.
 */
import { ArrowRight } from "lucide-react";
import { ReactNode } from "react";

export interface NarrativeHeaderProps {
  /** Who this surface is written for. e.g. "For the CFO" */
  audience: string;
  /** The single action we want them to take. e.g. "Approve or defer 3 pending decisions" */
  action: string;
  /** One-sentence takeaway. The "so what". */
  takeaway: string;
  /** Optional right-aligned status chip (e.g. governance banner) */
  status?: ReactNode;
  /** Compact variant for embedded contexts */
  compact?: boolean;
}

export function NarrativeHeader({
  audience,
  action,
  takeaway,
  status,
  compact = false,
}: NarrativeHeaderProps) {
  return (
    <div
      className={`rounded-xl border border-border/50 bg-card/40 ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <span>{audience}</span>
            <ArrowRight className="h-3 w-3 opacity-50" />
            <span className="text-primary">{action}</span>
          </div>
          <p
            className={`font-semibold leading-snug text-foreground ${
              compact ? "text-base" : "text-lg sm:text-xl"
            }`}
          >
            {takeaway}
          </p>
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>
    </div>
  );
}

export default NarrativeHeader;
