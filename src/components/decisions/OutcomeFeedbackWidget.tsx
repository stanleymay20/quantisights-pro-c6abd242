import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";

interface Props {
  decisionId: string;
  organizationId: string;
  /** Has this decision already been scored into aicis_outcomes? */
  alreadyEvaluated?: boolean;
  onSubmitted?: () => void;
}

interface OutcomeConfirmation {
  success?: boolean;
  recorded?: boolean;
  decision_id?: string;
  total_evaluated?: number;
  correlation_id?: string;
}

/**
 * One-click outcome capture for AICIS-linked decisions.
 *
 * Outcome success and prediction accuracy are deliberately separate concepts:
 * - Yes/No records whether the decision delivered the expected business outcome.
 * - Optional impact is stored as the observed business value.
 * - AICIS risk calibration converts the verdict to a binary risk-event target
 *   server-side; the monetary/metric impact is never used as a Brier target.
 * - We do not manufacture a 100/0 prediction-accuracy score from this verdict.
 */
const OutcomeFeedbackWidget = ({ decisionId, organizationId, alreadyEvaluated, onSubmitted }: Props) => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState<"positive" | "negative" | null>(null);
  const [showImpact, setShowImpact] = useState(false);
  const [impact, setImpact] = useState("");

  if (alreadyEvaluated) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-3 h-3 text-primary" />
        Outcome recorded — risk calibration updated where a probability prediction exists.
      </div>
    );
  }

  const submit = async (verdict: "positive" | "negative") => {
    setSubmitting(verdict);
    try {
      const parsedImpact = impact.trim() ? Number(impact) : NaN;
      if (impact.trim() && !Number.isFinite(parsedImpact)) {
        throw new Error("Actual impact must be a valid number.");
      }
      const actualValue = Number.isFinite(parsedImpact) ? parsedImpact : undefined;

      const { data, error } = await invokeWithRetry<OutcomeConfirmation>("aicis-evaluate-outcomes", {
        body: {
          organization_id: organizationId,
          decision_id: decisionId,
          actual_outcome: verdict,
          actual_value: actualValue,
        },
      });
      if (error) throw error;
      if (
        !data?.success ||
        !data.recorded ||
        data.decision_id !== decisionId ||
        data.total_evaluated !== 1
      ) {
        throw new Error("The outcome service did not provide durable-recording confirmation.");
      }

      toast({
        title: "Outcome recorded",
        description: "Business outcome, calibration evidence, and audit evidence were saved atomically.",
      });
      onSubmitted?.();
    } catch (e) {
      toast({
        title: "Could not record outcome",
        description: e instanceof Error ? e.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-dashed p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Did this decision deliver the expected impact?</p>
        <Badge variant="outline" className="text-[10px]">Outcome feedback</Badge>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs border-success/40 text-success hover:bg-success/10"
          disabled={!!submitting}
          onClick={() => submit("positive")}
        >
          {submitting === "positive" ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={!!submitting}
          onClick={() => submit("negative")}
        >
          {submitting === "negative" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
          No
        </Button>
        <button
          type="button"
          className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          onClick={() => setShowImpact(s => !s)}
        >
          {showImpact ? "Hide" : "Add"} actual impact
        </button>
        {showImpact && (
          <Input
            value={impact}
            onChange={(e) => setImpact(e.target.value)}
            placeholder="e.g. 25000"
            className="h-7 text-xs w-32"
            inputMode="decimal"
          />
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Actual impact is stored as a business value. It is not treated as prediction accuracy or a probability target.
      </p>
    </div>
  );
};

export default OutcomeFeedbackWidget;
