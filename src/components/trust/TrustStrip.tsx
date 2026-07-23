/**
 * TrustStrip — Phase 8 credibility layer.
 *
 * Renders existing confidence, IQ, evidence, governance and verification fields.
 * It does not calculate a new trust score and never invents missing values.
 */
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import { IQScoreBadge } from "@/components/quality/IQScoreBadge";
import { CheckCircle2, AlertTriangle, ShieldCheck, FileSearch, Clock, Database } from "lucide-react";
import type { TrustStatus, TrustStripRecord } from "./types";
import { TRUST_NOT_AVAILABLE } from "./types";

interface TrustStripProps {
  record: TrustStripRecord;
  variant?: "default" | "compact";
  className?: string;
}

const STATUS_META: Record<TrustStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  verified: { label: "Verified", className: "text-emerald-700 dark:text-emerald-300 border-emerald-500/30 bg-emerald-500/10", icon: CheckCircle2 },
  partial: { label: "Partial", className: "text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/10", icon: AlertTriangle },
  missing: { label: "Missing", className: "text-muted-foreground border-border bg-muted/40", icon: AlertTriangle },
  blocked: { label: "Blocked", className: "text-destructive border-destructive/30 bg-destructive/10", icon: AlertTriangle },
  not_available: { label: TRUST_NOT_AVAILABLE, className: "text-muted-foreground border-border bg-muted/40", icon: AlertTriangle },
};

function formatDate(value?: string | null) {
  if (!value) return TRUST_NOT_AVAILABLE;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return TRUST_NOT_AVAILABLE;
  return date.toLocaleDateString();
}

function StatusBadge({ status, label }: { status?: TrustStatus | null; label: string }) {
  const meta = STATUS_META[status ?? "not_available"];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px]", meta.className)}>
      <Icon className="h-3 w-3" />
      {label}: {meta.label}
    </Badge>
  );
}

export default function TrustStrip({ record, variant = "default", className }: TrustStripProps) {
  const compact = variant === "compact";
  return (
    <Card
      className={cn(
        "border-border/50 bg-muted/20",
        compact ? "p-2" : "p-3",
        className,
      )}
      aria-label={`Trust signals — ${record.source.kind}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wide">
          <ShieldCheck className="h-3 w-3" /> Trust
        </Badge>

        {record.confidence?.value != null ? (
          <ConfidenceBadge
            confidence={record.confidence.meta ?? record.confidence.value}
            showDetails
            isHeuristic={record.confidence.isHeuristic}
          />
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Confidence: {TRUST_NOT_AVAILABLE}</Badge>
        )}

        {record.iq?.organizationId ? (
          <IQScoreBadge organizationId={record.iq.organizationId} datasetId={record.iq.datasetId ?? null} />
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">IQ: {TRUST_NOT_AVAILABLE}</Badge>
        )}

        <StatusBadge status={record.evidenceStatus} label="Evidence" />
        <StatusBadge status={record.governanceStatus} label="Governance" />

        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
          <Database className="h-3 w-3" /> Source: {record.sourceQuality || TRUST_NOT_AVAILABLE}
        </Badge>

        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> Verified: {formatDate(record.lastVerifiedAt)}
        </Badge>

        {record.proofLabel && (
          <Badge variant="outline" className="gap-1 text-[10px] text-primary border-primary/30 bg-primary/5">
            <FileSearch className="h-3 w-3" /> {record.proofLabel}
          </Badge>
        )}
      </div>
    </Card>
  );
}
