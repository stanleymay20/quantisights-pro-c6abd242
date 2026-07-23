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
 * One-click outcome capture for AICIS-linked decisions.
 * Writes a row to aicis_outcomes via the aicis-evaluate-outcomes edge function,
 * which computes Brier score and feeds the calibration loop.
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
      // Persist outcome fields on decision_ledger so /outcomes KPIs and
      // similarity retrieval see this signal (previously only actual_value
      // was written, leaving outcome_delta / prediction_accuracy_score null
      // and hiding user feedback from Outcome Tracking).
      const numeric = verdict === "positive" ? 1 : 0;
      const parsedImpact = impact.trim() ? Number(impact) : NaN;
      const actual_value = Number.isFinite(parsedImpact) ? parsedImpact : numeric;
      const outcome_delta = Number.isFinite(parsedImpact)
        ? parsedImpact
        : verdict === "positive" ? 1 : -1;
      const prediction_accuracy_score = verdict === "positive" ? 100 : 0;
      await supabase
        .from("decision_ledger")
        .update({
          actual_value,
          outcome_delta,
          prediction_accuracy_score,
          outcome_measured_at: new Date().toISOString(),
        })
        .eq("id", decisionId);

      const parsedImpactBody = impact.trim() ? Number(impact) : NaN;
      const { error } = await invokeWithRetry("aicis-evaluate-outcomes", {
        body: {
          organization_id: organizationId,
          decision_id: decisionId,
          actual_outcome: verdict,
          actual_value: Number.isFinite(parsedImpactBody) ? parsedImpactBody : undefined,
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
            inputMode="numeric"
          />
        )}
      </div>
    </div>
  );
};

export default OutcomeFeedbackWidget;
