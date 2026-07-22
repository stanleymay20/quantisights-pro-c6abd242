import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useOrganization } from "@/hooks/useOrganization";
import { supabase } from "@/integrations/supabase/client";
import { SidebarMobileToggle } from "@/components/layout/ProtectedShell";
import { Button } from "@/components/ui/button";
import OutcomeFeedbackWidget from "@/components/decisions/OutcomeFeedbackWidget";
import OutcomePredictionPanel from "@/components/decisions/OutcomePredictionPanel";
import {
  DEMO_DECISION,
  isDemoDecisionId,
  type ReviewableDecision,
} from "@/components/decisions/executive-review-flow";

/**
 * UX-2 Outcome Prediction (/decisions/:id/outcome): what to expect after
 * approval, ownership, success criteria, and the outcome-feedback CTA.
 */
const DecisionOutcome = () => {
  const { id } = useParams<{ id: string }>();
  const { currentOrgId } = useOrganization();

  const isDemo = isDemoDecisionId(id);
  const [decision, setDecision] = useState<ReviewableDecision | null>(
    isDemo ? { ...DEMO_DECISION, decision_status: "approved", decided_at: new Date().toISOString() } : null,
  );
  const [loading, setLoading] = useState(!isDemo);

  useEffect(() => {
    if (isDemo || !id || !currentOrgId) return;
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("decision_ledger")
        .select("*")
        .eq("organization_id", currentOrgId)
        .eq("id", id)
        .maybeSingle();
      if (!error && data) setDecision(data as unknown as ReviewableDecision);
      setLoading(false);
    };
    load();
  }, [id, currentOrgId, isDemo]);

  const showFeedback =
    !isDemo &&
    decision != null &&
    currentOrgId != null &&
    decision.decision_status === "approved";

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 space-y-1">
        <div className="flex items-center gap-2">
          <SidebarMobileToggle />
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-muted-foreground" asChild>
            <Link to="/executive-brief">
              <ArrowLeft className="h-3.5 w-3.5" />
              Executive Brief
            </Link>
          </Button>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Outcome Prediction</h1>
        <p className="text-sm text-muted-foreground">
          What happens next, who owns it, and when results are measured.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading outcome view…
        </div>
      ) : decision ? (
        <div className="space-y-4">
          <OutcomePredictionPanel
            decision={decision}
            isDemo={isDemo}
            feedbackSlot={
              showFeedback ? (
                <OutcomeFeedbackWidget
                  decisionId={decision.id}
                  organizationId={currentOrgId}
                  alreadyEvaluated={decision.outcome_measured_at != null}
                />
              ) : undefined
            }
          />
          <p className="text-xs text-muted-foreground">
            Track all measured results in{" "}
            <Link to="/outcomes" className="font-medium text-primary underline-offset-2 hover:underline">
              Outcome Tracking
            </Link>
            . For the full auditor-facing record, open the{" "}
            <Link
              to={`/evidence-pack/${decision.id}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Evidence Pack
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/50 p-6 text-sm text-muted-foreground">
          This decision could not be found in your organization.{" "}
          <Link to="/decisions" className="font-medium text-primary underline-offset-2 hover:underline">
            Open the Decision Ledger
          </Link>
          .
        </div>
      )}
    </div>
  );
};

export default DecisionOutcome;
