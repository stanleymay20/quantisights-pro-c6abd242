import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, CircleHelp, ShieldCheck, TriangleAlert } from "lucide-react";
import type { DecisionOptionModel } from "@/lib/decision-options";

interface DecisionOptionComparisonProps {
  options: DecisionOptionModel[];
}

function formatImpact(option: DecisionOptionModel): string {
  if (option.impact.status === "modeled" && typeof option.impact.value === "number") {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(option.impact.value);
  }
  return option.impact.label;
}

function formatConfidence(option: DecisionOptionModel): string {
  if (option.confidence.status === "modeled" && typeof option.confidence.value === "number") {
    return `${Math.round(option.confidence.value)}%`;
  }
  return "Unmodeled";
}

const DecisionOptionComparison = ({ options }: DecisionOptionComparisonProps) => (
  <section className="space-y-3" aria-labelledby="decision-options-title">
    <div>
      <h3 id="decision-options-title" className="text-sm font-semibold">Decision options</h3>
      <p className="text-xs text-muted-foreground mt-1">
        Only evidence-backed model outputs are shown numerically. Unsimulated alternatives remain explicitly unmodeled.
      </p>
    </div>

    <div className="grid gap-3 xl:grid-cols-2">
      {options.map((option) => {
        const evidenceIcon = option.evidenceStatus === "verified"
          ? ShieldCheck
          : option.evidenceStatus === "partial"
            ? CircleHelp
            : TriangleAlert;
        const EvidenceIcon = evidenceIcon;

        return (
          <Card key={option.id} className={option.isRecommended ? "p-4 border-primary/40 bg-primary/[0.03]" : "p-4"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold">{option.title}</h4>
                  {option.isRecommended && (
                    <Badge className="text-[10px] gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Recommended
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {option.evidenceStatus} evidence
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{option.action}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-md border border-border/50 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Impact</div>
                <div className="text-xs font-medium mt-1">{formatImpact(option)}</div>
                {option.impact.status === "modeled" && <div className="text-[10px] text-muted-foreground mt-1">{option.impact.label}</div>}
              </div>
              <div className="rounded-md border border-border/50 p-2.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</div>
                <div className="text-xs font-medium mt-1">{formatConfidence(option)}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{option.confidence.label}</div>
              </div>
            </div>

            <div className="mt-3 flex items-start gap-2 text-[11px] text-muted-foreground">
              <EvidenceIcon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{option.evidenceLabel}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2 mt-4">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Assumptions</div>
                <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
                  {option.assumptions.slice(0, 3).map((assumption) => <li key={assumption}>{assumption}</li>)}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Risks</div>
                <ul className="space-y-1 text-[11px] text-muted-foreground list-disc pl-4">
                  {option.risks.slice(0, 3).map((risk) => <li key={risk}>{risk}</li>)}
                </ul>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-4">{option.rationale}</p>
          </Card>
        );
      })}
    </div>
  </section>
);

export default DecisionOptionComparison;
