import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithRetry } from "@/lib/edge-function-retry";
import { useToast } from "@/hooks/use-toast";

interface Props {
  decisionId: string;
  organizationId: string;
  /** Has this decision already been scored into aicis_outcomes? */
  alreadyEvaluated?: boolean;
  onSubmitted?: () => void;
}

/**
 * One-click qualitative outcome capture for AICIS-linked decisions.
 *
 * IMPORTANT: outcome success and prediction accuracy are different concepts.
 * This widget records the user's success/failure verdict for calibration, but it
 * never fabricates prediction_accuracy_score or outcome_delta. Quantitative
 * forecast accuracy remains the responsibility of the metric-based evaluator.
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
        Outcome scored — feeding calibration loop.
      </div>
    );
  }

  const submit = async (verdict: "positive" | "negative") => {
    setSubmitting(verdict);
    try {
      const parsedImpact = impact.trim() ? Number(impact) : NaN;
      const measuredAt = new Date().toISOString();

      // A manual yes/no verdict is a qualitative outcome signal, not a numeric
      // forecast-accuracy score. Only persist an actual business value when the
      // user explicitly supplied one; leave outcome_delta and accuracy untouched.
      const ledgerPatch: {
        outcome_measured_at: string;
        actual_value?: number;
      } = { outcome_measured_at: measuredAt };
      if (Number.isFinite(parsedImpact)) ledgerPatch.actual_value = parsedImpact;

      const { error: ledgerError } = await supabase
        .from("decision_ledger")
        .update(ledgerPatch)
        .eq("id", decisionId);
      if (ledgerError) throw ledgerError;

      const { error } = await invokeWithRetry("aicis-evaluate-outcomes", {
        body: {
          organization_id: organizationId,
          decision_id: decisionId,
          actual_outcome: verdict,
          // Business impact is contextual metadata only. It must never be used
          // as the binary target in a Brier-score calculation.
          actual_impact: Number.isFinite(parsedImpact) ? parsedImpact : undefined,
        },
      });
      if (error) throw error;
      toast({ title: "Outcome recorded", description: "Calibration loop updated." });
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
        <Badge variant="outline" className="text-[10px]">Calibration</Badge>
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
          {submitting === "negative" ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle2 className="w-3 h-3" />}
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
    </div>
  );
};

export default OutcomeFeedbackWidget;
