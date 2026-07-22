import { AlertTriangle, CheckCircle2, Clock, FileSearch, ShieldCheck, Target, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { trustFromDecision } from "@/components/trust/trust-adapter";
import {
  getExecutiveApprovalBlockReason,
  getExecutiveApprovalChecklist,
  getExecutiveDecisionConfidence,
  isExecutiveApprovalAllowed,
  type ExecutiveDecisionRecord,
} from "@/components/decisions/executive-decision-review-utils";

interface ExecutiveDecisionReviewProps {
  decision: ExecutiveDecisionRecord;
  organizationId?: string | null;
  className?: string;
}

const euro = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return "Not quantified";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const pct = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(Number(value))) return "Not available";
  return `${Number(value).toFixed(0)}%`;
};

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/50 bg-background p-4", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function AlternativeCard({
  name,
  benefit,
  risk,
  expectedOutcome,
  recommended = false,
}: {
  name: string;
  benefit: string;
  risk: string;
  expectedOutcome: string;
  recommended?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border p-3", recommended ? "border-primary/40 bg-primary/[0.03]" : "border-border/50")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {recommended && <Badge className="text-[10px]">Recommended</Badge>}
      </div>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="font-semibold text-muted-foreground">Benefit</dt>
          <dd>{benefit}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Risk</dt>
          <dd>{risk}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Expected outcome</dt>
          <dd>{expectedOutcome}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function ExecutiveDecisionReview({
  decision,
  organizationId,
  className,
}: ExecutiveDecisionReviewProps) {
  const trust = trustFromDecision(decision, organizationId);
  const confidence = getExecutiveDecisionConfidence(decision);
  const checklist = getExecutiveApprovalChecklist(decision);
  const approvalAllowed = isExecutiveApprovalAllowed(decision);
  const blockReason = getExecutiveApprovalBlockReason(decision);
  const action = decision.recommended_action || "Review this recommendation with the responsible owner.";
  const evidenceQuality =
    trust.evidenceStatus === "verified"
      ? "decision-grade"
      : trust.evidenceStatus === "partial"
        ? "partial"
        : "not ready";

  return (
    <Card className={cn("border-primary/20 bg-primary/[0.015]", className)} data-testid="executive-decision-review">
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Badge variant="outline" className="w-fit text-[10px] uppercase tracking-wide">
              Executive Decision Review
            </Badge>
            <CardTitle className="mt-3 text-xl leading-snug sm:text-2xl">{action}</CardTitle>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "w-fit shrink-0 gap-1",
              approvalAllowed
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {approvalAllowed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
            {approvalAllowed ? "Approval allowed" : "Approval blocked"}
          </Badge>
        </div>
        {!approvalAllowed && blockReason && (
          <p className="rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3 text-sm text-destructive">
            {blockReason}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <Section title="Executive Summary">
          <p>
            This decision needs executive review because it has a material operational or financial signal and will create
            an auditable approval record if actioned.
          </p>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Why this matters">
            <p>
              {decision.source_insight_summary ||
                decision.notes ||
                "The recommendation is tied to live decision signals and should be reviewed before execution risk increases."}
            </p>
          </Section>

          <Section title="Recommended action">
            <p className="font-medium">{action}</p>
          </Section>
        </div>

        <Section title="AICIS trust verification">
          <p>
            I analyzed {decision.decision_type || "operational"} signals. I recommend this action because the available
            signals crossed a decision threshold. Confidence is {pct(confidence)}. Evidence quality is {evidenceQuality}.
            Risks are shown below before approval can proceed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">Evidence: {trust.evidenceStatus}</Badge>
            <Badge variant="outline">Governance: {trust.governanceStatus}</Badge>
            <Badge variant="outline">Source: {trust.sourceQuality || "not available"}</Badge>
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-3">
          <Section title="Business impact">
            <div className="space-y-2">
              <p className="flex items-center gap-2 font-semibold">
                <TrendingUp className="h-4 w-4 text-primary" />
                {euro(decision.predicted_net_impact)}
              </p>
              <p className="text-muted-foreground">Estimated financial impact if the recommendation is executed.</p>
            </div>
          </Section>

          <Section title="Supporting evidence">
            <p className="flex items-center gap-2">
              <FileSearch className="h-4 w-4 text-primary" />
              {trust.evidenceStatus === "verified"
                ? "Verified sources are linked to this decision."
                : "Evidence is not yet verified enough for approval."}
            </p>
          </Section>

          <Section title="Evidence quality">
            <p>
              Evidence quality is <span className="font-semibold">{evidenceQuality}</span>. Approval requires verified,
              decision-grade evidence.
            </p>
          </Section>
        </div>

        <Section title="Alternative actions">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AlternativeCard
              name="Recommended option"
              benefit="Fastest path to reduce the identified risk or capture the opportunity."
              risk="Execution risk if the supporting evidence is misunderstood."
              expectedOutcome="Measured impact against the selected KPI and audit trail."
              recommended
            />
            <AlternativeCard
              name="Alternative A"
              benefit="Run a smaller controlled intervention first."
              risk="Slower impact and possible missed timing window."
              expectedOutcome="Lower operational risk with a narrower measured outcome."
            />
            <AlternativeCard
              name="Alternative B"
              benefit="Escalate to governance review before execution."
              risk="Adds delay and may reduce responsiveness."
              expectedOutcome="Stronger compliance posture before action."
            />
            <AlternativeCard
              name="No action"
              benefit="Avoids immediate execution cost."
              risk="Risk or opportunity remains unmanaged."
              expectedOutcome="No measurable improvement; exposure may persist."
            />
          </div>
        </Section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Risks">
            <ul className="space-y-2">
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Evidence must be reviewed before the recommendation is treated as decision-grade.
              </li>
              <li className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                Confidence may be capped when sample size, volatility, or signal quality is limited.
              </li>
            </ul>
          </Section>

          <Section title="Approval checklist">
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.key} className="flex gap-2">
                  {item.passed ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    <span className="font-medium">{item.label}:</span>{" "}
                    {item.passed ? item.readyText : item.blockingReason}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section title="Outcome prediction">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Expected KPI change</p>
              <p className="mt-1 font-medium">{pct(decision.predicted_roi_probability)} probability of positive ROI</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Financial impact</p>
              <p className="mt-1 font-medium">{euro(decision.predicted_net_impact)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Operational impact</p>
              <p className="mt-1 font-medium">Execution tracked from approval to outcome.</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Compliance impact</p>
              <p className="mt-1 font-medium">Approval rationale and actor trail preserved.</p>
            </div>
          </div>
          <Separator className="my-3" />
          <p className="text-muted-foreground">
            Measurement plan: compare the approved action against the linked KPI, execution date, and measured outcome
            once post-decision data arrives.
          </p>
        </Section>

        <Section title="Audit trail preview">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Decision opened {decision.created_at ? new Date(decision.created_at).toLocaleDateString() : "today"}.</span>
            </div>
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Evidence and governance status recorded before approval.</span>
            </div>
            <div className="flex gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>Outcome tracking starts after approval.</span>
            </div>
          </div>
        </Section>
      </CardContent>
    </Card>
  );
}
