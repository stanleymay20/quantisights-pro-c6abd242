import { Database, GitBranch, Cpu, BarChart3, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DiagnosticResult } from "@/pages/Diagnostics";

interface EvidenceChainProps {
  diagnostic: DiagnosticResult;
  datasetName?: string;
}

/** Shows the full reasoning chain: Data → Analysis → Finding → Action */
const EvidenceChain = ({ diagnostic: d, datasetName }: EvidenceChainProps) => {
  const steps = [
    {
      icon: Database,
      label: "Data Source",
      detail: datasetName || "Active dataset",
      sub: `${d.sample_size} data points · ${d.data_sufficiency} sufficiency`,
    },
    {
      icon: BarChart3,
      label: "Statistical Analysis",
      detail: `${d.metric_type.replace(/_/g, " ")} trend: ${d.trend_direction}`,
      sub: `Change: ${d.change_pct > 0 ? "+" : ""}${d.change_pct.toFixed(1)}% · Variance: ${d.variance_score != null ? d.variance_score.toFixed(2) : "N/A"}`,
    },
    {
      icon: Cpu,
      label: "Intelligence Engine",
      detail: d.confidence_source === "adaptive_calibration" ? "Bayesian calibration applied" : "Statistical inference",
      sub: d.adaptive_calibration_applied
        ? `Model v${d.calibration_model_version} · Band: ${d.calibration_band_used} · Correction: ${(d.calibration_correction_applied_pp ?? 0) > 0 ? "+" : ""}${d.calibration_correction_applied_pp}pp`
        : `Confidence: ${Math.round(d.capped_confidence)}% (cap: ${d.confidence_cap_reason})`,
    },
    {
      icon: AlertTriangle,
      label: "Finding",
      detail: d.diagnosis,
      sub: d.root_cause,
    },
    {
      icon: GitBranch,
      label: "Recommended Action",
      detail: d.recommendation,
      sub: null,
    },
  ];

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 mb-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evidence Chain</h4>
        <Badge variant="outline" className="text-[9px]">Traceability</Badge>
      </div>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[15px] top-3 bottom-3 w-px bg-border/50" />

        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="relative flex items-start gap-3 pb-4 last:pb-0">
              <div className="w-[31px] h-[31px] rounded-lg bg-muted/50 flex items-center justify-center shrink-0 z-10 border border-border/30">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{step.label}</p>
                <p className="text-[12px] text-foreground/80 leading-relaxed mt-0.5">{step.detail}</p>
                {step.sub && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{step.sub}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EvidenceChain;
