import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Target,
  TrendingUp,
  UserCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  OUTCOME_REVIEW_WINDOW_DAYS,
  formatEuro,
  formatPercent,
  getEstimatedExecutionTimeline,
  getFollowUpReviewDate,
  getReviewRisks,
  type ReviewableDecision,
} from "@/components/decisions/executive-review-flow";

export interface OutcomePredictionPanelProps {
  decision: ReviewableDecision;
  /** Demo decisions show projected values only and are labelled as such. */
  isDemo?: boolean;
  /** Outcome feedback CTA injected by the page (needs org context / persistence). */
  feedbackSlot?: ReactNode;
}

function OutcomeStat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold sm:text-base">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

/**
 * UX-2 Outcome Prediction: what the executive should expect after approval,
 * who owns it, how success is measured, and when it gets reviewed.
 */
export default function OutcomePredictionPanel({
  decision,
  isDemo = false,
  feedbackSlot,
}: OutcomePredictionPanelProps) {
  const measured = decision.outcome_measured_at != null;
  const followUp = getFollowUpReviewDate(decision);
  const risks = getReviewRisks(decision);
  const decidedAt = decision.decided_at ? new Date(decision.decided_at) : null;

  return (
    <Card data-testid="outcome-prediction-panel">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
            Outcome Prediction
          </Badge>
          {isDemo && (
            <Badge
              variant="outline"
              className="w-fit border-warning/40 bg-warning/10 text-[10px] uppercase tracking-wide text-warning"
              data-testid="outcome-demo-badge"
            >
              Projected — demo data
            </Badge>
          )}
          {!isDemo && !measured && (
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
              Projected — measured after execution
            </Badge>
          )}
          {measured && (
            <Badge
              variant="outline"
              className="w-fit border-success/40 bg-success/10 text-[10px] uppercase tracking-wide text-success"
            >
              Outcome measured
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl leading-snug">{decision.recommended_action}</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Here is what to expect from this decision, who is accountable, and when it will be
          reviewed against measured results.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OutcomeStat
            icon={TrendingUp}
            label="Expected KPI movement"
            value={formatPercent(decision.predicted_roi_probability)}
            detail="Probability the linked KPI moves in the intended direction."
          />
          <OutcomeStat
            icon={Gauge}
            label="Expected financial impact"
            value={formatEuro(decision.predicted_net_impact)}
            detail={
              measured && decision.outcome_delta != null
                ? `Measured delta so far: ${formatEuro(decision.outcome_delta)}`
                : undefined
            }
          />
          <OutcomeStat
            icon={CalendarClock}
            label="Measurement timeline"
            value={`${getEstimatedExecutionTimeline(decision)} to execute`}
            detail={`Outcome measured over a ${OUTCOME_REVIEW_WINDOW_DAYS}-day evaluation window.`}
          />
          <OutcomeStat
            icon={UserCheck}
            label="Owner / accountable role"
            value={decision.decided_by ? "Approving executive" : "Executive sponsor"}
            detail={
              decidedAt
                ? `Approved ${decidedAt.toLocaleDateString()}`
                : "Assigned at approval; ownership is recorded in the audit trail."
            }
          />
        </div>

        <Separator />

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Success criteria
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li>
                The linked KPI improves against its baseline within the evaluation window.
              </li>
              <li>
                Measured net impact is positive after execution cost
                {decision.predicted_net_impact != null
                  ? ` (target: ${formatEuro(decision.predicted_net_impact)})`
                  : ""}
                .
              </li>
              <li>No new critical risk is raised against this decision during execution.</li>
            </ul>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Risks to monitor
            </h3>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {risks.slice(0, 4).map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-primary" />
              Follow-up review date
            </p>
            <p className="mt-1 text-sm font-semibold" data-testid="follow-up-review-date">
              {followUp.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          {feedbackSlot ?? (
            <p className="text-xs text-muted-foreground" data-testid="outcome-feedback-placeholder">
              Outcome feedback opens once execution completes
              {isDemo ? " (demo — feedback is not recorded)" : ""}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
