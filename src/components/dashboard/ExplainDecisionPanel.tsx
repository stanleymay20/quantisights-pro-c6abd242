/**
 * ExplainDecisionPanel — "Why this decision?"
 *
 * Data-driven explanation panel. No LLM-style prose.
 * Every line anchored to a metric, dataset, or rule.
 * 
 * Book-aligned: SUDAL Evidence Classification + EWMA Stats
 */

import { useState } from "react";
import {
  ChevronDown, ChevronUp, Database, TrendingDown, 
  Cpu, Target, ShieldCheck, AlertTriangle, Clock, Tag, Info,
  Activity, Beaker,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import DualLayerEvidencePanel from "@/components/dashboard/DualLayerEvidencePanel";

export interface ExplanationMetadata {
  source_data?: {
    dataset_name?: string;
    dataset_id?: string;
    time_range?: string;
    rows_analyzed?: number;
    key_metrics?: string[];
  };
  statistical_basis?: {
    method?: string;
    ewma_baseline?: number;
    ewma_std?: number;
    z_score?: number;
    deviation_magnitude?: number;
    is_anomaly?: boolean;
    alpha?: number;
    k_sigma?: number;
    data_points_used?: number;
    note?: string;
  };
  triggering_insight?: {
    pattern_type?: string;
    description?: string;
    metric_name?: string;
    change_value?: string;
    change_direction?: string;
  };
  reasoning?: {
    what_happened?: string;
    why_it_matters?: string;
    why_this_recommendation?: string;
  };
  recommendation_logic?: {
    method?: string;
    description?: string;
    rule_name?: string | null;
    rule_version?: number | null;
  };
  expected_impact?: {
    range?: string;
    basis?: string;
  };
  confidence_explanation?: {
    score?: number;
    meaning?: string;
    capped?: boolean;
    cap_reason?: string;
  };
  assumptions?: string[];
  limitations?: string[];
  evidence_classification?: string;
  dual_layer_enrichment?: {
    enrichment_id?: string | null;
    client_evidence_summary?: string | null;
    internal_context_summary?: string | null;
    combined_interpretation?: string | null;
    client_confidence?: number | null;
    enriched_confidence?: number | null;
    confidence_delta?: number | null;
    blending_rule?: string | null;
  } | null;
}

interface Props {
  explanation: ExplanationMetadata | null | undefined;
  sourceInsightSummary?: string | null;
  recommendationLogicType?: string | null;
  decisionOrigin?: string;
  createdAt?: string;
  advisoryInstanceId?: string | null;
  datasetId?: string | null;
  confidenceAtDecision?: number | null;
  cappedConfidence?: number | null;
  rawConfidence?: number | null;
  confidenceCapReason?: string | null;
}

const LOGIC_LABELS: Record<string, string> = {
  trend_detection: "Trend Detection",
  threshold_breach: "Threshold Breach",
  forecast_deviation: "Forecast Deviation",
  anomaly_detection: "Anomaly Detection",
  correlation_analysis: "Correlation Analysis",
  statistical_inference: "Statistical Inference",
  externalized_rule_engine: "Rule Engine",
};

const EVIDENCE_COLORS: Record<string, string> = {
  "OBSERVED_FACT + RULE_BASED_ACTION": "text-emerald-400 border-emerald-400/30",
  "STATISTICAL_INFERENCE": "text-sky-400 border-sky-400/30",
  "RULE_BASED_ACTION": "text-violet-400 border-violet-400/30",
  "HEURISTIC_ESTIMATE": "text-amber-400 border-amber-400/30",
};

const ExplainDecisionPanel = ({
  explanation,
  sourceInsightSummary,
  recommendationLogicType,
  decisionOrigin = "ai_generated",
  createdAt,
  advisoryInstanceId,
  datasetId,
  confidenceAtDecision,
  cappedConfidence,
  rawConfidence,
  confidenceCapReason,
}: Props) => {
  const [expanded, setExpanded] = useState(false);

  const meta = explanation ?? {};
  const hasExplanation = explanation || sourceInsightSummary || recommendationLogicType;

  return (
    <div className="border border-border/40 rounded-lg overflow-hidden bg-card/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-muted/30 transition-colors"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Why this decision?</span>
          {decisionOrigin === "ai_generated" && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              AI-Generated
            </Badge>
          )}
          {meta.evidence_classification && (
            <Badge variant="outline" className={`text-[10px] ${EVIDENCE_COLORS[meta.evidence_classification] ?? "text-muted-foreground"}`}>
              {meta.evidence_classification}
            </Badge>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/20 pt-3">
          {/* Dual-Layer Evidence (always first if present) */}
          {meta.dual_layer_enrichment && (
            <DualLayerEvidencePanel evidence={meta.dual_layer_enrichment} variant="full" />
          )}

          {/* Metadata bar */}
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground font-mono">
            {createdAt && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(createdAt).toISOString().slice(0, 16).replace("T", " ")}
              </span>
            )}
            {advisoryInstanceId && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                src:{advisoryInstanceId.slice(0, 8)}
              </span>
            )}
            {(datasetId || meta.source_data?.dataset_id) && (
              <span className="flex items-center gap-1">
                <Database className="w-3 h-3" />
                ds:{(datasetId ?? meta.source_data?.dataset_id ?? "").slice(0, 8)}
              </span>
            )}
          </div>

          {/* 1. Source Data */}
          {meta.source_data && (
            <Section icon={Database} title="Source Data">
              <DataRow label="Dataset" value={meta.source_data.dataset_name} />
              <DataRow label="Period" value={meta.source_data.time_range} />
              <DataRow
                label="Sample"
                value={meta.source_data.rows_analyzed != null ? `${meta.source_data.rows_analyzed.toLocaleString()} rows` : null}
              />
              <DataRow
                label="Metrics"
                value={meta.source_data.key_metrics?.length ? meta.source_data.key_metrics.join(", ") : null}
              />
            </Section>
          )}

          {/* 2. Statistical Basis (EWMA) */}
          {meta.statistical_basis && (
            <Section icon={Activity} title="Statistical Basis">
              <DataRow label="Method" value={meta.statistical_basis.method} />
              {meta.statistical_basis.z_score != null && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Z-Score:</span>{" "}
                  <span className={`font-mono font-bold ${Math.abs(meta.statistical_basis.z_score) >= 3 ? "text-destructive" : Math.abs(meta.statistical_basis.z_score) >= 2 ? "text-warning" : "text-emerald-400"}`}>
                    {meta.statistical_basis.z_score > 0 ? "+" : ""}{meta.statistical_basis.z_score}
                  </span>
                  {meta.statistical_basis.is_anomaly && (
                    <Badge variant="destructive" className="text-[9px] ml-2">ANOMALY</Badge>
                  )}
                </div>
              )}
              {meta.statistical_basis.ewma_baseline != null && (
                <DataRow label="EWMA Baseline" value={meta.statistical_basis.ewma_baseline.toFixed(4)} />
              )}
              {meta.statistical_basis.ewma_std != null && (
                <DataRow label="EWMA σ" value={meta.statistical_basis.ewma_std.toFixed(4)} />
              )}
              {meta.statistical_basis.deviation_magnitude != null && (
                <DataRow label="Deviation" value={meta.statistical_basis.deviation_magnitude.toFixed(4)} />
              )}
              {meta.statistical_basis.data_points_used != null && (
                <DataRow label="Data Points" value={`${meta.statistical_basis.data_points_used}`} />
              )}
              {meta.statistical_basis.alpha != null && (
                <div className="text-[10px] text-muted-foreground/60 font-mono mt-1">
                  α={meta.statistical_basis.alpha} · k={meta.statistical_basis.k_sigma}σ
                </div>
              )}
              {meta.statistical_basis.note && (
                <p className="text-[10px] text-muted-foreground/60 italic">{meta.statistical_basis.note}</p>
              )}
            </Section>
          )}

          {/* 3. Trigger */}
          <Section icon={TrendingDown} title="Trigger">
            {meta.triggering_insight ? (
              <div className="space-y-1">
                {meta.triggering_insight.metric_name && meta.triggering_insight.change_value && (
                  <p className="text-sm font-medium text-foreground">
                    {meta.triggering_insight.metric_name}: {meta.triggering_insight.change_direction === "decrease" ? "↓" : meta.triggering_insight.change_direction === "increase" ? "↑" : "Δ"} {meta.triggering_insight.change_value}
                  </p>
                )}
                {meta.triggering_insight.description && (
                  <p className="text-xs text-muted-foreground">{meta.triggering_insight.description}</p>
                )}
                {meta.triggering_insight.pattern_type && (
                  <Badge variant="secondary" className="text-[10px]">
                    {LOGIC_LABELS[meta.triggering_insight.pattern_type] ?? meta.triggering_insight.pattern_type}
                  </Badge>
                )}
              </div>
            ) : sourceInsightSummary ? (
              <p className="text-xs text-muted-foreground">{sourceInsightSummary}</p>
            ) : (
              <p className="text-xs text-muted-foreground/60">No trigger recorded</p>
            )}
          </Section>

          {/* 4. Analysis */}
          {meta.reasoning && (
            <Section icon={Target} title="Analysis">
              <DataRow label="Signal" value={meta.reasoning.what_happened} />
              <DataRow label="Impact" value={meta.reasoning.why_it_matters} />
              <DataRow label="Action basis" value={meta.reasoning.why_this_recommendation} />
            </Section>
          )}

          {/* 5. Method */}
          <Section icon={Cpu} title="Method">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                {recommendationLogicType && (
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {LOGIC_LABELS[recommendationLogicType] ?? recommendationLogicType}
                  </Badge>
                )}
                {meta.recommendation_logic?.rule_name && (
                  <Badge variant="secondary" className="text-[10px]">
                    Rule: {meta.recommendation_logic.rule_name} v{meta.recommendation_logic.rule_version}
                  </Badge>
                )}
              </div>
              {meta.recommendation_logic?.description && (
                <span className="text-xs text-muted-foreground">{meta.recommendation_logic.description}</span>
              )}
              {!recommendationLogicType && !meta.recommendation_logic && (
                <span className="text-xs text-muted-foreground/60">Statistical pattern analysis</span>
              )}
            </div>
          </Section>

          {/* 6. Expected Impact */}
          {meta.expected_impact && (meta.expected_impact.range || meta.expected_impact.basis) && (
            <Section icon={Target} title="Expected Impact">
              <DataRow label="Range" value={meta.expected_impact.range} />
              <DataRow label="Basis" value={meta.expected_impact.basis} />
            </Section>
          )}

          {/* 7. Confidence */}
          <Section icon={ShieldCheck} title="Confidence">
            <div className="flex items-center gap-3">
              {(confidenceAtDecision ?? cappedConfidence ?? rawConfidence) != null && (
                <span className="text-lg font-bold font-mono text-foreground">
                  {confidenceAtDecision ?? cappedConfidence ?? rawConfidence}%
                </span>
              )}
              {rawConfidence != null && cappedConfidence != null && rawConfidence !== cappedConfidence && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  raw {Math.round(rawConfidence)}% → capped {Math.round(cappedConfidence)}%
                </span>
              )}
            </div>
            {meta.confidence_explanation?.meaning && (
              <p className="text-xs text-muted-foreground mt-1">{meta.confidence_explanation.meaning}</p>
            )}
            {(confidenceCapReason || meta.confidence_explanation?.cap_reason) && (
              <p className="text-[11px] text-warning mt-1">
                Cap: {confidenceCapReason ?? meta.confidence_explanation?.cap_reason}
              </p>
            )}
          </Section>

          {/* 8. Assumptions */}
          {meta.assumptions && meta.assumptions.length > 0 && (
            <Section icon={AlertTriangle} title="Assumptions" iconColor="text-warning">
              <ul className="space-y-0.5">
                {meta.assumptions.map((a, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-warning shrink-0">•</span>{a}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Limitations */}
          {meta.limitations && meta.limitations.length > 0 && (
            <Section icon={AlertTriangle} title="Limitations" iconColor="text-destructive">
              <ul className="space-y-0.5">
                {meta.limitations.map((l, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <span className="text-destructive shrink-0">•</span>{l}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Evidence Classification */}
          {meta.evidence_classification && (
            <Section icon={Beaker} title="Evidence Grade">
              <div className="text-xs font-mono text-muted-foreground">
                {meta.evidence_classification}
              </div>
            </Section>
          )}

          {!hasExplanation && (
            <p className="text-xs text-muted-foreground/60">
              No explanation metadata. Decision predates explainability system.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/* ----- helpers ----- */

function Section({
  icon: Icon,
  title,
  iconColor = "text-muted-foreground",
  children,
}: {
  icon: typeof Database;
  title: string;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3 h-3 ${iconColor}`} />
        <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">{title}</span>
      </div>
      <div className="pl-[18px]">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {value}
    </div>
  );
}

export default ExplainDecisionPanel;
