import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import OutputClassificationBadge from "@/components/dashboard/OutputClassificationBadge";
import EvidenceChain from "@/components/diagnostics/EvidenceChain";
import {
  Activity, AlertTriangle, TrendingUp, TrendingDown, Minus, Zap,
  Search, ChevronRight, GitCommitHorizontal,
} from "lucide-react";
import type { DiagnosticResult } from "@/pages/Diagnostics";

const SEVERITY_CONFIG = {
  critical: { bg: "bg-destructive/10", border: "border-destructive/30", text: "text-destructive", icon: AlertTriangle, label: "Critical" },
  warning: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", icon: AlertTriangle, label: "Warning" },
  info: { bg: "bg-primary/10", border: "border-primary/30", text: "text-primary", icon: Activity, label: "Healthy" },
};

function getTrendConfig(direction: string) {
  const baseIcons = {
    improving: { icon: TrendingUp, color: "text-success" },
    declining: { icon: TrendingDown, color: "text-destructive" },
    stable: { icon: Minus, color: "text-muted-foreground" },
    volatile: { icon: Zap, color: "text-warning" },
  };
  return baseIcons[direction as keyof typeof baseIcons] || baseIcons.stable;
}

interface DiagnosticCardProps {
  diagnostic: DiagnosticResult;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

const DiagnosticCard = ({ diagnostic: d, index, isExpanded, onToggle }: DiagnosticCardProps) => {
  const config = SEVERITY_CONFIG[d.severity];
  const trend = getTrendConfig(d.trend_direction);
  const TrendIcon = trend.icon;
  const SevIcon = config.icon;
  const structuralBreaks = Array.isArray(d.structural_breaks) ? d.structural_breaks : [];

  const formattedChange = typeof d.change_pct === "number"
    ? `${d.change_pct > 0 ? "+" : ""}${d.change_pct.toFixed(1)}%`
    : "0.0%";

  const associatedEvidence = Array.isArray(d.causal_factors) ? d.causal_factors : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        className={`border ${config.border} cursor-pointer transition-all hover:shadow-lg`}
        onClick={onToggle}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
                <SevIcon className={`w-5 h-5 ${config.text}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                  <h3 className="font-semibold text-base capitalize">{d.metric_type.replace(/_/g, " ")}</h3>
                  <Badge className={`${config.bg} ${config.text} border-none text-xs`}>
                    {config.label}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {d.evidence_level === "temporal_break" ? "Temporal-break evidence" : "Descriptive evidence"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Causality not established
                  </Badge>
                  <div className="flex items-center gap-1">
                    <TrendIcon className={`w-4 h-4 ${trend.color}`} />
                    <span className={`text-xs font-medium ${trend.color}`}>
                      {formattedChange}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-foreground/80">{d.diagnosis}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <ConfidenceBadge
                confidence={{
                  raw_confidence: d.raw_confidence,
                  capped_confidence: d.capped_confidence,
                  confidence_cap_reason: d.confidence_cap_reason,
                  sample_size: d.sample_size,
                  data_sufficiency: d.data_sufficiency,
                  variance_score: d.variance_score,
                }}
              />
              <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
            </div>
          </div>

          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="mt-6 pt-6 border-t border-border space-y-5"
            >
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Search className="w-4 h-4 text-primary" />
                  <h4 className="text-sm font-semibold">Driver Hypothesis</h4>
                  <OutputClassificationBadge classification="HEURISTIC_ESTIMATE" compact />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{d.root_cause}</p>
                <p className="text-[11px] text-muted-foreground mt-2">
                  This hypothesis identifies what to investigate. It does not establish that any factor caused the observed change.
                </p>
              </div>

              {associatedEvidence.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold">Associated Statistical Evidence</h4>
                    <OutputClassificationBadge classification="STATISTICAL_INFERENCE" compact />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {associatedEvidence.map((factor, factorIndex) => (
                      <Badge key={factorIndex} variant="outline" className="text-xs">{factor}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {structuralBreaks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <GitCommitHorizontal className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold">Detected Structural Breaks</h4>
                    <OutputClassificationBadge classification="STATISTICAL_INFERENCE" compact />
                  </div>
                  <div className="space-y-2">
                    {structuralBreaks.map((point, pointIndex) => (
                      <div key={`${point.date ?? point.index}-${pointIndex}`} className="rounded-md border border-border/50 p-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{point.date ?? `Observation ${point.index}`}</span>
                        {` · mean ${point.mean_before.toFixed(2)} → ${point.mean_after.toFixed(2)} · ${point.magnitude_pct > 0 ? "+" : ""}${point.magnitude_pct.toFixed(1)}% · break strength ${Math.round(point.significance * 100)}%`}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    A structural break shows that the statistical regime changed around this point; it does not identify the cause of the change.
                  </p>
                </div>
              )}

              {d.recommendation && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-primary" />
                    <h4 className="text-sm font-semibold">Recommended Investigation / Action</h4>
                    <OutputClassificationBadge classification="AI_RECOMMENDATION" compact />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{d.recommendation}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs text-muted-foreground mb-1">Diagnosis Confidence</h4>
                <div className="flex items-center gap-3">
                  <Progress value={d.confidence} className="flex-1 h-2" />
                  <span className="text-sm font-mono font-bold">{Math.round(d.confidence)}%</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground/60">
                  <span>Sample: {d.sample_size} pts</span>
                  <span>Sufficiency: {d.data_sufficiency}</span>
                  <span>Evidence: {d.evidence_level ?? "descriptive"}</span>
                  <span>Causality: {d.causal_status ?? "not_established"}</span>
                  <span>Cap: {d.confidence_cap_reason}</span>
                  {d.adaptive_calibration_applied && (
                    <span>Calibration: v{d.calibration_model_version} ({(d.calibration_correction_applied_pp ?? 0) > 0 ? "+" : ""}{d.calibration_correction_applied_pp}pp)</span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-border/30">
                <EvidenceChain diagnostic={d} />
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default DiagnosticCard;
