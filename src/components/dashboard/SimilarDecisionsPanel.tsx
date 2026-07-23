import { memo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, TrendingUp, TrendingDown, Target, History, AlertTriangle,
  CheckCircle2, Loader2, Info, ShieldQuestion, Sparkles, Zap, Lightbulb,
} from "lucide-react";
import { useSimilarDecisions, type PrecedentType } from "@/hooks/useSimilarDecisions";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

interface SimilarDecisionsPanelProps {
  organizationId: string;
  queryText: string;
  onConfidenceAdjustment?: (adjustment: number, rationale: string) => void;
}

const TIER_STYLES = {
  strong: { bg: "bg-success/10", text: "text-success", label: "Strong" },
  moderate: { bg: "bg-warning/10", text: "text-warning", label: "Moderate" },
  weak: { bg: "bg-muted/20", text: "text-muted-foreground", label: "Weak" },
} as const;

const PRECEDENT_CONFIG: Record<PrecedentType, {
  icon: typeof Sparkles; color: string; bg: string; label: string; description: string;
}> = {
  strong_precedent: {
    icon: Sparkles, color: "text-success", bg: "bg-success/10",
    label: "Strong Precedent",
    description: "Multiple strong semantic matches found. Historical context is highly relevant and directly comparable.",
  },
  partial_precedent: {
    icon: CheckCircle2, color: "text-warning", bg: "bg-warning/10",
    label: "Partial Precedent",
    description: "Moderate matches found. Context is directionally useful but may not be fully comparable.",
  },
  semantic_fallback: {
    icon: Zap, color: "text-primary", bg: "bg-primary/10",
    label: "Semantic Fallback",
    description: "No direct keyword matches found. AI-powered semantic analysis identified conceptually related decisions.",
  },
  weak_signal: {
    icon: ShieldQuestion, color: "text-muted-foreground", bg: "bg-muted/20",
    label: "Weak Signal",
    description: "Only weak matches found. Use historical context with caution — this domain has limited precedent.",
  },
  novel_decision: {
    icon: Lightbulb, color: "text-muted-foreground", bg: "bg-muted/10",
    label: "Novel Decision",
    description: "No similar past decisions found. This decision will establish a new precedent for your organization.",
  },
};

