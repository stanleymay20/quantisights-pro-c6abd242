/**
 * ExplainabilityPanel — Phase 6 locked contract.
 *
 * Strict composition over existing evidence components. Six sections, fixed
 * order, fixed labels. No new reasoning. Missing data renders "Not Available"
 * via `ExplainabilitySection`.
 *
 * See: .lovable/phase-6-explainability-contract.md
 */
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import ExplainabilitySection from "./ExplainabilitySection";
import {
  hasExplainabilityContent,
  type ExplainabilityRecord,
} from "./types";
import DualLayerEvidencePanel from "@/components/dashboard/DualLayerEvidencePanel";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { IQScoreBadge } from "@/components/quality/IQScoreBadge";

interface ExplainabilityPanelProps {
  record: ExplainabilityRecord;
  variant?: "full" | "compact";
  className?: string;
  /** Hide the source title row. Useful when the parent already shows it. */
  hideHeader?: boolean;
}

const SEVERITY_TONE: Record<NonNullable<ExplainabilityRecord["risks"]>[number]["severity"] & string, string> = {
  low: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  moderate: "text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "text-destructive border-destructive/30",
};

const ExplainabilityPanel = ({
  record,
  variant = "full",
  className,
  hideHeader = false,
}: ExplainabilityPanelProps) => {
  const compact = variant === "compact";

  return (
    <Card
      className={cn(
        "border-border/40",
        compact ? "p-3 space-y-2" : "p-4 space-y-3",
        className,
      )}
      aria-label={`Explainability — ${record.source.title}`}
    >
      {!hideHeader && (
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Badge variant="outline" className="text-[9px] uppercase">
                {record.source.kind}
              </Badge>
            </div>
            <div
              className={cn(
                "font-medium truncate",
                compact ? "text-xs" : "text-sm",
              )}
              title={record.source.title}
            >
              {record.source.title}
            </div>
          </div>
        </header>
      )}

      {/* 1. Why This Matters */}
      <ExplainabilitySection
        index={1}
        title="Why This Matters"
        hasContent={hasExplainabilityContent(record.why)}
        variant={variant}
      >
        <ul className="space-y-1">
          {(record.why ?? []).map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-primary/50 shrink-0">›</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </ExplainabilitySection>

      {/* 2. Evidence */}
      <ExplainabilitySection
        index={2}
        title="Evidence"
        hasContent={hasExplainabilityContent(record.evidence)}
        variant={variant}
      >
        <div className="space-y-2">
          {record.evidence?.dualLayer ? (
            <DualLayerEvidencePanel
              evidence={record.evidence.dualLayer}
              variant={compact ? "compact" : "full"}
            />
          ) : null}
          {record.evidence?.sources?.length ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
              {record.evidence.sources.map((row, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border/30 py-0.5">
                  <dt className="text-muted-foreground text-[11px]">{row.label}</dt>
                  <dd className="font-medium tabular-nums text-[11px]">{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </ExplainabilitySection>

      {/* 3. Confidence */}
      <ExplainabilitySection
        index={3}
        title="Confidence"
        hasContent={hasExplainabilityContent(record.confidence)}
        variant={variant}
      >
        <div className="flex flex-wrap items-center gap-2">
          {record.confidence?.value != null && (
            <ConfidenceBadge
              confidence={record.confidence.meta ?? record.confidence.value}
              showDetails
            />
          )}
          {record.confidence?.iq && (
            <IQScoreBadge
              organizationId={record.confidence.iq.orgId}
              datasetId={record.confidence.iq.datasetId ?? null}
            />
          )}
          {record.confidence?.meta?.confidence_cap_reason && (
            <span className="text-[10px] text-muted-foreground">
              {record.confidence.meta.confidence_cap_reason}
            </span>
          )}
        </div>
      </ExplainabilitySection>

      {/* 4. Alternatives Considered */}
      <ExplainabilitySection
        index={4}
        title="Alternatives Considered"
        hasContent={hasExplainabilityContent(record.alternatives)}
        variant={variant}
      >
        <ul className="space-y-1">
          {(record.alternatives ?? []).map((alt, i) => (
            <li key={i} className="flex flex-col">
              <span className="font-medium">{alt.label}</span>
              {alt.rationale && (
                <span className="text-muted-foreground text-[11px]">
                  {alt.rationale}
                </span>
              )}
            </li>
          ))}
        </ul>
      </ExplainabilitySection>

      {/* 5. Risks & Tradeoffs */}
      <ExplainabilitySection
        index={5}
        title="Risks & Tradeoffs"
        hasContent={hasExplainabilityContent(record.risks)}
        variant={variant}
      >
        <ul className="space-y-1">
          {(record.risks ?? []).map((risk, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 border-b border-border/30 py-0.5"
            >
              <span>{risk.label}</span>
              {risk.severity && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] capitalize",
                    SEVERITY_TONE[risk.severity],
                  )}
                >
                  {risk.severity}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </ExplainabilitySection>

      {/* 6. Expected Impact */}
      <ExplainabilitySection
        index={6}
        title="Expected Impact"
        hasContent={hasExplainabilityContent(record.expectedImpact)}
        variant={variant}
      >
        <div className="space-y-1">
          {record.expectedImpact?.summary && (
            <p>{record.expectedImpact.summary}</p>
          )}
          {record.expectedImpact?.projectedChange && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted-foreground">
                {record.expectedImpact.projectedChange.metric}:
              </span>
              <span
                className={cn(
                  "font-mono font-semibold tabular-nums",
                  record.expectedImpact.projectedChange.delta >= 0
                    ? "text-success"
                    : "text-destructive",
                )}
              >
                {record.expectedImpact.projectedChange.delta >= 0 ? "+" : ""}
                {record.expectedImpact.projectedChange.delta}
                {record.expectedImpact.projectedChange.unit ?? ""}
              </span>
            </div>
          )}
        </div>
      </ExplainabilitySection>
    </Card>
  );
};

export default ExplainabilityPanel;
