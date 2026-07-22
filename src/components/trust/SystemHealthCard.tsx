import { AlertTriangle, Ban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { HealthLabel, RuntimeHealthEntry } from "@/lib/trust-center-types";

const HEALTH_STYLES: Record<HealthLabel, string> = {
  "NOT AVAILABLE": "border-warning/30 bg-warning/10 text-warning",
  "NOT IMPLEMENTED": "border-destructive/30 bg-destructive/10 text-destructive",
};

const HEALTH_ICON: Record<HealthLabel, typeof Ban> = {
  "NOT AVAILABLE": AlertTriangle,
  "NOT IMPLEMENTED": Ban,
};

export interface SystemHealthCardProps {
  entry: RuntimeHealthEntry;
  className?: string;
}

/**
 * TC-1 runtime health card. There is no live/healthy state this component
 * can render today — see trust-center.ts's getRuntimeHealth() for why. It
 * only ever shows the two honest labels TC-1 requires, never a green check.
 */
export default function SystemHealthCard({ entry, className }: SystemHealthCardProps) {
  const Icon = HEALTH_ICON[entry.health];
  return (
    <div
      className={cn("rounded-xl border border-border/50 bg-background p-4", className)}
      data-testid={`health-card-${entry.key}`}
      data-health={entry.health}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{entry.label}</h3>
        <Badge variant="outline" className={cn("w-fit shrink-0 gap-1 text-[10px] uppercase tracking-wide", HEALTH_STYLES[entry.health])}>
          <Icon className="h-3 w-3" />
          {entry.health}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>
      {entry.evidence.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground/70">Evidence: {entry.evidence.join(", ")}</p>
      )}
    </div>
  );
}
