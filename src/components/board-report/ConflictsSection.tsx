interface Conflict {
  rule_triggered: string;
  severity: string;
  role_1: string;
  role_2: string;
  description: string;
}

interface ConflictsSectionProps {
  conflicts: Conflict[];
}

/** Data-driven severity color using semantic tokens */
function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return "text-destructive bg-destructive";
    case "high": return "text-destructive bg-destructive";
    case "medium": return "text-warning bg-warning";
    default: return "text-primary bg-primary";
  }
}

const ConflictsSection = ({ conflicts }: ConflictsSectionProps) => {
  if (conflicts.length === 0) return null;

  return (
    <div className="px-16 py-12 border-b border-border/50 print:border-border">
      <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
        Active Governance Conflicts ({conflicts.length})
      </h2>
      <div className="space-y-4">
        {conflicts.map((conflict, i) => {
          const colors = getSeverityColor(conflict.severity);
          const textClass = colors.split(" ")[0];
          const bgClass = colors.split(" ")[1];
          return (
            <div key={i} className="border border-border/50 print:border-border rounded-xl p-5 flex items-start gap-4">
              <div className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${bgClass}`} />
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span className={`font-semibold text-sm uppercase tracking-wider ${textClass}`}>
                    {conflict.severity}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {conflict.role_1.toUpperCase()} → {conflict.role_2.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 print:text-foreground">{conflict.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConflictsSection;
