/**
 * ExplainabilitySection — shared subcomponent for ExplainabilityPanel.
 *
 * Owns the section header, the `Not Available` fallback rule, and a body slot.
 * Never renders business logic. Per contract §2:
 *   - Missing data → literal "Not Available" string
 *   - Empty arrays count as missing
 */
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ExplainabilitySectionProps {
  index: number;
  title: string;
  /** When false, renders the "Not Available" fallback. */
  hasContent: boolean;
  children?: ReactNode;
  className?: string;
  variant?: "full" | "compact";
}

export const NOT_AVAILABLE = "Not Available" as const;

const ExplainabilitySection = ({
  index,
  title,
  hasContent,
  children,
  className,
  variant = "full",
}: ExplainabilitySectionProps) => {
  const compact = variant === "compact";
  return (
    <section
      aria-label={`${index}. ${title}`}
      className={cn(
        "border-l-2 border-border/50 pl-3",
        compact ? "py-1.5" : "py-2",
        className,
      )}
    >
      <header className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold tabular-nums",
            compact ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]",
          )}
        >
          {index}
        </span>
        <h4
          className={cn(
            "font-semibold uppercase tracking-wide text-foreground/80",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {title}
        </h4>
      </header>
      {hasContent ? (
        <div className={cn(compact ? "text-xs" : "text-sm", "text-foreground/85")}>
          {children}
        </div>
      ) : (
        <p
          className={cn(
            "italic text-muted-foreground",
            compact ? "text-[11px]" : "text-xs",
          )}
        >
          {NOT_AVAILABLE}
        </p>
      )}
    </section>
  );
};

export default ExplainabilitySection;
