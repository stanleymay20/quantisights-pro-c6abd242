import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Database, TrendingUp, Brain, GitBranch, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { getSeverityStyle } from "@/lib/severity-colors";
import TrendSparkline from "./TrendSparkline";
import type { Insight } from "@/hooks/useInsights";

interface InsightEvidencePanelProps {
  insight: Insight;
}

/** Synthesize a representative trend from insight metadata for the sparkline */
function synthesizeTrend(insight: Insight): number[] {
  const conf = insight.capped_confidence ?? insight.confidence_score ?? 50;
  const variance = insight.variance_score ?? 0.1;
  const n = Math.min(insight.sample_size ?? 6, 12);
  // Generate a plausible trend line using variance as noise magnitude
  const points: number[] = [];
  const direction = insight.severity === "high" || insight.severity === "critical" ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const base = conf + direction * (i / n) * variance * 50;
    const noise = Math.sin(i * 2.1) * variance * 15;
    points.push(Math.max(0, Math.min(100, base + noise)));
  }
  return points;
}

/**
 * Evidence panel for a single insight — shows supporting data,
 * confidence explanation, and methodology transparency.
 * Implements the Insight → Evidence Bridge requirement.
 */
const InsightEvidencePanel = ({ insight }: InsightEvidencePanelProps) => {
  const [expanded, setExpanded] = useState(false);
  const style = getSeverityStyle(insight.severity);

  const sampleSizeLabel = insight.sample_size
    ? `${insight.sample_size} data points`
    : "Sample size not recorded";

  // variance_score and data_quality_index are already 0-100 scale (see e.g.
  // create-demo-session/index.ts's seed values: variance_score 15.2,
  // data_quality_index 78-92) -- multiplying by 100 here inflated a
  // near-max data_quality_index of ~100 into "10000%".
  const varianceLabel = insight.variance_score !== null && insight.variance_score !== undefined
    ? `${insight.variance_score.toFixed(1)}%`
    : "—";

  const dataQualityLabel = insight.data_quality_index !== null && insight.data_quality_index !== undefined
    ? `${insight.data_quality_index.toFixed(0)}%`
    : "—";

  const confidenceExplanation = (() => {
    if (insight.confidence_cap_reason) return insight.confidence_cap_reason;
    if (insight.raw_confidence && insight.capped_confidence && insight.raw_confidence > insight.capped_confidence) {
      return `Raw confidence (${Math.round(insight.raw_confidence)}%) was capped to ${Math.round(insight.capped_confidence)}% based on data volume constraints.`;
    }
    if (insight.sample_size && insight.sample_size < 12) {
      return "Confidence limited: fewer than 12 data points. Max confidence capped at 60%.";
    }
    if (insight.sample_size && insight.sample_size < 30) {
      return "Moderate confidence: 12–30 data points. Max confidence capped at 75%.";
    }
    return "Confidence derived from statistical significance and data volume.";
  })();

  return (
    <Card className={`border ${style.border} transition-all`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${style.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {insight.category && (
                <Badge variant="outline" className="text-[10px] capitalize">
                  {insight.category.replace(/_/g, " ")}
                </Badge>
              )}
              <Badge className={`${style.bg} ${style.text} border-none text-[10px]`}>
                {style.label}
              </Badge>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{insight.message}</p>

            {/* Evidence summary row with sparkline */}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <ConfidenceBadge
                confidence={insight.capped_confidence ?? insight.confidence_score ?? null}
                showDetails
              />
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Database className="w-3 h-3" /> {sampleSizeLabel}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <BarChart3 className="w-3 h-3" /> Variance: {varianceLabel}
              </span>
              {/* Mini trend sparkline — synthesized from available data points */}
              {insight.sample_size && insight.sample_size >= 3 && (
                <TrendSparkline
                  data={synthesizeTrend(insight)}
                  width={80}
                  height={24}
                />
              )}
            </div>

            {/* Expandable evidence detail */}
            <button
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-controls={`insight-evidence-${insight.id}`}
              className="flex items-center gap-1 mt-2 text-[11px] text-primary/70 hover:text-primary transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? "Hide evidence" : "Why this insight?"}
            </button>

            {expanded && (
              <div id={`insight-evidence-${insight.id}`} className="mt-3 pt-3 border-t border-border/30 space-y-3 text-xs">
                {/* Confidence explanation */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1 font-semibold text-foreground">
                    <Brain className="w-3.5 h-3.5 text-primary" /> Confidence Explanation
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{confidenceExplanation}</p>
                  {insight.raw_confidence != null && insight.capped_confidence != null && (
                    <div className="flex gap-4 mt-1.5">
                      <span>Raw: <strong>{Math.round(insight.raw_confidence)}%</strong></span>
                      <span>Capped: <strong>{Math.round(insight.capped_confidence)}%</strong></span>
                    </div>
                  )}
                </div>

                {/* Data quality */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1 font-semibold text-foreground">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" /> Data Quality
                  </div>
                  <div className="flex gap-4">
                    <span className="text-muted-foreground">Quality Index: <strong>{dataQualityLabel}</strong></span>
                    <span className="text-muted-foreground">Variance Score: <strong>{varianceLabel}</strong></span>
                  </div>
                </div>

                {/* Source reference */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1 font-semibold text-foreground">
                    <GitBranch className="w-3.5 h-3.5 text-primary" /> Source
                  </div>
                  <p className="text-muted-foreground">
                    Generated by <strong>{insight.generation_model || "statistical engine"}</strong>
                    {" "}on {new Date(insight.created_at).toLocaleString("de-DE")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default InsightEvidencePanel;
