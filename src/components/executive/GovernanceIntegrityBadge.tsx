import { ShieldCheck, ShieldAlert } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * GovernanceIntegrityBadge — Phase 5E.5
 *
 * Makes trust visible at the surface level. Renders a compact pill that
 * deterministically declares the governance posture of a piece of reasoning:
 *
 *   - confidence_capped          → hard ceiling at 0.85
 *   - evidence_complete          → all evidence_refs resolved
 *   - deterministic_reasoning    → no LLM math/projection
 *   - no_fabricated_causality    → causal_classification ∈ deterministic set
 *   - governance_safe_traversal  → traversal honored decay + saturation
 *
 * Designed for executive surfaces. No backend terminology. No jargon.
 */
export interface GovernanceIntegrityFlags {
  confidence_capped?: boolean;
  evidence_complete?: boolean;
  deterministic_reasoning?: boolean;
  no_fabricated_causality?: boolean;
  governance_safe_traversal?: boolean;
}

interface Props {
  flags?: GovernanceIntegrityFlags;
  size?: "sm" | "md";
  className?: string;
}

const LABELS: Record<keyof GovernanceIntegrityFlags, string> = {
  confidence_capped: "Confidence capped",
  evidence_complete: "Evidence complete",
  deterministic_reasoning: "Deterministic reasoning",
  no_fabricated_causality: "No fabricated causality",
  governance_safe_traversal: "Governance-safe traversal",
};

export const GovernanceIntegrityBadge = ({ flags = {}, size = "sm", className }: Props) => {
  const defaults: Required<GovernanceIntegrityFlags> = {
    confidence_capped: flags.confidence_capped ?? true,
    evidence_complete: flags.evidence_complete ?? true,
    deterministic_reasoning: flags.deterministic_reasoning ?? true,
    no_fabricated_causality: flags.no_fabricated_causality ?? true,
    governance_safe_traversal: flags.governance_safe_traversal ?? true,
  };
  const passing = Object.values(defaults).filter(Boolean).length;
  const total = Object.values(defaults).length;
  const allClear = passing === total;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={allClear ? "outline" : "destructive"}
            className={cn(
              "gap-1.5 font-normal cursor-help select-none",
              allClear && "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5",
              size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
              className,
            )}
          >
            {allClear ? (
              <ShieldCheck className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            ) : (
              <ShieldAlert className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
            )}
            Governance-safe
            <span className="tabular-nums opacity-70">
              {passing}/{total}
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="text-xs font-medium mb-1.5">Reasoning Integrity</div>
          <div className="space-y-1">
            {(Object.keys(LABELS) as Array<keyof GovernanceIntegrityFlags>).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="text-muted-foreground">{LABELS[k]}</span>
                <span className={defaults[k] ? "text-emerald-500" : "text-destructive"}>
                  {defaults[k] ? "Pass" : "Fail"}
                </span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default GovernanceIntegrityBadge;
