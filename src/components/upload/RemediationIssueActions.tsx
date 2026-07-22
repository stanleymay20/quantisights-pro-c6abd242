import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { RemediationAction, RemediationIssue } from "@/lib/ingestion-remediation";

interface Props {
  issue: RemediationIssue;
  onAutoFix?: (issue: RemediationIssue) => void;
  onReview?: (issue: RemediationIssue) => void;
  onIgnore?: (issue: RemediationIssue) => void;
}

type Decision = "auto_fixed" | "reviewing" | "ignored" | null;

function severityTone(severity: RemediationIssue["severity"]) {
  if (severity === "critical") return "border-destructive/30 bg-destructive/5 text-destructive";
  if (severity === "warning") return "border-warning/30 bg-warning/5 text-warning";
  return "border-success/30 bg-success/5 text-success";
}

function decisionLabel(decision: Decision) {
  if (decision === "auto_fixed") return "Auto fixed";
  if (decision === "reviewing") return "Under review";
  if (decision === "ignored") return "Ignored";
  return null;
}

export default function RemediationIssueActions({ issue, onAutoFix, onReview, onIgnore }: Props) {
  const [decision, setDecision] = useState<Decision>(null);
  const tone = decision ? "border-success/30 bg-success/5 text-success" : severityTone(issue.severity);

  const handleAction = (action: RemediationAction) => {
    if (action === "auto_fix") {
      setDecision("auto_fixed");
      onAutoFix?.(issue);
      return;
    }
    if (action === "review") {
      setDecision("reviewing");
      onReview?.(issue);
      return;
    }
    setDecision("ignored");
    onIgnore?.(issue);
  };

  const label = decisionLabel(decision);

  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-start gap-2">
        {decision || issue.severity === "info" ? (
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-1 text-foreground">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] uppercase">
              {label ?? issue.severity}
            </Badge>
            <p className="text-sm font-semibold">{issue.title}</p>
            {issue.column && <span className="font-mono text-[11px] text-primary">{issue.column}</span>}
          </div>
          <p><strong>Problem:</strong> <span className="text-muted-foreground">{issue.problem}</span></p>
          <p><strong>Impact:</strong> <span className="text-muted-foreground">{issue.impact}</span></p>
          <p><strong>Suggested fix:</strong> <span className="text-muted-foreground">{issue.suggestedFix}</span></p>
          <div className="flex flex-wrap gap-1 pt-1">
            {issue.actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={decision !== null}
                onClick={() => handleAction(action)}
                className="text-[10px] px-2 py-1 rounded border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {action === "auto_fix" ? "Auto Fix" : action === "review" ? "Review" : "Ignore"}
              </button>
            ))}
            {decision && (
              <button
                type="button"
                onClick={() => setDecision(null)}
                className="text-[10px] px-2 py-1 rounded border border-success/30 bg-success/10 text-success hover:bg-success/15 transition-colors"
              >
                Change Decision
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
