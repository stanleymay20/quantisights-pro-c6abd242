/**
 * Canonical severity color system — SINGLE SOURCE OF TRUTH.
 * All components MUST use these tokens. Never inline severity colors.
 */

export type SeverityLevel = "critical" | "high" | "medium" | "low" | "info";

export interface SeverityStyle {
  bg: string;
  border: string;
  text: string;
  dot: string;
  label: string;
}

export const SEVERITY_MAP: Record<SeverityLevel, SeverityStyle> = {
  critical: {
    bg: "bg-destructive/10",
    border: "border-destructive/30",
    text: "text-destructive",
    dot: "bg-destructive",
    label: "Critical",
  },
  high: {
    bg: "bg-warning/10",
    border: "border-warning/30",
    text: "text-warning",
    dot: "bg-warning",
    label: "High",
  },
  medium: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-600 dark:text-yellow-400",
    dot: "bg-yellow-500",
    label: "Medium",
  },
  low: {
    bg: "bg-primary/10",
    border: "border-primary/30",
    text: "text-primary",
    dot: "bg-primary",
    label: "Low",
  },
  info: {
    bg: "bg-muted/50",
    border: "border-border/50",
    text: "text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "Info",
  },
};

/** Resolve any string to a valid SeverityLevel, defaulting to "info" */
export function resolveSeverity(raw: string | null | undefined): SeverityLevel {
  if (!raw) return "info";
  const normalized = raw.toLowerCase().trim();
  if (normalized in SEVERITY_MAP) return normalized as SeverityLevel;
  return "info";
}

/** Get the style for a severity string */
export function getSeverityStyle(raw: string | null | undefined): SeverityStyle {
  return SEVERITY_MAP[resolveSeverity(raw)];
}
