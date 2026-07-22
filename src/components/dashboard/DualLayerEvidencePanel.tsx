/**
 * DualLayerEvidencePanel — provenance-aware evidence display.
 *
 * Three-section layout enforced by the dual-layer doctrine:
 *   1. "Based on your data" (Layer A — client truth)
 *   2. "Context from external/internal signals" (Layer B)
 *   3. "Final recommendation" (Layer C — synthesis)
 *
 * Compact (advisory cards) or full (decision panel).
 */
import { Database, Globe2, Sparkles, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface DualLayerEvidence {
  client_evidence_summary?: string | null;
  internal_context_summary?: string | null;
  combined_interpretation?: string | null;
  client_confidence?: number | null;
  enriched_confidence?: number | null;
  confidence_delta?: number | null;
  blending_rule?: string | null;
}

const RULE_LABEL: Record<string, { label: string; tone: string }> = {
  headwind_dampening: { label: "Headwind detected — confidence reduced", tone: "text-warning border-warning/30" },
  tailwind_reinforcement: { label: "Tailwind detected — confidence reinforced", tone: "text-success border-success/30" },
  context_enriched: { label: "Context enriched", tone: "text-primary border-primary/30" },
  no_context: { label: "No external context applied", tone: "text-muted-foreground border-border" },
};

interface Props {
  evidence: DualLayerEvidence | null | undefined;
  variant?: "compact" | "full";
}

const DualLayerEvidencePanel = ({ evidence, variant = "full" }: Props) => {
  if (!evidence || (!evidence.client_evidence_summary && !evidence.internal_context_summary && !evidence.combined_interpretation)) {
    return null;
  }

  const rule = evidence.blending_rule ?? "no_context";
  const ruleCfg = RULE_LABEL[rule] ?? RULE_LABEL.no_context;
  const delta = evidence.confidence_delta ?? 0;
  const before = evidence.client_confidence ?? null;
  const after = evidence.enriched_confidence ?? null;

  const isCompact = variant === "compact";

  return (
    <div className={`border border-border/40 rounded-lg bg-card/40 ${isCompact ? "p-3 space-y-2.5" : "p-4 space-y-3.5"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Evidence Provenance</span>
        <Badge variant="outline" className={`text-[10px] ${ruleCfg.tone}`}>
          {ruleCfg.label}
        </Badge>
      </div>

      {/* 1. Client truth */}
      <Section
        icon={Database}
        title="Based on your data"
        body={evidence.client_evidence_summary ?? "No client evidence summary recorded"}
        accent="text-emerald-400"
        compact={isCompact}
      />

      {/* 2. External/internal context */}
      <Section
        icon={Globe2}
        title="Context from external & internal signals"
        body={evidence.internal_context_summary ?? "No external context found"}
        accent="text-sky-400"
        compact={isCompact}
      />

      {/* 3. Synthesis */}
      <Section
        icon={Sparkles}
        title="Final recommendation"
        body={evidence.combined_interpretation ?? "Synthesis pending"}
        accent="text-primary"
        compact={isCompact}
      />

      {/* Confidence delta */}
      {before != null && after != null && (
        <div className="flex items-center gap-2 pt-2 border-t border-border/20 text-[11px] font-mono">
          <span className="text-muted-foreground">Confidence:</span>
          <span className="text-foreground">{Math.round(before)}%</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className={`font-semibold ${delta > 0 ? "text-success" : delta < 0 ? "text-warning" : "text-foreground"}`}>
            {Math.round(after)}%
          </span>
          {delta !== 0 && (
            <span className={`text-[10px] ${delta > 0 ? "text-success" : "text-warning"}`}>
              ({delta > 0 ? "+" : ""}{delta}pp)
            </span>
          )}
        </div>
      )}
    </div>
  );
};

function Section({
  icon: Icon, title, body, accent, compact,
}: {
  icon: typeof Database; title: string; body: string; accent: string; compact: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} ${accent}`} />
        <span className={`${compact ? "text-[10px]" : "text-[11px]"} font-semibold text-foreground uppercase tracking-wider`}>
          {title}
        </span>
      </div>
      <p className={`${compact ? "text-xs" : "text-sm"} text-muted-foreground leading-relaxed pl-[18px]`}>
        {body}
      </p>
    </div>
  );
}

export default DualLayerEvidencePanel;
