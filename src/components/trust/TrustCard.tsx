/**
 * TrustCard — Phase 5.5
 *
 * Universal expandable trust layer for every Decision Brief surface.
 * Answers: "Why should I trust this recommendation?"
 *
 * Surfaces this is mounted on:
 *   - Home Decision Briefs (CopilotHome)
 *   - Decision Ledger (DecisionLedger)
 *   - Deliberation
 *   - AI Boardroom
 *   - Executive Intelligence
 *   - Advisory recommendations
 *   - Copilot-generated Briefs
 *
 * Design principles:
 *   - Collapsed by default — never adds cognitive load unless user asks
 *   - Renders only what exists — no synthetic values, no invented scores
 *   - Single component, single source of truth
 *   - All data passed as props — no internal Supabase calls
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Shield, Database, GitBranch, CheckCircle2, AlertTriangle, TrendingUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrustCardData {
  /** Confidence score 0–100 */
  confidence?: number | null;
  /** Confidence cap reason — why confidence was capped */
  confidenceCapReason?: string | null;
  /** Raw confidence before calibration */
  rawConfidence?: number | null;
  /** Evidence sources array from decision_ledger.evidence_sources */
  evidenceSources?: Array<{ label?: string; source?: string; type?: string }> | null;
  /** Evidence status: verified | partial | missing */
  evidenceStatus?: "verified" | "partial" | "missing" | null;
  /** Data quality score 0–100 */
  dataQualityScore?: number | null;
  /** Dataset name */
  datasetName?: string | null;
  /** Dataset last refreshed */
  datasetFreshnessAt?: string | null;
  /** Lineage route to link to */
  lineagePath?: string | null;
  /** Governance status */
  governanceStatus?: "compliant" | "partial" | "not_assessed" | null;
  /** Governance model name */
  governanceModel?: string | null;
  /** Number of similar past decisions */
  similarDecisionCount?: number | null;
  /** Historical success rate 0–100 */
  historicalSuccessRate?: number | null;
  /** Prediction accuracy score from past decisions */
  predictionAccuracy?: number | null;
  /** Source type for labelling */
  sourceKind?: "advisory" | "decision" | "boardroom" | "brief" | "copilot" | "generic";
}

interface TrustCardProps {
  data: TrustCardData;
  className?: string;
  /** If true, renders a minimal inline strip instead of full expandable card */
  compact?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function confidenceColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-destructive";
}

function confidenceLabel(score: number) {
  if (score >= 80) return "High";
  if (score >= 60) return "Moderate";
  return "Low";
}

function qualityColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-destructive";
}

function govBadge(status: TrustCardData["governanceStatus"]) {
  if (status === "compliant") return { label: "Compliant", cls: "text-emerald-600 border-emerald-500/30 bg-emerald-500/10" };
  if (status === "partial")   return { label: "Partial",   cls: "text-amber-600 border-amber-500/30 bg-amber-500/10" };
  return { label: "Not assessed", cls: "text-muted-foreground border-border bg-muted/40" };
}

function formatDate(iso?: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }); }
  catch { return null; }
}

function normaliseEvidenceSources(raw: TrustCardData["evidenceSources"]): { label: string; type?: string }[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.slice(0, 8).map((s: any) => ({
    label: s?.label || s?.source || s?.table || s?.name || String(s).slice(0, 40) || "Source",
    type: s?.type || s?.kind,
  }));
}

// ─── Compact strip ────────────────────────────────────────────────────────────

function TrustStrip({ data }: { data: TrustCardData }) {
  const evidenceCount = normaliseEvidenceSources(data.evidenceSources).length;
  return (
    <div className="flex items-center gap-2 flex-wrap text-[11px]">
      {data.confidence != null && (
        <span className={cn("font-semibold", confidenceColor(data.confidence))}>
          {Number(data.confidence).toFixed(1)}% confidence
        </span>
      )}
      {evidenceCount > 0 && (
        <span className="text-muted-foreground">{evidenceCount} source{evidenceCount !== 1 ? "s" : ""}</span>
      )}
      {data.dataQualityScore != null && (
        <span className={cn("font-medium", qualityColor(data.dataQualityScore))}>
          DQ {data.dataQualityScore}%
        </span>
      )}
      {data.governanceStatus && (
        <Badge variant="outline" className={cn("text-[9px] py-0 h-4", govBadge(data.governanceStatus).cls)}>
          {govBadge(data.governanceStatus).label}
        </Badge>
      )}
    </div>
  );
}

// ─── Full card ────────────────────────────────────────────────────────────────

