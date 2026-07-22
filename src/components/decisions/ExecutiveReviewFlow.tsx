import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Gauge,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ExplanationMetadata } from "@/components/dashboard/ExplainDecisionPanel";
import {
  getExecutiveApprovalChecklist,
} from "@/components/decisions/executive-decision-review-utils";
import {
  EXECUTIVE_REVIEW_CHECKLIST,
  emptyReviewChecklistState,
  formatEuro,
  formatPercent,
  getEstimatedExecutionTimeline,
  getEvidenceSignalCount,
  getExecutiveNarrative,
  getExecutiveRiskLevel,
  getReviewRisks,
  isReviewChecklistComplete,
  type ReviewableDecision,
  type ReviewChecklistState,
} from "@/components/decisions/executive-review-flow";

export interface ExecutiveReviewFlowProps {
  decision: ReviewableDecision;
  /** Demo decisions are never persisted; actions are labelled as simulation. */
  isDemo?: boolean;
  /** True while an approve/reject write is in flight. */
  busy?: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
  /** Optional live evidence panel injected by the page (kept out of this pure component). */
  evidenceSlot?: ReactNode;
}

function ReviewSection({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="rounded-xl border border-border/50 bg-background p-4 sm:p-5"
      data-testid={`review-section-${step}`}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {step}
        </span>
        {title}
      </h2>
      <div className="mt-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function AlternativeOption({
  name,
  benefit,
  risk,
  recommended = false,
}: {
  name: string;
  benefit: string;
  risk: string;
  recommended?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        recommended ? "border-primary/40 bg-primary/[0.03]" : "border-border/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{name}</p>
        {recommended && <Badge className="text-[10px]">Recommended</Badge>}
      </div>
      <dl className="mt-2 space-y-1.5 text-xs">
        <div>
          <dt className="font-semibold text-muted-foreground">Benefit</dt>
          <dd>{benefit}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted-foreground">Risk</dt>
          <dd>{risk}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * UX-2 linear executive review surface: eight plain-English sections ending in
 * a checklist-gated Approve / Reject action. Raw JSON only appears inside the
 * collapsed "Technical detail" disclosure.
 */
export default function ExecutiveReviewFlow({
  decision,
  isDemo = false,
  busy = false,
  onApprove,
  onReject,
  evidenceSlot,
}: ExecutiveReviewFlowProps) {
  const [checklist, setChecklist] = useState<ReviewChecklistState>(emptyReviewChecklistState());
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectField, setShowRejectField] = useState(false);

  const metadata = (decision.explanation_metadata ?? null) as ExplanationMetadata | null;
  const narrative = useMemo(() => getExecutiveNarrative(decision), [decision]);
  const risks = useMemo(() => getReviewRisks(decision), [decision]);
  const dataGates = useMemo(() => getExecutiveApprovalChecklist(decision), [decision]);
  const confidence =
    decision.capped_confidence ?? decision.confidence_at_decision ?? decision.raw_confidence;
  const evidenceCount = getEvidenceSignalCount(decision);
  const riskLevel = getExecutiveRiskLevel(decision);
  const checklistComplete = isReviewChecklistComplete(checklist);
  const approveDisabled = !checklistComplete || busy;
  const alreadyDecided =
    decision.decision_status === "approved" || decision.decision_status === "rejected";

  return (
    <div className="space-y-4" data-testid="executive-review-flow">
      {isDemo && (
        <div
          className="rounded-lg border border-warning/40 bg-warning/[0.06] p-3 text-sm text-warning"
          data-testid="demo-simulation-banner"
        >
          Demo decision — sample data. Approve and Reject are a simulation and are not persisted.
        </div>
      )}
      {alreadyDecided && (
        <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
          This decision has already been {decision.decision_status}. The review below is
          read-context; no further action is required.
        </div>
      )}

      <ReviewSection step={1} title="Executive Summary">
        <p className="text-base font-medium">{decision.recommended_action}</p>
        <p className="mt-2 text-muted-foreground">{narrative}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <p className="flex items-center gap-2 font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            {formatEuro(decision.predicted_net_impact)}
          </p>
          <p className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            Confidence {formatPercent(confidence)}
          </p>
          <p className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Risk level: {riskLevel}
          </p>
          <p className="flex items-center gap-2">
            <FileSearch className="h-4 w-4 text-primary" />
            {evidenceCount > 0 ? `${evidenceCount} evidence signals` : "Evidence pending"}
          </p>
        </div>
      </ReviewSection>

      <ReviewSection step={2} title="Decision Context">
        <p>
          {decision.source_insight_summary ||
            decision.notes ||
            "This recommendation was raised from live decision signals and is waiting for executive judgment."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Type: {decision.decision_type || "operational"}</Badge>
          <Badge variant="outline">Origin: {decision.decision_origin || "platform"}</Badge>
          <Badge variant="outline">
            Opened:{" "}
            {decision.created_at ? new Date(decision.created_at).toLocaleDateString() : "today"}
          </Badge>
          <Badge variant="outline">
            Estimated execution: {getEstimatedExecutionTimeline(decision)}
          </Badge>
        </div>
      </ReviewSection>

      <ReviewSection step={3} title="Evidence">
        {metadata?.reasoning?.what_happened || metadata?.reasoning?.why_this_recommendation ? (
          <div className="space-y-2">
            {metadata.reasoning?.what_happened && (
              <p>
                <span className="font-semibold">What happened: </span>
                {metadata.reasoning.what_happened}
              </p>
            )}
            {metadata.reasoning?.why_it_matters && (
              <p>
                <span className="font-semibold">Why it matters: </span>
                {metadata.reasoning.why_it_matters}
              </p>
            )}
            {metadata.reasoning?.why_this_recommendation && (
              <p>
                <span className="font-semibold">Why this recommendation: </span>
                {metadata.reasoning.why_this_recommendation}
              </p>
            )}
            {metadata.source_data?.dataset_name && (
              <p className="text-muted-foreground">
                Based on {metadata.source_data.dataset_name}
                {metadata.source_data.rows_analyzed
                  ? ` (${metadata.source_data.rows_analyzed.toLocaleString()} rows analyzed)`
                  : ""}
                {metadata.source_data.time_range ? `, ${metadata.source_data.time_range}` : ""}.
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">
            {evidenceCount > 0
              ? "Evidence signals are linked to this decision. Review them before approving."
              : "No structured evidence is linked yet. Treat this recommendation with caution until evidence is attached."}
          </p>
        )}
        {evidenceSlot && <div className="mt-3">{evidenceSlot}</div>}
        <Collapsible className="mt-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground"
              data-testid="technical-detail-toggle"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              Technical detail (analyst view)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre
              className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 text-[11px] leading-relaxed"
              data-testid="technical-detail-json"
            >
              {JSON.stringify(metadata ?? { note: "No explanation metadata recorded." }, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      </ReviewSection>

      <ReviewSection step={4} title="Alternative Actions">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <AlternativeOption
            name="Recommended option"
            benefit="Fastest path to capture the projected impact while evidence is current."
            risk="Execution risk if the supporting evidence is misread."
            recommended
          />
          <AlternativeOption
            name="Alternative A — smaller pilot"
            benefit="Run a controlled, narrower intervention first."
            risk="Slower impact and a possible missed timing window."
          />
          <AlternativeOption
            name="Alternative B — escalate to governance"
            benefit="Adds a governance review before execution."
            risk="Adds delay and reduces responsiveness."
          />
          <AlternativeOption
            name="No action"
            benefit="Avoids immediate execution cost."
            risk="The risk or opportunity remains unmanaged."
          />
        </div>
      </ReviewSection>

      <ReviewSection step={5} title="Business Impact">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Expected financial impact</p>
            <p className="mt-1 text-base font-semibold">
              {formatEuro(decision.predicted_net_impact)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Probability of positive ROI</p>
            <p className="mt-1 text-base font-semibold">
              {formatPercent(decision.predicted_roi_probability)}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Impact basis</p>
            <p className="mt-1">
              {metadata?.expected_impact?.range
                ? `${metadata.expected_impact.range}${metadata.expected_impact.basis ? ` — ${metadata.expected_impact.basis}` : ""}`
                : "Estimated from decision-time predictions; measured after execution."}
            </p>
          </div>
        </div>
      </ReviewSection>

      <ReviewSection step={6} title="Risks and Constraints">
        <ul className="space-y-2">
          {risks.map((risk) => (
            <li key={risk} className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{risk}</span>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection step={7} title="Governance / Approval Checklist">
        <p className="text-muted-foreground">
          Confirm each item to enable approval. This is your review record, not a formality.
        </p>
        <ul className="mt-3 space-y-3">
          {EXECUTIVE_REVIEW_CHECKLIST.map((item) => (
            <li key={item.key}>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={checklist[item.key]}
                  onCheckedChange={(value) =>
                    setChecklist((current) => ({ ...current, [item.key]: value === true }))
                  }
                  disabled={busy}
                  className="mt-0.5"
                  data-testid={`checklist-${item.key}`}
                  aria-label={item.label}
                />
                <span>
                  <span className="font-medium">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Separator className="my-4" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Platform readiness checks
        </p>
        <ul className="mt-2 space-y-1.5 text-xs">
          {dataGates.map((gate) => (
            <li key={gate.key} className="flex gap-2">
              {gate.passed ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              )}
              <span className="text-muted-foreground">
                {gate.passed ? gate.readyText : gate.blockingReason}
              </span>
            </li>
          ))}
        </ul>
      </ReviewSection>

      <ReviewSection step={8} title="Final Decision Action">
        <p className="text-muted-foreground">
          {checklistComplete
            ? "All review items are confirmed. You can now approve this decision."
            : "Approve stays disabled until every checklist item above is confirmed."}
        </p>
        {isDemo && (
          <p className="mt-2 text-xs font-medium text-warning">
            Simulation / not persisted — this demo action will not write to the Decision Ledger.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            className="h-10 gap-2 px-5 font-semibold"
            disabled={approveDisabled || alreadyDecided}
            onClick={onApprove}
            data-testid="approve-button"
          >
            <ThumbsUp className="h-4 w-4" />
            Approve decision
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={busy || alreadyDecided}
            onClick={() => setShowRejectField((current) => !current)}
            data-testid="reject-toggle"
          >
            <ThumbsDown className="h-4 w-4" />
            Reject
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Your action is recorded with rationale for audit.
          </p>
        </div>
        {showRejectField && (
          <div className="mt-4 space-y-2" data-testid="reject-reason-block">
            <label htmlFor="reject-reason" className="text-xs font-semibold text-muted-foreground">
              Why are you rejecting this recommendation?
            </label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="e.g. Evidence is stale — supplier benchmarks changed this month."
              data-testid="reject-reason-input"
            />
            <Button
              variant="destructive"
              size="sm"
              disabled={busy || rejectReason.trim().length === 0}
              onClick={() => onReject(rejectReason.trim())}
              data-testid="confirm-reject-button"
            >
              Confirm rejection
            </Button>
          </div>
        )}
      </ReviewSection>
    </div>
  );
}
