import * as React from "react";
import { ShieldCheck, Database, AlertTriangle, Info, Cpu } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSystemConfig } from "@/lib/system-config";

export interface ConfidenceObject {
  raw_confidence?: number;
  capped_confidence?: number;
  confidence_cap_reason?: string;
  ceiling?: number;
  sample_size?: number;
  data_sufficiency?: string;
  variance_score?: number | null;
}

/**
 * Extracts a numeric confidence value from either a number or a confidence object.
 */
export function resolveConfidence(value: unknown): number {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as ConfidenceObject;
    return obj.capped_confidence ?? obj.raw_confidence ?? 0;
  }
  return 0;
}

/**
 * Extracts the full confidence metadata from either a number or object.
 */
export function resolveConfidenceMeta(value: unknown): ConfidenceObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ConfidenceObject;
  }
  return null;
}

interface ConfidenceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  confidence: unknown;
  showDetails?: boolean;
  /** Explicitly flag this confidence as heuristic */
  isHeuristic?: boolean;
}

const ConfidenceBadge = React.forwardRef<HTMLSpanElement, ConfidenceBadgeProps>(
  ({ confidence, showDetails = false, isHeuristic = false, className = "", ...rest }, ref) => {
    const score = resolveConfidence(confidence);
    const meta = resolveConfidenceMeta(confidence);
    const { aiConfidenceHigh, aiConfidenceModerate } = getSystemConfig().confidenceDisplay;
    const color = score >= aiConfidenceHigh ? "text-success" : score >= aiConfidenceModerate ? "text-warning" : "text-destructive";

    // Determine if heuristic from cap reason or explicit prop
    const heuristicFlag = isHeuristic || meta?.confidence_cap_reason?.toLowerCase().includes("heuristic");

    const badge = (
      <span ref={ref} className={`inline-flex items-center gap-1 text-xs font-semibold ${color} ${showDetails || meta ? "cursor-help" : ""} ${className}`} {...rest}>
        {heuristicFlag ? <Cpu className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
        {Math.round(score)}%
        {heuristicFlag && <span className="text-[8px] font-bold uppercase text-warning ml-0.5">H</span>}
      </span>
    );

    if (!showDetails && !meta) return badge;

    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs space-y-1.5 text-xs p-3">
          {heuristicFlag && (
            <div className="flex items-center gap-1.5 text-warning font-semibold">
              <Cpu className="w-3 h-3" />
              <span>Heuristic confidence estimate — not model-derived</span>
            </div>
          )}
          {meta?.data_sufficiency && (
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3 text-muted-foreground" />
              <span>Data: <strong className="capitalize">{meta.data_sufficiency}</strong></span>
              {meta.sample_size != null && <span className="text-muted-foreground">({meta.sample_size} points)</span>}
            </div>
          )}
          {meta?.variance_score != null && (
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-muted-foreground" />
              <span>Variance: {meta.variance_score.toFixed(1)}</span>
            </div>
          )}
          {meta?.confidence_cap_reason && (
            <div className="flex items-center gap-1.5">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{meta.confidence_cap_reason}</span>
            </div>
          )}
          {!meta && !heuristicFlag && (
            <div className="text-muted-foreground">
              No detailed confidence metadata available for this value.
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  },
);

ConfidenceBadge.displayName = "ConfidenceBadge";

export default ConfidenceBadge;