const SimilarDecisionsPanel = memo(({ organizationId, queryText, onConfidenceAdjustment }: SimilarDecisionsPanelProps) => {
  const {
    similar, loading, error, historicalSuccessRate, avgAccuracy,
    confidenceAdjustment, retrievalQuality, precedentType, queryCategory,
    neuralFallbackUsed, neuralConcepts, matchSummary, fetch,
  } = useSimilarDecisions(organizationId);

  useEffect(() => {
    if (queryText && queryText.length > 10) {
      fetch(queryText);
    }
  }, [queryText, fetch]);

  useEffect(() => {
    if (confidenceAdjustment !== 0 && onConfidenceAdjustment) {
      const strength = retrievalQuality === "high" ? "strong" : "moderate";
      const rationale = confidenceAdjustment > 0
        ? `Historical accuracy of similar decisions is ${strength} (avg ${Math.round(avgAccuracy)}%), confidence boosted by ${confidenceAdjustment}pp.`
        : `Historical accuracy of similar decisions is low (avg ${Math.round(avgAccuracy)}%), confidence reduced by ${Math.abs(confidenceAdjustment)}pp. (${strength} evidence)`;
      onConfidenceAdjustment(confidenceAdjustment, rationale);
    }
  }, [confidenceAdjustment, avgAccuracy, onConfidenceAdjustment, retrievalQuality]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/20 border border-border/20">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground">Searching institutional memory...</span>
      </div>
    );
  }

  if (error) return null;

  const config = PRECEDENT_CONFIG[precedentType];
  const PrecedentIcon = config.icon;
  const outcomes = similar.filter(s => s.entity_type === "outcome");

  // Novel decision state
  if (precedentType === "novel_decision" && similar.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/20 bg-muted/5 p-3"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-muted/20 flex items-center justify-center">
            <Lightbulb className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold tracking-tight text-muted-foreground">Novel Decision</h4>
              {neuralFallbackUsed && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 h-4 border-primary/20 text-primary">
                  <Zap className="w-2.5 h-2.5 mr-0.5" />AI searched
                </Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              No similar past decisions found{queryCategory ? ` in ${queryCategory}` : ""}. This will establish a new precedent.
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/30 bg-muted/10 p-3 sm:p-4"
    >
      {/* Header with precedent type */}
      <div className="flex items-center gap-2 mb-3">
        
        <h4 className="text-xs font-semibold tracking-tight">Institutional Memory</h4>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`flex items-center gap-1 ml-auto px-1.5 py-0.5 rounded-full ${config.bg}`}>
              <PrecedentIcon className={`w-3 h-3 ${config.color}`} />
              <span className={`text-[9px] font-semibold ${config.color}`}>{config.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px]">
            <p className="text-xs">{config.description}</p>
            {matchSummary && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {matchSummary.strong} strong · {matchSummary.moderate} moderate · {matchSummary.weak} weak
                {matchSummary.neural_strong > 0 && ` (${matchSummary.neural_strong} via AI)`}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Semantic fallback banner */}
      {neuralFallbackUsed && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10 mb-3">
          <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] text-primary/80 leading-relaxed">
              AI semantic analysis activated — no direct keyword matches found.
              {neuralConcepts.length > 0 && (
                <span className="text-muted-foreground">
                  {" "}Concepts: {neuralConcepts.slice(0, 4).join(", ")}
                  {neuralConcepts.length > 4 && ` +${neuralConcepts.length - 4} more`}
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Weak signal warning */}
      {precedentType === "weak_signal" && !neuralFallbackUsed && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-warning/5 border border-warning/10 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <p className="text-[10px] text-warning/80 leading-relaxed">
            Only weak matches found{queryCategory ? ` for "${queryCategory}" decisions` : ""}. Historical context may not be directly comparable.
          </p>
        </div>
      )}

      {/* Historical performance summary */}
      {(historicalSuccessRate != null || avgAccuracy != null) && (
        <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-lg bg-muted/30 mb-3">
          {historicalSuccessRate != null && (
            <div className="flex items-center gap-1.5">
              <Target className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Success rate:</span>
              <span className={`text-xs font-bold font-mono ${historicalSuccessRate >= 60 ? "text-success" : historicalSuccessRate >= 40 ? "text-warning" : "text-destructive"}`}>
                {historicalSuccessRate}%
              </span>
            </div>
          )}
          {avgAccuracy != null && (
            <div className="flex items-center gap-1.5">
              <Brain className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Avg accuracy:</span>
              <span className={`text-xs font-bold font-mono ${avgAccuracy >= 70 ? "text-success" : avgAccuracy >= 40 ? "text-warning" : "text-destructive"}`}>
                {Math.round(avgAccuracy)}%
              </span>
            </div>
          )}
          {confidenceAdjustment !== 0 && (
            <div className="flex items-center gap-1.5">
              {confidenceAdjustment > 0 ? (
                <CheckCircle2 className="w-3 h-3 text-success" />
              ) : (
                <AlertTriangle className="w-3 h-3 text-warning" />
              )}
              <span className="text-[10px] font-medium">
                Confidence {confidenceAdjustment > 0 ? "+" : ""}{confidenceAdjustment}pp
              </span>
            </div>
          )}
        </div>
      )}

      {/* Similar decisions list */}
      <div className="space-y-1.5 max-h-52 overflow-y-auto">
        <AnimatePresence>
          {similar.slice(0, 6).map((item, i) => {
            const meta = item.metadata as Record<string, unknown>;
            const isOutcome = item.entity_type === "outcome";
            const relevance = Math.round(item.similarity * 100);
            const tierStyle = TIER_STYLES[item.match_tier] || TIER_STYLES.weak;
            const isNeural = item.retrieval_source === "neural_fallback";

            return (
              <motion.div
                key={item.entity_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    isOutcome ? "bg-success/10 text-success" : "bg-primary/10 text-primary"
                  }`}>
                    {item.entity_type}
                  </span>
                  <span className={`text-[8px] font-semibold px-1 py-0.5 rounded ${tierStyle.bg} ${tierStyle.text}`}>
                    {tierStyle.label}
                  </span>
                  {isNeural && (
                    <Zap className="w-2.5 h-2.5 text-primary shrink-0" />
                  )}
                  <p className="text-[11px] flex-1 truncate">{item.content_text.slice(0, 100)}</p>
                  <span className="text-[9px] text-muted-foreground font-mono shrink-0">{relevance}%</span>
                </div>

                {item.match_rationale && (
                  <p className="mt-0.5 ml-[72px] text-[9px] text-muted-foreground/70 italic truncate">
                    {item.match_rationale}
                  </p>
                )}

                {isOutcome && meta?.outcome_delta != null && (
                  <div className="mt-1 ml-[72px] flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1">
                      {Number(meta.outcome_delta) > 0 ? (
                        <TrendingUp className="w-3 h-3 text-success" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-destructive" />
                      )}
                      <span className={`font-mono font-semibold ${Number(meta.outcome_delta) > 0 ? "text-success" : "text-destructive"}`}>
                        {Number(meta.outcome_delta) > 0 ? "+" : ""}{Number(meta.outcome_delta).toFixed(1)}%
                      </span>
                    </span>
                    {meta.accuracy_score != null && (
                      <span className="text-muted-foreground">
                        Accuracy: <span className="font-mono font-semibold">{Math.round(Number(meta.accuracy_score))}%</span>
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Confidence adjustment rationale */}
      {confidenceAdjustment !== 0 && (
        <div className="mt-3 pt-2.5 border-t border-border/20">
          <p className="text-[10px] text-muted-foreground italic leading-relaxed">
            ↳ {confidenceAdjustment > 0
              ? `Historical accuracy of ${outcomes.length} similar outcomes (avg ${Math.round(avgAccuracy)}%) supports higher confidence.`
              : `Historical accuracy of ${outcomes.length} similar outcomes (avg ${Math.round(avgAccuracy)}%) warrants reduced confidence.`
            }
            {neuralFallbackUsed && " (via semantic analysis)"}
            {retrievalQuality !== "high" && !neuralFallbackUsed && " (Adjustment reduced due to moderate match quality.)"}
          </p>
        </div>
      )}
    </motion.div>
  );
});

SimilarDecisionsPanel.displayName = "SimilarDecisionsPanel";

export default SimilarDecisionsPanel;
