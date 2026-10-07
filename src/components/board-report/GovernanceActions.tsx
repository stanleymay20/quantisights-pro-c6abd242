import { AlertTriangle, Clock, Zap } from "lucide-react";

interface GovernanceAction {
  action: string;
  priority: "immediate" | "medium_term";
  trigger: string;
}

interface AINarrative {
  governance_risk_statement: string;
  strategic_outlook: string;
  recommended_actions: string[];
  immediate_actions?: string[];
  medium_term_actions?: string[];
  governance_risk_if_ignored?: string;
  confidence_score: number;
}

interface GovernanceActionsProps {
  governanceActions: GovernanceAction[];
  aiNarrative: AINarrative | null;
  tier: string;
}

const GovernanceActions = ({ governanceActions, aiNarrative, tier }: GovernanceActionsProps) => {
  const immediateActions = governanceActions.filter((a) => a.priority === "immediate");
  const mediumTermActions = governanceActions.filter((a) => a.priority === "medium_term");

  return (
    <div className="px-16 py-12 border-b border-border/50 print:border-border print:break-before-page">
      <h2 className="text-xs uppercase tracking-[0.2em] text-primary mb-8 font-semibold">
        Governance Action Framework
      </h2>

      {governanceActions.length === 0 && !aiNarrative ? (
        <p className="text-muted-foreground italic">No governance interventions required at this time.</p>
      ) : (
        <div className="space-y-8">
          {/* Immediate Actions */}
          {immediateActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-destructive" />
                <h3 className="text-sm font-semibold text-destructive uppercase tracking-wider">
                  Immediate Intervention Required
                </h3>
              </div>
              <div className="space-y-3">
                {immediateActions.map((a, i) => (
                  <div
                    key={i}
                    className="border border-destructive/20 print:border-destructive/10 bg-destructive/5 print:bg-destructive/5 rounded-xl p-4"
                  >
                    <p className="text-sm font-medium text-foreground/90 print:text-foreground mb-1">{a.action}</p>
                    <p className="text-xs text-muted-foreground">Trigger: {a.trigger}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Medium-term Actions */}
          {mediumTermActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-warning" />
                <h3 className="text-sm font-semibold text-warning uppercase tracking-wider">
                  Medium-Term Recommendations
                </h3>
              </div>
              <div className="space-y-3">
                {mediumTermActions.map((a, i) => (
                  <div
                    key={i}
                    className="border border-warning/20 print:border-warning/10 bg-warning/5 print:bg-warning/5 rounded-xl p-4"
                  >
                    <p className="text-sm font-medium text-foreground/90 print:text-foreground mb-1">{a.action}</p>
                    <p className="text-xs text-muted-foreground">Trigger: {a.trigger}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Enhanced Layer (Enterprise) */}
          {aiNarrative && (
            <div className="mt-8 border border-primary/20 print:border-primary/10 bg-primary/5 print:bg-primary/5 rounded-2xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                  AI Governance Assessment
                </h3>
                <span className="text-xs text-muted-foreground">
                  Confidence: {aiNarrative.confidence_score}/100
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Risk Statement</h4>
                  <p className="text-sm leading-relaxed text-foreground/90 print:text-foreground">
                    {aiNarrative.governance_risk_statement}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Strategic Outlook</h4>
                  <p className="text-sm leading-relaxed text-foreground/90 print:text-foreground">
                    {aiNarrative.strategic_outlook}
                  </p>
                </div>

                {aiNarrative.governance_risk_if_ignored && (
                  <div className="bg-destructive/10 print:bg-destructive/5 border border-destructive/20 print:border-destructive/10 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                      <h4 className="text-xs uppercase tracking-wider text-destructive font-semibold">
                        Risk if Ignored
                      </h4>
                    </div>
                    <p className="text-sm text-foreground/80 print:text-foreground">
                      {aiNarrative.governance_risk_if_ignored}
                    </p>
                  </div>
                )}

                {/* AI Recommended Actions */}
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">AI Recommended Actions</h4>
                  <ol className="space-y-2">
                    {aiNarrative.recommended_actions.map((action, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-primary/20 print:bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                          {i + 1}
                        </span>
                        <span className="text-foreground/80 print:text-foreground leading-relaxed">{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GovernanceActions;
