import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, TrendingUp, TrendingDown, Target, ArrowRight, AlertTriangle, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface CalibrationProgressProps {
  organizationId: string;
}

interface CalibrationData {
  overallScore: number | null;
  biasDirection: string | null;
  modelVersion: number | null;
  totalDecisions: number;
  prospectiveDecisions: number;
  excludedDecisions: number;
  evidenceRegime: "prospective_only" | "legacy_mixed";
  mae: number | null;
  improvementPp: number | null;
  learningNarrative: string | null;
  biasShift: string | null;
}

const CalibrationProgress = ({ organizationId }: CalibrationProgressProps) => {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    const fetch = async () => {
      setLoading(true);
      const { data: rawModels } = await supabase
        .from("calibration_models")
        .select("*")
        .eq("organization_id", organizationId)
        .order("computed_at", { ascending: false })
        .limit(10);

      const models = (rawModels || []) as unknown as Array<Record<string, any>>;
      if (models.length === 0) {
        setData(null);
        setLoading(false);
        return;
      }

      const current = models[0];
      const evidenceRegime = current.evidence_regime === "prospective_only"
        ? "prospective_only"
        : "legacy_mixed";
      const eligibleModels = models.filter((m) => m.evidence_regime === "prospective_only");
      const previousEligible = evidenceRegime === "prospective_only" && eligibleModels.length > 1
        ? eligibleModels[1]
        : null;

      const improvement = previousEligible?.mean_absolute_error != null && current.mean_absolute_error != null
        ? Number(previousEligible.mean_absolute_error) - Number(current.mean_absolute_error)
        : null;

      let learningNarrative: string | null = null;
      let biasShift: string | null = null;

      if (evidenceRegime === "prospective_only") {
        if (previousEligible) {
          const prevBias = previousEligible.overall_bias_direction;
          const curBias = current.overall_bias_direction;
          if (prevBias && curBias && prevBias !== curBias) {
            biasShift = `Bias corrected from ${prevBias} → ${curBias}`;
          }
          if (improvement != null && improvement > 0) {
            learningNarrative = `Prospective calibration error improved by ${improvement.toFixed(1)}pp across ${current.prospective_decisions_count ?? current.total_decisions_analyzed ?? 0} eligible decisions.`;
          } else if (improvement != null && improvement < 0) {
            learningNarrative = `Prospective calibration error increased by ${Math.abs(improvement).toFixed(1)}pp. More forward outcomes are needed before drawing a stable conclusion.`;
          }
        } else if ((current.prospective_decisions_count ?? 0) >= 5) {
          learningNarrative = `Initial prospective-only calibration established from ${current.prospective_decisions_count} eligible decisions. Retrospective and legacy outcomes are excluded from confidence correction.`;
        }
      } else {
        learningNarrative = "Historical calibration data exists, but it predates prospective-evidence certification. It remains diagnostic only and is not eligible to adjust confidence.";
      }

      const narrative = evidenceRegime === "prospective_only"
        ? ((current.ai_narrative as string | null) || learningNarrative)
        : learningNarrative;

      setData({
        overallScore: evidenceRegime === "prospective_only" ? Number(current.overall_calibration_score) : null,
        biasDirection: evidenceRegime === "prospective_only" ? current.overall_bias_direction : null,
        modelVersion: current.model_version ?? null,
        totalDecisions: current.total_decisions_analyzed ?? 0,
        prospectiveDecisions: current.prospective_decisions_count ?? 0,
        excludedDecisions: current.excluded_decisions_count ?? current.total_decisions_analyzed ?? 0,
        evidenceRegime,
        mae: evidenceRegime === "prospective_only" && current.mean_absolute_error != null
          ? Number(current.mean_absolute_error)
          : null,
        improvementPp: improvement,
        learningNarrative: narrative,
        biasShift,
      });
      setLoading(false);
    };
    fetch();
  }, [organizationId]);

  if (loading || !data) return null;

  const isProspective = data.evidenceRegime === "prospective_only";
  const scoreColor = data.overallScore != null
    ? data.overallScore >= 80 ? "text-success" : data.overallScore >= 60 ? "text-primary" : "text-warning"
    : "text-muted-foreground";

  const biasIcon = data.biasDirection === "overconfident"
    ? TrendingUp
    : data.biasDirection === "underconfident"
    ? TrendingDown
    : ShieldCheck;

  const biasLabel = !isProspective
    ? "Not certification eligible"
    : data.biasDirection === "overconfident"
    ? "Prospective outcomes show overestimation"
    : data.biasDirection === "underconfident"
    ? "Prospective outcomes show underestimation"
    : "Prospectively calibrated";

  const biasColor = !isProspective
    ? "text-muted-foreground"
    : data.biasDirection === "overconfident"
    ? "text-warning"
    : data.biasDirection === "underconfident"
    ? "text-primary"
    : "text-success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass-card p-5 rounded-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Calibration Engine
          </h3>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${
            isProspective
              ? "text-success border-success/30 bg-success/5"
              : "text-warning border-warning/30 bg-warning/5"
          }`}>
            {isProspective ? "PROSPECTIVE ONLY" : "LEGACY / DIAGNOSTIC"}
          </span>
        </div>
        <Link
          to="/calibration"
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
        >
          Full Assessment <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {!isProspective && (
        <div className="mb-4 p-3 rounded-lg border border-warning/25 bg-warning/5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            This snapshot was computed before prospective provenance was enforced. Its score and corrections are intentionally hidden and are not used to adjust executive confidence. Recalibration requires at least five eligible forward outcomes.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="text-center">
          <p className={`text-2xl font-bold ${scoreColor}`}>
            {data.overallScore != null ? `${data.overallScore}%` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isProspective ? "Prospective Calibration Score" : "Certification Score Withheld"}
          </p>
        </div>

        <div className="text-center">
          <div className={`flex items-center justify-center gap-1.5 ${biasColor}`}>
            {(() => { const Icon = biasIcon; return <Icon className="w-4 h-4" />; })()}
            <span className="text-sm font-semibold capitalize">{data.biasDirection || "Not certified"}</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{biasLabel}</p>
        </div>

        <div className="text-center">
          {isProspective && data.improvementPp != null ? (
            <>
              <p className={`text-2xl font-bold ${data.improvementPp > 0 ? "text-success" : data.improvementPp < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {data.improvementPp > 0 ? "+" : ""}{data.improvementPp.toFixed(1)}pp
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {data.improvementPp > 0 ? "Prospective error improved" : data.improvementPp < 0 ? "Prospective error increased" : "No change"}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-muted-foreground">
                {isProspective ? data.prospectiveDecisions : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isProspective ? "Eligible forward decisions" : "Needs prospective evidence"}
              </p>
            </>
          )}
        </div>
      </div>

      {data.learningNarrative && (
        <div className="mt-4 pt-3 border-t border-border/30">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            {isProspective ? "What the system learned" : "Evidence status"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{data.learningNarrative}</p>
          {data.biasShift && (
            <p className="text-[10px] text-primary mt-1 font-medium">↳ {data.biasShift}</p>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground">
            {isProspective
              ? `${data.prospectiveDecisions} prospective decisions · ${data.excludedDecisions} retrospective/legacy excluded · Model v${data.modelVersion || 1}`
              : `${data.excludedDecisions} legacy decisions excluded from certification · Model v${data.modelVersion || 1}`}
          </span>
        </div>
        {isProspective && data.prospectiveDecisions < 12 && (
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
            <span className="text-[11px] text-warning font-medium">
              {12 - data.prospectiveDecisions} more forward outcomes to strengthen evidence
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default CalibrationProgress;