export default function TrustCard({ data, className, compact = false }: TrustCardProps) {
  const [open, setOpen] = useState(false);

  if (compact) return <TrustStrip data={data} />;

  const sources = normaliseEvidenceSources(data.evidenceSources);
  const gov = govBadge(data.governanceStatus);
  const freshnessLabel = formatDate(data.datasetFreshnessAt);
  // Same heuristic-detection rule used by ConfidenceBadge.tsx and the trust
  // adapter, kept consistent here so TrustCard doesn't silently show a
  // heuristic-derived confidence percentage as if it were fully calibrated.
  const isHeuristicConfidence = Boolean(
    data.confidenceCapReason && String(data.confidenceCapReason).toLowerCase().includes("heuristic")
  );

  return (
    <div className={cn("border border-border/40 rounded-lg overflow-hidden", className)}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Trust</span>
          </div>

          {/* Quick summary chips */}
          {data.confidence != null && (
            <span className={cn("text-[11px] font-semibold", confidenceColor(data.confidence))}>
              {Number(data.confidence).toFixed(1)}% · {confidenceLabel(data.confidence)}
            </span>
          )}
          {sources.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{sources.length} source{sources.length !== 1 ? "s" : ""}</span>
          )}
          {data.governanceStatus && (
            <Badge variant="outline" className={cn("text-[9px] py-0 h-4", gov.cls)}>
              {gov.label}
            </Badge>
          )}
        </div>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        }
      </button>

      {/* Expanded body */}
      {open && (
        <div className="px-3 py-3 space-y-3 bg-background/60">

          {/* Row 1: Confidence + Data Quality */}
          <div className="grid grid-cols-2 gap-3">

            {/* Confidence */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</p>
              {data.confidence != null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("text-xl font-bold tracking-tight", confidenceColor(data.confidence))}>
                      {Number(data.confidence).toFixed(1)}%
                    </span>
                    <span className={cn("text-xs font-medium", confidenceColor(data.confidence))}>
                      {confidenceLabel(data.confidence)}
                    </span>
                    {isHeuristicConfidence && (
                      <span className="text-[10px] text-amber-600 dark:text-amber-400" title="Heuristic estimate — not a fully calibrated statistical confidence">
                        ⚠ heuristic
                      </span>
                    )}
                  </div>
                  <Progress value={data.confidence} className="h-1.5" />
                  {data.confidenceCapReason && (
                    <p className="text-[10px] text-muted-foreground/70 italic">{data.confidenceCapReason}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Not scored yet</p>
              )}
            </div>

            {/* Data Quality */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data quality</p>
              {data.dataQualityScore != null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn("text-xl font-bold tracking-tight", qualityColor(data.dataQualityScore))}>
                      {data.dataQualityScore}%
                    </span>
                  </div>
                  <Progress value={data.dataQualityScore} className="h-1.5" />
                  {data.datasetName && (
                    <p className="text-[10px] text-muted-foreground/70 truncate">{data.datasetName}</p>
                  )}
                  {freshnessLabel && (
                    <p className="text-[10px] text-muted-foreground/70">Refreshed {freshnessLabel}</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No quality data</p>
              )}
            </div>
          </div>

          {/* Row 2: Evidence sources */}
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Evidence sources ({sources.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((s, i) => (
                  <div key={i} className="flex items-center gap-1 bg-muted/40 rounded px-2 py-0.5">
                    <Database className="w-2.5 h-2.5 text-primary shrink-0" />
                    <span className="text-[10px] text-foreground/80">{s.label}</span>
                    {s.type && <span className="text-[9px] text-muted-foreground/60">· {s.type}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Row 3: Governance + Lineage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Governance</p>
              <Badge variant="outline" className={cn("text-[10px]", gov.cls)}>
                {data.governanceStatus === "compliant"
                  ? <CheckCircle2 className="w-3 h-3 mr-1" />
                  : <AlertTriangle className="w-3 h-3 mr-1" />
                }
                {gov.label}
              </Badge>
              {data.governanceModel && (
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{data.governanceModel}</p>
              )}
            </div>
            {data.lineagePath && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Data lineage</p>
                <Link
                  to={data.lineagePath}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <GitBranch className="w-3 h-3" />
                  View source chain
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>
            )}
          </div>

          {/* Row 4: Outcome history */}
          {(data.similarDecisionCount != null || data.historicalSuccessRate != null || data.predictionAccuracy != null) && (
            <div className="space-y-1.5 border-t border-border/30 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Outcome history
              </p>
              <div className="flex items-center gap-4">
                {data.similarDecisionCount != null && (
                  <div>
                    <p className="text-lg font-bold">{data.similarDecisionCount}</p>
                    <p className="text-[10px] text-muted-foreground">Similar decisions</p>
                  </div>
                )}
                {data.historicalSuccessRate != null && (
                  <div>
                    <p className="text-lg font-bold text-emerald-600">{data.historicalSuccessRate}%</p>
                    <p className="text-[10px] text-muted-foreground">Success rate</p>
                  </div>
                )}
                {data.predictionAccuracy != null && (
                  <div>
                    <p className="text-lg font-bold">{data.predictionAccuracy.toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground">Prediction accuracy</p>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/**
 * Build a TrustCardData object from a raw decision_ledger row.
 * Handles the JSON evidence_sources field safely.
 */
export function trustCardFromDecision(d: Record<string, unknown>, dataQualityScore?: number | null): TrustCardData {
  let sources: TrustCardData["evidenceSources"] = null;
  try {
    const raw = d?.evidence_sources;
    if (Array.isArray(raw)) sources = raw;
    else if (typeof raw === "string") sources = JSON.parse(raw);
    else if (raw && typeof raw === "object") sources = [raw as Record<string, unknown>];
  } catch {}

  const rec = d as Record<string, any>;
  return {
    confidence: rec?.capped_confidence ?? rec?.confidence ?? null,
    confidenceCapReason: rec?.confidence_cap_reason ?? null,
    rawConfidence: rec?.raw_confidence ?? null,
    evidenceSources: sources,
    evidenceStatus: sources && sources.length > 0 ? "verified" : rec?.evidence_sources ? "partial" : "missing",
    dataQualityScore: dataQualityScore ?? rec?.data_quality_index ?? null,
    governanceStatus: rec?.governance_model_version ? "compliant" : rec?.decision_status === "approved" ? "partial" : "not_assessed",
    governanceModel: rec?.governance_model ?? null,
    predictionAccuracy: rec?.prediction_accuracy_score ?? null,
    lineagePath: "/lineage",
    sourceKind: "decision",
  };
}
