import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getScenarioReadiness } from "@/lib/scenario-template";
import type { ScenarioReadinessLevel, ScenarioTemplate } from "@/lib/scenario-template-types";

const READINESS_STYLES: Record<ScenarioReadinessLevel, string> = {
  "Ready for Pilot": "border-success/30 bg-success/10 text-success",
  "Ready for Demonstration": "border-warning/30 bg-warning/10 text-warning",
  "Requires Additional Capability": "border-destructive/30 bg-destructive/10 text-destructive",
};

const READINESS_ICON: Record<ScenarioReadinessLevel, typeof CheckCircle2> = {
  "Ready for Pilot": CheckCircle2,
  "Ready for Demonstration": Info,
  "Requires Additional Capability": AlertTriangle,
};

export interface ScenarioReadinessBadgeProps {
  template: ScenarioTemplate;
  className?: string;
}

/** Compact readiness badge — used on gallery cards. */
export function ScenarioReadinessBadge({ template, className }: ScenarioReadinessBadgeProps) {
  const { readiness } = getScenarioReadiness(template);
  const Icon = READINESS_ICON[readiness];
  return (
    <Badge
      variant="outline"
      className={cn("w-fit shrink-0 gap-1 text-[10px] uppercase tracking-wide", READINESS_STYLES[readiness], className)}
      data-testid={`readiness-badge-${template.template_id}`}
    >
      <Icon className="h-3 w-3" />
      {readiness}
    </Badge>
  );
}

export interface ScenarioReadinessPanelProps {
  template: ScenarioTemplate;
  className?: string;
}

/**
 * Full readiness panel — used on the scenario detail page's "Current
 * Platform Support" section. Computed only from the template's resolved
 * implementation_status; never a hand-typed claim.
 */
export default function ScenarioReadinessPanel({ template, className }: ScenarioReadinessPanelProps) {
  const result = getScenarioReadiness(template);
  const Icon = READINESS_ICON[result.readiness];

  return (
    <div className={cn("rounded-xl border border-border/50 bg-background p-4", className)} data-testid="scenario-readiness-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Platform readiness</h3>
        <Badge
          variant="outline"
          className={cn("w-fit shrink-0 gap-1 text-[10px] uppercase tracking-wide", READINESS_STYLES[result.readiness])}
        >
          <Icon className="h-3 w-3" />
          {result.readiness}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{result.rationale}</p>
      {result.blocking.length > 0 && (
        <ul className="mt-3 space-y-2">
          {result.blocking.map((entry) => (
            <li key={entry.capability_key} className="flex gap-2 text-xs" data-testid={`blocking-${entry.capability_key}`}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
              <span className="text-muted-foreground">
                <span className="font-medium text-foreground">{entry.label}</span> — {entry.status}: {entry.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
